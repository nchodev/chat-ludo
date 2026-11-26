import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  AWALE_CLOCK_MS,
  AwaleError,
  DRAUGHTS_CLOCK_MS,
  DraughtsError,
  endAwaleGame,
  endDraughtsGame,
  newAwaleGame,
  newDraughtsGame,
  otherSide,
  playAwaleMove,
  playDraughtsMove,
  ADULT_REQUIRED,
  PREMIUM_CLOSED,
  potSplit,
  stakeConfig,
  type AwaleState,
  type Currency,
  type DraughtsState,
  type DuelGame,
  type DuelQueueStatus,
  type DuelRoomView,
  type DuelState,
  type Side,
  type StakeTable,
} from '@ludo/engine';
import { recordDuelOnlineGame } from './api';
import { archiveGame, getWallet, notAdultConfirmed, openPot, overPremiumCap, refundPot, settlePot } from './db';
import { LINKED_PLAYERS_ERROR, originOf, sameOrigin, type Origin } from './identity';

/** A game resigned or abandoned before this many moves doesn't count, so friends can't farm quick games. */
const MIN_MOVES_TO_COUNT = 10;

/** Ways any of these games can end that don't come from the rules of the game itself. */
type RoomEnd = 'resign' | 'timeout' | 'abandon' | 'agreement';

/** What a room needs to know about a game's rules; moves come from clients and are checked here. */
interface DuelRules {
  newGame(): DuelState;
  /** Plays the move a client sent, after checking its shape; the rules check it is legal. */
  play(state: DuelState, payload: unknown): DuelState;
  end(state: DuelState, winner: Side | null, reason: RoomEnd): DuelState;
  clockMs: number;
  /** Counted for weekly quests: pieces taken (draughts) or captures made (awalé). */
  captures(state: DuelState, side: Side): number;
  /** The state sent to players: the move list and the positions seen stay on the server. */
  publicState(state: DuelState): DuelState;
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const payloadOf = (payload: unknown) => (payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {});

const RULES: Record<DuelGame, DuelRules> = {
  dames: {
    newGame: newDraughtsGame,
    play: (state, payload) => {
      const { from, to, captures } = payloadOf(payload);
      if (!isInt(from, 1, 50) || !isInt(to, 1, 50)) throw new DuelRoomError('Coup invalide.');
      const route = Array.isArray(captures) && captures.length <= 20 && captures.every((c) => isInt(c, 1, 50)) ? (captures as number[]) : undefined;
      try {
        return playDraughtsMove(state as DraughtsState, from, to, route);
      } catch (err) {
        if (err instanceof DraughtsError) throw new DuelRoomError(err.message);
        throw err;
      }
    },
    end: (state, winner, reason) => endDraughtsGame(state as DraughtsState, winner, reason),
    clockMs: DRAUGHTS_CLOCK_MS,
    captures: (state, side) => (state as DraughtsState).history.filter((m) => m.side === side).reduce((n, m) => n + m.captures.length, 0),
    publicState: (state) => ({ ...(state as DraughtsState), history: [], repetitions: {} }),
  },
  awale: {
    newGame: newAwaleGame,
    play: (state, payload) => {
      const { pit } = payloadOf(payload);
      if (!isInt(pit, 0, 11)) throw new DuelRoomError('Coup invalide.');
      try {
        return playAwaleMove(state as AwaleState, pit);
      } catch (err) {
        if (err instanceof AwaleError) throw new DuelRoomError(err.message);
        throw err;
      }
    },
    end: (state, winner, reason) => endAwaleGame(state as AwaleState, winner, reason),
    clockMs: AWALE_CLOCK_MS,
    captures: (state, side) => (state as AwaleState).history.filter((m) => m.side === side && m.seeds > 0).length,
    publicState: (state) => ({ ...(state as AwaleState), history: [], repetitions: {} }),
  },
};

export interface DuelMember {
  token: string;
  name: string;
  socketId: string | null;
  userId?: number;
  forfeitTimer?: NodeJS.Timeout;
  /** Device and address the member last connected from. */
  origin?: Origin;
}

interface DuelStake {
  potId: string;
  table: StakeTable;
  players: Record<Side, number>;
  /** Winner's share when the stakes were taken: a later settings change doesn't affect this game. */
  share: number;
  payout: { winner: string | null; amount: number } | null;
}

export interface DuelRoom {
  kind: DuelGame;
  code: string;
  hostToken: string;
  members: Map<string, DuelMember>;
  /** Tokens of the (at most two) players, in the order they arrived; other members watch. */
  players: string[];
  /** Colour of each player in the current or last game, by index in `players`. */
  colors: Side[] | null;
  game: DuelState | null;
  /** Thinking time left when the side to move started thinking. */
  clock: Record<Side, number> | null;
  turnStartedAt: number;
  timer: NodeJS.Timeout | null;
  drawOffer: Side | null;
  rematchVotes: Set<string>;
  stake?: DuelStake;
  wager?: StakeTable;
  /** Made by quick match. */
  quick?: boolean;
  /** Quick match with a stake: players and stake are fixed, no rematch. */
  matched?: boolean;
  /** Id of the last game counted for the players' progress. */
  recordedGame?: string;
  startedAt?: number;
  lastActivity: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DISCONNECT_FORFEIT_MS = 30_000;
const MAX_MEMBERS = 10;
const MAX_ROOMS = 5000;
const MATCHED_ROOM_ERROR = 'Partie avec mise : relance une recherche depuis la partie rapide.';

export class DuelRoomError extends Error {}

export class DuelManager {
  private rooms = new Map<string, DuelRoom>();

  constructor(private onChange: (room: DuelRoom) => void) {}

  get(code: string): DuelRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  all(): DuelRoom[] {
    return [...this.rooms.values()];
  }

  create(kind: DuelGame, hostName: string, socketId: string, userId?: number): { room: DuelRoom; token: string } {
    if (this.rooms.size >= MAX_ROOMS) throw new DuelRoomError('Le serveur est complet, réessaie dans quelques minutes.');
    let code: string;
    do {
      code = Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.rooms.has(code));
    const token = randomUUID();
    const room: DuelRoom = {
      kind,
      code,
      hostToken: token,
      members: new Map([[token, { token, name: hostName, socketId, userId, origin: originOf(socketId) }]]),
      players: [token],
      colors: null,
      game: null,
      clock: null,
      turnStartedAt: 0,
      timer: null,
      drawOffer: null,
      rematchVotes: new Set(),
      lastActivity: Date.now(),
    };
    this.rooms.set(code, room);
    return { room, token };
  }

  /** Two players found by quick match: the game starts at once, with the stake already taken. */
  createMatch(kind: DuelGame, players: { name: string; socketId: string; userId?: number }[], stake?: { potId: string; table: StakeTable }) {
    const { room, token } = this.create(kind, players[0].name, players[0].socketId, players[0].userId);
    const second = randomUUID();
    room.members.set(second, { token: second, name: players[1].name, socketId: players[1].socketId, userId: players[1].userId, origin: originOf(players[1].socketId) });
    room.players.push(second);
    room.quick = true;
    this.launch(room, stake);
    return { room, tokens: [token, second] };
  }

  join(room: DuelRoom, name: string, socketId: string, token?: string, userId?: number): string {
    const existing =
      (token ? room.members.get(token) : undefined) ??
      (userId ? [...room.members.values()].find((m) => m.userId === userId && room.players.includes(m.token)) : undefined);
    if (existing) {
      existing.socketId = socketId;
      existing.origin = originOf(socketId) ?? existing.origin;
      existing.name = name || existing.name;
      existing.userId = userId ?? existing.userId;
      clearTimeout(existing.forfeitTimer);
      this.touch(room);
      return existing.token;
    }
    if (room.members.size >= MAX_MEMBERS) throw new DuelRoomError('Ce salon est plein.');
    const newToken = randomUUID();
    room.members.set(newToken, { token: newToken, name, socketId, userId, origin: originOf(socketId) });
    if (!room.quick && room.players.length < 2 && !this.playing(room)) room.players.push(newToken);
    this.touch(room);
    return newToken;
  }

  disconnect(room: DuelRoom, token: string) {
    const member = room.members.get(token);
    if (!member) return;
    member.socketId = null;
    if (this.sideOf(room, token) && this.playing(room)) {
      clearTimeout(member.forfeitTimer);
      member.forfeitTimer = setTimeout(() => {
        const side = this.sideOf(room, token);
        if (member.socketId || !side || !this.playing(room)) return;
        this.finish(room, otherSide(side), 'abandon');
      }, DISCONNECT_FORFEIT_MS);
    }
    this.touch(room);
  }

  /** Leaving during a game loses it. */
  leave(room: DuelRoom, token: string) {
    const member = room.members.get(token);
    if (!member) return;
    clearTimeout(member.forfeitTimer);
    const side = this.sideOf(room, token);
    if (side && this.playing(room)) this.finish(room, otherSide(side), 'abandon', false);
    room.members.delete(token);
    const index = room.players.indexOf(token);
    if (index >= 0) {
      room.players.splice(index, 1);
      room.colors?.splice(index, 1);
      // A spectator takes the free place for the next game.
      const spectator = room.quick ? undefined : [...room.members.keys()].find((t) => !room.players.includes(t));
      if (spectator) room.players.push(spectator);
    }
    room.rematchVotes.clear();
    room.drawOffer = null;
    if (room.hostToken === token) {
      const next = [...room.members.values()].find((m) => m.socketId) ?? [...room.members.values()][0];
      if (next) room.hostToken = next.token;
    }
    if (room.members.size === 0) this.delete(room);
    else this.touch(room);
  }

  delete(room: DuelRoom) {
    if (room.timer) clearTimeout(room.timer);
    for (const m of room.members.values()) clearTimeout(m.forfeitTimer);
    if (room.stake && !room.stake.payout) {
      try {
        refundPot(room.stake.potId);
        room.stake.payout = { winner: null, amount: 0 };
      } catch (err) {
        console.error('Remboursement impossible', err);
      }
    }
    this.rooms.delete(room.code);
  }

  setWager(room: DuelRoom, token: string, table: StakeTable | null) {
    this.assertHost(room, token);
    if (room.quick) throw new DuelRoomError('La mise se choisit dans un salon privé.');
    if (this.playing(room)) throw new DuelRoomError('La partie a déjà commencé.');
    const hostId = room.members.get(token)?.userId;
    if (table?.currency === 'premium' && (!hostId || notAdultConfirmed([hostId]).length)) throw new DuelRoomError(ADULT_REQUIRED);
    room.wager = table ?? undefined;
    this.touch(room);
  }

  start(room: DuelRoom, token: string) {
    this.assertHost(room, token);
    if (room.quick) throw new DuelRoomError(MATCHED_ROOM_ERROR);
    if (this.playing(room)) throw new DuelRoomError('La partie a déjà commencé.');
    this.launch(room);
  }

  /** The new game starts when both players asked for it; colours are swapped. */
  rematch(room: DuelRoom, token: string) {
    if (room.matched) throw new DuelRoomError(MATCHED_ROOM_ERROR);
    if (!room.game || room.game.status !== 'over') throw new DuelRoomError("La partie n'est pas terminée.");
    if (!room.players.includes(token)) throw new DuelRoomError('Seuls les joueurs peuvent demander une revanche.');
    if (room.players.length < 2) throw new DuelRoomError('Ton adversaire est parti.');
    room.rematchVotes.add(token);
    if (room.players.some((t) => !room.rematchVotes.has(t))) {
      this.touch(room);
      return;
    }
    try {
      this.launch(room);
    } catch (err) {
      room.rematchVotes.clear();
      this.touch(room);
      throw err;
    }
  }

  move(room: DuelRoom, token: string, payload: unknown) {
    const game = room.game;
    if (!game || game.status !== 'playing') throw new DuelRoomError('Aucune partie en cours.');
    const side = this.sideOf(room, token);
    if (side !== game.turn) throw new DuelRoomError("Ce n'est pas ton tour.");
    if (this.chargeClock(room)) return;
    room.game = RULES[room.kind].play(game, payload);
    room.turnStartedAt = Date.now();
    // Playing a move turns down the opponent's draw offer.
    if (room.drawOffer && room.drawOffer !== side) room.drawOffer = null;
    this.touch(room);
  }

  resign(room: DuelRoom, token: string) {
    const side = this.sideOf(room, token);
    if (!side || !this.playing(room)) throw new DuelRoomError('Aucune partie en cours.');
    this.finish(room, otherSide(side), 'resign');
  }

  draw(room: DuelRoom, token: string) {
    const side = this.sideOf(room, token);
    if (!side || !this.playing(room)) throw new DuelRoomError('Aucune partie en cours.');
    if (room.drawOffer === side) return;
    if (room.drawOffer === otherSide(side)) {
      this.finish(room, null, 'agreement');
      return;
    }
    room.drawOffer = side;
    this.touch(room);
  }

  declineDraw(room: DuelRoom, token: string) {
    const side = this.sideOf(room, token);
    if (!side || room.drawOffer !== otherSide(side)) return;
    room.drawOffer = null;
    this.touch(room);
  }

  view(room: DuelRoom, token: string | undefined): DuelRoomView {
    const you = token ? room.players.indexOf(token) : -1;
    const game = room.game;
    let clock: DuelRoomView['clock'] = null;
    if (room.clock) {
      const running = game?.status === 'playing' ? game.turn : null;
      const left = { ...room.clock };
      if (running) left[running] = Math.max(0, left[running] - (Date.now() - room.turnStartedAt));
      clock = { ...left, running };
    }
    return {
      kind: room.kind,
      code: room.code,
      players: room.players.map((t) => {
        const m = room.members.get(t);
        return {
          name: m?.name ?? 'Joueur parti',
          connected: !!m?.socketId,
          isHost: t === room.hostToken,
          stakeIssue: room.wager ? this.stakeIssue(room.wager, m?.userId) : null,
        };
      }),
      colors: room.colors,
      you: you >= 0 ? you : null,
      yourSide: you >= 0 && room.colors ? room.colors[you] ?? null : null,
      isHost: token === room.hostToken,
      spectators: room.members.size - room.players.length,
      game: game && RULES[room.kind].publicState(game),
      clock,
      drawOffer: room.drawOffer,
      rematch: room.colors ? room.players.flatMap((t, i) => (room.rematchVotes.has(t) && room.colors![i] ? [room.colors![i]] : [])) : [],
      stake: room.stake ? this.stakeView(room.stake) : null,
      wager: room.wager?.id ?? null,
      matched: !!room.quick,
    } as DuelRoomView;
  }

  /** Name of the player holding a side in the current or last game. */
  sideName(room: DuelRoom, side: Side): string {
    const index = room.colors?.indexOf(side) ?? -1;
    const token = index >= 0 ? room.players[index] : undefined;
    return (token && room.members.get(token)?.name) || 'Joueur parti';
  }

  playing(room: DuelRoom) {
    return room.game?.status === 'playing';
  }

  sideOf(room: DuelRoom, token: string): Side | null {
    const index = room.players.indexOf(token);
    return index >= 0 && room.colors ? room.colors[index] ?? null : null;
  }

  private launch(room: DuelRoom, matchedStake?: { potId: string; table: StakeTable }) {
    if (room.players.length < 2) throw new DuelRoomError('Il faut un adversaire pour commencer.');
    // Random colours for the first game, then they swap at each rematch.
    const colors: Side[] = room.colors && room.colors.length === 2 ? [room.colors[1], room.colors[0]] : randomInt(2) === 0 ? ['white', 'black'] : ['black', 'white'];
    const userAt = (side: Side) => room.members.get(room.players[colors.indexOf(side)])?.userId;
    if (matchedStake) {
      room.stake = { ...matchedStake, players: { white: userAt('white')!, black: userAt('black')! }, share: stakeConfig().winnerShare, payout: null };
      room.matched = true;
    } else if (room.wager) {
      const table = room.wager;
      if (table.currency === 'premium' && !stakeConfig().premiumEnabled) {
        throw new DuelRoomError(`${PREMIUM_CLOSED} Choisis une mise Free ou une partie sans mise.`);
      }
      const guests = room.players.filter((t) => !room.members.get(t)?.userId).map((t) => room.members.get(t)?.name ?? 'Joueur');
      if (guests.length) {
        throw new DuelRoomError(`${guests.join(', ')} doi${guests.length > 1 ? 'vent' : 't'} se connecter à un compte pour miser.`);
      }
      const [a, b] = room.players.map((t) => room.members.get(t));
      if (sameOrigin(a?.origin, b?.origin, table.currency === 'premium')) {
        throw new DuelRoomError(LINKED_PLAYERS_ERROR(a?.name ?? 'Joueur', b?.name ?? 'Joueur'));
      }
      const players = { white: userAt('white')!, black: userAt('black')! };
      const minors = table.currency === 'premium' ? notAdultConfirmed([players.white, players.black]) : [];
      if (minors.length) {
        const names = room.players.filter((t) => minors.includes(room.members.get(t)!.userId!)).map((t) => room.members.get(t)!.name);
        throw new DuelRoomError(`${names.join(', ')} doi${names.length > 1 ? 'vent' : 't'} d’abord attester avoir 18 ans ou plus pour miser des pièces Premium.`);
      }
      const capped = table.currency === 'premium' ? overPremiumCap([players.white, players.black]) : [];
      if (capped.length) {
        const names = room.players.filter((t) => capped.includes(room.members.get(t)!.userId!)).map((t) => room.members.get(t)!.name);
        throw new DuelRoomError(
          `${names.join(', ')} dépasse${names.length > 1 ? 'nt' : ''} le plafond de ${stakeConfig().premiumWalletCap.toLocaleString('fr-FR')} pièces Premium : retrait nécessaire avant de miser.`,
        );
      }
      const potId = randomUUID();
      const short = openPot(potId, table.id, table.currency, table.stake, [players.white, players.black]);
      if (short.length) {
        const names = room.players.filter((t) => short.includes(room.members.get(t)!.userId!)).map((t) => room.members.get(t)!.name);
        throw new DuelRoomError(`${names.join(', ')} n’${names.length > 1 ? 'ont' : 'a'} pas assez de pièces pour miser ${table.stake}.`);
      }
      room.stake = { potId, table, players, share: stakeConfig().winnerShare, payout: null };
    } else {
      room.stake = undefined;
    }
    room.colors = colors;
    const rules = RULES[room.kind];
    room.game = rules.newGame();
    room.startedAt = Date.now();
    room.clock = { white: rules.clockMs, black: rules.clockMs };
    room.turnStartedAt = Date.now();
    room.drawOffer = null;
    room.rematchVotes.clear();
    this.touch(room);
  }

  /** Takes the time spent from the clock of the side to move; true if it ran out (the game is then over). */
  private chargeClock(room: DuelRoom): boolean {
    const game = room.game;
    if (!game || game.status !== 'playing' || !room.clock) return false;
    const left = room.clock[game.turn] - (Date.now() - room.turnStartedAt);
    room.clock[game.turn] = Math.max(0, left);
    room.turnStartedAt = Date.now();
    if (left > 0) return false;
    this.finish(room, otherSide(game.turn), 'timeout');
    return true;
  }

  private finish(room: DuelRoom, winner: Side | null, reason: RoomEnd, notify = true) {
    if (!room.game || room.game.status !== 'playing') return;
    if (room.clock && reason !== 'timeout') {
      const turn = room.game.turn;
      room.clock[turn] = Math.max(0, room.clock[turn] - (Date.now() - room.turnStartedAt));
    }
    room.game = RULES[room.kind].end(room.game, winner, reason);
    room.drawOffer = null;
    if (notify) this.touch(room);
    else {
      this.settle(room);
      this.record(room);
    }
  }

  /** Counts a finished game for the signed-in players' XP and weekly quests; once per game. */
  private record(room: DuelRoom) {
    const game = room.game;
    if (!game || game.status !== 'over' || room.recordedGame === game.id) return;
    room.recordedGame = game.id;
    if (game.history.length < MIN_MOVES_TO_COUNT) return;
    room.players.forEach((token, i) => {
      const member = room.members.get(token);
      const side = room.colors?.[i];
      if (!member?.userId || !side) return;
      try {
        recordDuelOnlineGame(room.kind, member.userId, `${room.kind}-${game.id}`, game.winner === side, RULES[room.kind].captures(game, side));
      } catch (err) {
        console.error('Progression non enregistrée', err);
      }
    });
  }

  /** Pays the pot to the winner, or gives the stakes back after a draw; once. */
  private settle(room: DuelRoom) {
    const stake = room.stake;
    const game = room.game;
    if (!stake || stake.payout || !game || game.status !== 'over') return;
    try {
      archiveGame({
        id: `${room.kind}-${game.id}`,
        game: room.kind,
        potId: stake.potId,
        players: (['white', 'black'] as const).map((side) => ({ seat: side, userId: stake.players[side], name: this.sideName(room, side) })),
        moves: game.history,
        rolls: null,
        diceSeed: null,
        diceCommit: null,
        winner: game.winner,
        reason: game.endReason,
        startedAt: room.startedAt ?? null,
        endedAt: Date.now(),
      });
    } catch (err) {
      console.error('Archivage de la partie impossible', err);
    }
    try {
      if (!game.winner) {
        refundPot(stake.potId);
        stake.payout = { winner: null, amount: 0 };
        return;
      }
      const { prize } = potSplit(stake.table.stake, 2, stake.share);
      settlePot(stake.potId, stake.players[game.winner], prize);
      stake.payout = { winner: this.sideName(room, game.winner), amount: prize };
    } catch (err) {
      console.error('Impossible de régler la cagnotte, remboursement des mises', err);
      try {
        refundPot(stake.potId);
        stake.payout = { winner: null, amount: 0 };
      } catch (refundErr) {
        console.error('Remboursement impossible : il sera fait au prochain démarrage', refundErr);
      }
    }
  }

  /** Ends the game when the side to move runs out of time. */
  private schedule(room: DuelRoom) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const game = room.game;
    if (!game || game.status !== 'playing' || !room.clock) return;
    const left = room.clock[game.turn] - (Date.now() - room.turnStartedAt);
    room.timer = setTimeout(() => {
      room.timer = null;
      this.chargeClock(room);
    }, Math.max(0, left) + 50);
  }

  private stakeIssue(table: StakeTable, userId: number | undefined): 'guest' | 'funds' | null {
    if (!userId) return 'guest';
    return getWallet(userId)[table.currency] < table.stake ? 'funds' : null;
  }

  private stakeView(stake: DuelStake) {
    const { pot, prize } = potSplit(stake.table.stake, 2, stake.share);
    return { table: stake.table.id, currency: stake.table.currency, stake: stake.table.stake, pot, prize, payout: stake.payout };
  }

  private assertHost(room: DuelRoom, token: string) {
    if (room.hostToken !== token) throw new DuelRoomError("Seul l'hôte peut faire ça.");
  }

  private touch(room: DuelRoom) {
    room.lastActivity = Date.now();
    this.settle(room);
    this.record(room);
    this.schedule(room);
    this.onChange(room);
  }
}

interface Waiting {
  socketId: string;
  name: string;
  userId?: number;
}

export interface DuelQueueCallbacks {
  status: (socketId: string, status: DuelQueueStatus) => void;
  found: (socketId: string, match: { code: string; token: string }) => void;
  cancelled: (socketId: string, reason: string) => void;
}

/** Removes and returns the first two players who may play each other; at staked tables, not from one device or address. */
function takePair(queue: Waiting[], staked: boolean): [Waiting, Waiting] | null {
  for (let j = 1; j < queue.length; j++) {
    for (let i = 0; i < j; i++) {
      if (staked && sameOrigin(originOf(queue[i].socketId), originOf(queue[j].socketId))) continue;
      const pair: [Waiting, Waiting] = [queue[i], queue[j]];
      queue.splice(j, 1);
      queue.splice(i, 1);
      return pair;
    }
  }
  return null;
}

/** Quick match: the first two players waiting at the same table play each other at once. */
export class DuelQueue {
  private tables = new Map<string, Waiting[]>();

  constructor(
    private rooms: DuelManager,
    private callbacks: DuelQueueCallbacks,
  ) {}

  join(kind: DuelGame, player: Waiting, table: StakeTable | null) {
    this.leave(player.socketId, player.userId);
    const key = `${kind}|${table?.id ?? ''}`;
    const queue = this.tables.get(key) ?? [];
    this.tables.set(key, queue);
    queue.push(player);
    for (let pair = takePair(queue, !!table); pair; pair = takePair(queue, !!table)) {
      let stake: { potId: string; table: StakeTable } | undefined;
      if (table) {
        const potId = randomUUID();
        let short: number[];
        try {
          short = openPot(potId, table.id, table.currency, table.stake, pair.map((p) => p.userId!));
        } catch (err) {
          console.error('Impossible de prendre les mises', err);
          for (const p of pair) this.callbacks.cancelled(p.socketId, 'La partie n’a pas pu démarrer, aucune pièce n’a été prise.');
          continue;
        }
        if (short.length) {
          for (const p of pair.filter((p) => short.includes(p.userId!))) this.callbacks.cancelled(p.socketId, 'Solde insuffisant pour cette mise.');
          queue.unshift(...pair.filter((p) => !short.includes(p.userId!)));
          continue;
        }
        stake = { potId, table };
      }
      const { room, tokens } = this.rooms.createMatch(kind, pair, stake);
      pair.forEach((p, i) => this.callbacks.found(p.socketId, { code: room.code, token: tokens[i] }));
    }
    this.broadcast(key);
  }

  leave(socketId: string, userId?: number) {
    for (const [key, queue] of this.tables) {
      const kept = queue.filter((w) => {
        const same = w.socketId === socketId || (userId !== undefined && w.userId === userId);
        if (same && w.socketId !== socketId) this.callbacks.cancelled(w.socketId, 'Recherche lancée sur un autre appareil.');
        return !same;
      });
      if (kept.length === queue.length) continue;
      this.tables.set(key, kept);
      this.broadcast(key);
    }
    // Players can type any amount: empty queues are dropped so they don't pile up.
    for (const [key, queue] of this.tables) if (queue.length === 0) this.tables.delete(key);
  }

  /** Players searching, for one game or all of them. */
  waiting(kind?: DuelGame): number {
    let n = 0;
    for (const [key, queue] of this.tables) if (!kind || key.startsWith(`${kind}|`)) n += queue.length;
    return n;
  }

  /** Stops every search of a game, telling the players why. */
  cancelAll(kind: DuelGame, reason: string) {
    for (const [key, queue] of this.tables) {
      if (!key.startsWith(`${kind}|`)) continue;
      for (const w of queue) this.callbacks.cancelled(w.socketId, reason);
      this.tables.delete(key);
    }
  }

  /** Stops the searches at tables of `currency`, in every game. */
  cancelCurrency(currency: Currency, reason: string) {
    for (const [key, queue] of this.tables) {
      if (!key.includes(`|${currency}-`)) continue;
      for (const w of queue) this.callbacks.cancelled(w.socketId, reason);
      this.tables.delete(key);
    }
  }

  private broadcast(key: string) {
    const queue = this.tables.get(key) ?? [];
    const table = key.slice(key.indexOf('|') + 1);
    for (const w of queue) this.callbacks.status(w.socketId, { waiting: queue.length, table: table || null });
  }
}
