import { randomBytes, randomUUID } from 'node:crypto';
import {
  COLORS,
  MAX_TIMEOUTS,
  TEAMMATE,
  TURN_TIME_MS,
  REACTION_COOLDOWN_MS,
  applyMove,
  areDiagonal,
  botReaction,
  chooseMove,
  createGame,
  eventKey,
  forfeit,
  rollDice,
  type BotLevel,
  type Color,
  type GameState,
  type OpponentKind,
  type ProgressSummary,
  type PublicSeat,
  type ReactionMessage,
  type RoomView,
  type Rules,
  type StakeTable,
  ADULT_REQUIRED,
  PREMIUM_CLOSED,
  potSplit,
  stakeConfig,
} from '@ludo/engine';
import { recordOnlineGame } from './api';
import {
  archiveGame,
  deleteLiveRoom,
  forfeitPot,
  getWallet,
  listLiveRooms,
  notAdultConfirmed,
  openPot,
  refundPot,
  saveLiveRoom,
  settlePot,
} from './db';
import { newFairSeed, nextFairRoll, publicFair, type FairSeed } from './fair';
import { LINKED_PLAYERS_ERROR, linkedPlayers, originOf, type Origin } from './identity';

type Seat = { kind: 'empty' } | { kind: 'human'; token: string } | { kind: 'bot'; level: BotLevel };

export interface Member {
  token: string;
  name: string;
  socketId: string | null;
  forfeitTimer?: NodeJS.Timeout;
  lastReactionAt?: number;
  /** Account of a signed-in player, whose online games count for their profile. */
  userId?: number;
  /** Device and address the member last connected from. */
  origin?: Origin;
}

export interface Room {
  code: string;
  hostToken: string;
  members: Map<string, Member>;
  seats: Record<Color, Seat>;
  rules: Rules;
  game: GameState | null;
  timer: NodeJS.Timeout | null;
  lastActivity: number;
  /** Key of the last game event bots had a chance to react to. */
  reactedEvent?: string;
  /** Id of the finished game already credited to signed-in players. */
  recordedGame?: string;
  /** What each signed-in member earned in the last finished game, by member token. */
  results: Map<string, ProgressSummary>;
  /** Members who asked for a rematch after the last game. */
  rematchVotes: Set<string>;
  /** When the current action must be played by, keyed by the game and action count it belongs to. */
  deadline: { key: string; at: number } | null;
  /** Times each player ran out of time in the current game. */
  timeouts: Partial<Record<Color, number>>;
  /** Player whose turn the computer is finishing after they ran out of time. */
  autoplay: Color | null;
  /** Coins every player put in for the current or last game. */
  stake?: RoomStakeState;
  /** Made by quick match: seats, rules and stake can't be changed. */
  matched?: boolean;
  /** Made by quick match, staked or not. */
  quick?: boolean;
  /** Private rooms: stake the host set for every game. */
  wager?: StakeTable;
  /** Staked game on one screen: the host's device plays every seat. */
  shared?: boolean;
  /** The shared device left mid-game: the computer finishes it so the pot still goes to a winner. */
  abandoned?: boolean;
  /** Secret seed the current game's dice come from (see `fair.ts`). */
  fair?: FairSeed;
  startedAt?: number;
}

/** A room as saved in the database: no timers or connections, Maps and Sets as arrays. */
type SavedRoom = Omit<Room, 'members' | 'results' | 'rematchVotes' | 'timer' | 'deadline'> & {
  members: Omit<Member, 'socketId' | 'forfeitTimer' | 'lastReactionAt'>[];
  results: [string, ProgressSummary][];
  rematchVotes: string[];
};

interface RoomStakeState {
  potId: string;
  table: StakeTable;
  /** Account of each staked seat, fixed when the stakes were taken. */
  players: Partial<Record<Color, number>>;
  /** Winner's share when the stakes were taken: a later settings change doesn't affect this game. */
  share: number;
  payout: { winner: string | null; amount: number } | null;
}

const MATCHED_ROOM_ERROR = 'Partie avec mise : relance une recherche depuis la partie rapide.';
const SHARED_ROOM_ERROR = 'Partie sur un seul écran : change les joueurs depuis « Nouvelle partie ».';
const ABANDONED_BOT_DELAY_MS = 250;
const NO_BOTS_WITH_STAKE = 'Pas d’ordinateur dans une partie avec mise : seuls des joueurs connectés peuvent miser.';

const BOT_NAMES: Record<BotLevel, string> = {
  easy: 'Ordi facile',
  medium: 'Ordi moyen',
  hard: 'Ordi difficile',
};

const BOT_DELAY_MS = 1000;
const BOT_REACTION_DELAY_MS = 700;
/** Free seats are handed out so that the first two players face each other diagonally. */
const SEAT_PREFERENCE: Color[] = ['red', 'yellow', 'green', 'blue'];
/** Mobile networks drop often: a player has this long to come back before losing. */
export const DISCONNECT_FORFEIT_MS = 60_000;
/** After a restart, extra time on the turn in progress so its player has time to reconnect. */
const RESTART_TURN_GRACE_MS = 20_000;
/**
 * Shape of a saved room. Bump it when Room or GameState change in a way old saves can't be read:
 * rooms saved with another version are dropped at startup and their stakes refunded.
 */
const LIVE_ROOM_VERSION = 1;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 4 players and a few spectators. */
const MAX_MEMBERS = 12;
const MAX_ROOMS = 5000;

export class RoomError extends Error {}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private onChange: (room: Room) => void,
    private onReaction: (room: Room, message: ReactionMessage) => void,
  ) {}

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  create(hostName: string, rules: Rules, socketId: string, userId?: number): { room: Room; token: string } {
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError('Le serveur est complet, réessaie dans quelques minutes.');
    let code: string;
    do {
      code = Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.rooms.has(code));

    const token = randomUUID();
    const room: Room = {
      code,
      hostToken: token,
      members: new Map([[token, { token, name: hostName, socketId, userId, origin: originOf(socketId) }]]),
      seats: { red: { kind: 'human', token }, green: { kind: 'empty' }, yellow: { kind: 'empty' }, blue: { kind: 'empty' } },
      rules,
      game: null,
      timer: null,
      lastActivity: Date.now(),
      results: new Map(),
      rematchVotes: new Set(),
      deadline: null,
      timeouts: {},
      autoplay: null,
    };
    this.rooms.set(code, room);
    this.persist(room);
    return { room, token };
  }

  /** Creates a public room for matched players (plus bots if needed) and starts the game at once. */
  createMatch(
    players: { name: string; socketId: string; userId?: number }[],
    bots: BotLevel[],
    rules: Rules,
    stake?: { potId: string; table: StakeTable },
  ) {
    const { room, token } = this.create(players[0].name, rules, players[0].socketId, players[0].userId);
    room.seats.red = { kind: 'empty' };
    const tokens = [token];
    for (const p of players.slice(1)) {
      const t = randomUUID();
      room.members.set(t, { token: t, name: p.name, socketId: p.socketId, userId: p.userId, origin: originOf(p.socketId) });
      tokens.push(t);
    }
    const seats: Seat[] = [
      ...tokens.map((t): Seat => ({ kind: 'human', token: t })),
      ...bots.map((level): Seat => ({ kind: 'bot', level })),
    ];
    seats.forEach((seat, i) => (room.seats[SEAT_PREFERENCE[i]] = seat));
    if (stake) {
      const staked: Partial<Record<Color, number>> = {};
      for (const color of COLORS) {
        const seat = room.seats[color];
        const userId = seat.kind === 'human' ? room.members.get(seat.token)?.userId : undefined;
        if (userId) staked[color] = userId;
      }
      room.stake = { ...stake, players: staked, share: stakeConfig().winnerShare, payout: null };
      room.matched = true;
    }
    room.quick = true;
    this.launch(room);
    return { room, tokens };
  }

  /**
   * Staked game on one device: the host and players who proved with a code that they are next
   * to it. Stakes are taken at once; nothing is created if one of them can't pay.
   */
  createShared(players: { color: Color; name: string; userId: number }[], hostUserId: number, rules: Rules, table: StakeTable, socketId: string) {
    const host = players.find((p) => p.userId === hostUserId);
    if (!host) throw new RoomError('Tu dois faire partie des joueurs.');
    const { room, token } = this.create(host.name, rules, socketId, hostUserId);
    room.seats = { red: { kind: 'empty' }, green: { kind: 'empty' }, yellow: { kind: 'empty' }, blue: { kind: 'empty' } };
    for (const p of players) {
      let seatToken = token;
      if (p !== host) {
        seatToken = randomUUID();
        room.members.set(seatToken, { token: seatToken, name: p.name, socketId: null, userId: p.userId });
      }
      room.seats[p.color] = { kind: 'human', token: seatToken };
    }
    room.shared = true;
    room.wager = table;
    try {
      this.launch(room);
    } catch (err) {
      // Gives the stakes back if they were taken before the failure.
      this.delete(room);
      throw err;
    }
    return { room, token };
  }

  join(room: Room, name: string, socketId: string, token?: string, userId?: number): string {
    const existing = token ? room.members.get(token) : undefined;
    if (existing) {
      existing.socketId = socketId;
      existing.origin = originOf(socketId) ?? existing.origin;
      existing.name = name || existing.name;
      existing.userId = userId ?? existing.userId;
      clearTimeout(existing.forfeitTimer);
      this.touch(room);
      return existing.token;
    }

    if (room.members.size >= MAX_MEMBERS) throw new RoomError('Ce salon est plein.');
    const newToken = randomUUID();
    room.members.set(newToken, { token: newToken, name, socketId, userId, origin: originOf(socketId) });
    if (!room.game) {
      const free = SEAT_PREFERENCE.find((c) => room.seats[c].kind === 'empty');
      if (free) room.seats[free] = { kind: 'human', token: newToken };
    }
    this.touch(room);
    return newToken;
  }

  disconnect(room: Room, token: string) {
    const member = room.members.get(token);
    if (member) {
      member.socketId = null;
      this.armForfeit(room, member);
    }
    this.touch(room);
  }

  /** Starts the countdown that makes an offline player lose (or the computer take over a shared device). */
  private armForfeit(room: Room, member: Member) {
    const token = member.token;
    if (room.shared) {
      // The other seats of a shared device never connect: only the device itself can drop.
      if (token !== room.hostToken) return;
      clearTimeout(member.forfeitTimer);
      member.forfeitTimer = setTimeout(() => {
        if (member.socketId || !room.game || room.game.phase === 'over') return;
        room.abandoned = true;
        this.touch(room);
      }, DISCONNECT_FORFEIT_MS);
      return;
    }
    if (!this.playingColor(room, token)) return;
    clearTimeout(member.forfeitTimer);
    member.forfeitTimer = setTimeout(() => {
      const color = this.playingColor(room, token);
      if (member.socketId || !color || !room.game) return;
      room.game = forfeit(room.game, color);
      this.touch(room);
    }, DISCONNECT_FORFEIT_MS);
  }

  /** Saves every room now, e.g. right before the server stops. */
  persistAll() {
    for (const room of this.rooms.values()) this.persist(room);
  }

  /**
   * Reloads the rooms saved before a restart, with every member offline until their app
   * reconnects. Returns the pots of the games resumed, which must not be refunded.
   */
  restore(): Set<string> {
    const pots = new Set<string>();
    for (const row of listLiveRooms('ludo')) {
      try {
        if (row.version !== LIVE_ROOM_VERSION) throw new Error(`format ${row.version} au lieu de ${LIVE_ROOM_VERSION}`);
        const saved = JSON.parse(row.data) as SavedRoom;
        if (saved.code !== row.code || !saved.seats || !saved.rules || !Array.isArray(saved.members)) throw new Error('données incomplètes');
        const room: Room = {
          ...saved,
          members: new Map(saved.members.map((m) => [m.token, { ...m, socketId: null }])),
          results: new Map(saved.results),
          rematchVotes: new Set(saved.rematchVotes),
          timer: null,
          deadline: null,
          lastActivity: Date.now(),
        };
        this.rooms.set(room.code, room);
        if (room.stake && !room.stake.payout) pots.add(room.stake.potId);
      } catch (err) {
        console.error(`Salon ${row.code} non repris :`, err);
        deleteLiveRoom('ludo', row.code);
      }
    }
    for (const room of [...this.rooms.values()]) {
      for (const member of room.members.values()) this.armForfeit(room, member);
      const game = room.game;
      if (game && game.phase !== 'over') {
        room.deadline = { key: `${game.id}:${game.history.length}`, at: Date.now() + TURN_TIME_MS + RESTART_TURN_GRACE_MS };
      }
      this.touch(room);
    }
    return pots;
  }

  private persist(room: Room) {
    if (this.rooms.get(room.code) !== room) return;
    try {
      const { members, results, rematchVotes, timer: _timer, deadline: _deadline, ...rest } = room;
      const saved: SavedRoom = {
        ...rest,
        members: [...members.values()].map(({ token, name, userId, origin }) => ({ token, name, userId, origin })),
        results: [...results],
        rematchVotes: [...rematchVotes],
      };
      saveLiveRoom('ludo', room.code, LIVE_ROOM_VERSION, JSON.stringify(saved));
    } catch (err) {
      console.error(`Sauvegarde du salon ${room.code} impossible`, err);
    }
  }

  /**
   * Leaving during a game counts as a forfeit. On a shared device the game ends for everyone
   * and every stake is lost (they were warned); a dropped connection is handled in disconnect.
   */
  leave(room: Room, token: string) {
    if (room.shared && token === room.hostToken) {
      clearTimeout(room.members.get(token)?.forfeitTimer);
      const stake = room.stake;
      if (room.game && room.game.phase !== 'over' && stake && !stake.payout) {
        try {
          if (forfeitPot(stake.potId)) stake.payout = { winner: null, amount: 0 };
          this.archive(room, room.game, 'abandon de l’appareil partagé');
        } catch (err) {
          console.error('Impossible de clore la cagnotte abandonnée', err);
        }
      }
      this.delete(room);
      return;
    }
    const member = room.members.get(token);
    clearTimeout(member?.forfeitTimer);
    const playing = this.playingColor(room, token);
    if (playing && room.game) room.game = forfeit(room.game, playing);
    room.members.delete(token);
    for (const color of COLORS) {
      const seat = room.seats[color];
      if (seat.kind === 'human' && seat.token === token) room.seats[color] = { kind: 'empty' };
    }
    if (room.hostToken === token) {
      const next = [...room.members.values()].find((m) => m.socketId) ?? [...room.members.values()][0];
      if (next) room.hostToken = next.token;
    }
    if (room.members.size === 0) this.delete(room);
    else this.touch(room);
  }

  delete(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    if (room.stake && !room.stake.payout) {
      try {
        refundPot(room.stake.potId);
        room.stake.payout = { winner: null, amount: 0 };
      } catch (err) {
        console.error('Remboursement impossible', err);
      }
    }
    for (const member of room.members.values()) clearTimeout(member.forfeitTimer);
    this.rooms.delete(room.code);
    try {
      deleteLiveRoom('ludo', room.code);
    } catch (err) {
      console.error(`Suppression du salon ${room.code} sauvegardé impossible`, err);
    }
  }

  takeSeat(room: Room, token: string, color: Color) {
    if (room.shared) throw new RoomError(SHARED_ROOM_ERROR);
    if (room.matched) throw new RoomError(MATCHED_ROOM_ERROR);
    if (room.game) throw new RoomError('La partie a déjà commencé.');
    if (room.seats[color].kind !== 'empty') throw new RoomError('Cette place est occupée.');
    for (const c of COLORS) {
      const seat = room.seats[c];
      if (seat.kind === 'human' && seat.token === token) room.seats[c] = { kind: 'empty' };
    }
    room.seats[color] = { kind: 'human', token };
    this.touch(room);
  }

  setSeat(room: Room, token: string, color: Color, kind: 'empty' | 'bot', level: BotLevel = 'medium') {
    this.assertHost(room, token);
    if (room.shared) throw new RoomError(SHARED_ROOM_ERROR);
    if (room.matched) throw new RoomError(MATCHED_ROOM_ERROR);
    if (room.game) throw new RoomError('La partie a déjà commencé.');
    const seat = room.seats[color];
    if (seat.kind === 'human' && seat.token === token) throw new RoomError('Tu ne peux pas libérer ta propre place.');
    if (kind === 'bot' && room.wager) throw new RoomError(NO_BOTS_WITH_STAKE);
    room.seats[color] = kind === 'bot' ? { kind: 'bot', level } : { kind: 'empty' };
    this.touch(room);
  }

  setWager(room: Room, token: string, table: StakeTable | null) {
    this.assertHost(room, token);
    if (room.quick) throw new RoomError('La mise se choisit dans un salon privé.');
    if (room.shared) throw new RoomError(SHARED_ROOM_ERROR);
    if (room.game && room.game.phase !== 'over') throw new RoomError('La partie a déjà commencé.');
    if (table && COLORS.some((c) => room.seats[c].kind === 'bot')) {
      throw new RoomError('Retire d’abord les ordinateurs : seuls des joueurs connectés peuvent miser.');
    }
    const hostId = room.members.get(token)?.userId;
    if (table?.currency === 'premium' && (!hostId || notAdultConfirmed([hostId]).length)) throw new RoomError(ADULT_REQUIRED);
    room.wager = table ?? undefined;
    this.touch(room);
  }

  setRules(room: Room, token: string, rules: Rules) {
    if (room.shared) throw new RoomError(SHARED_ROOM_ERROR);
    this.assertHost(room, token);
    if (room.matched) throw new RoomError(MATCHED_ROOM_ERROR);
    if (room.game) throw new RoomError('La partie a déjà commencé.');
    room.rules = rules;
    this.touch(room);
  }

  start(room: Room, token: string) {
    this.assertHost(room, token);
    if (room.matched) throw new RoomError(MATCHED_ROOM_ERROR);
    if (room.game && room.game.phase !== 'over') throw new RoomError('La partie a déjà commencé.');
    this.launch(room);
  }

  /**
   * Votes for a rematch once a game is over; the new game starts when every connected
   * player still seated has voted.
   */
  rematch(room: Room, token: string) {
    if (room.matched) throw new RoomError(MATCHED_ROOM_ERROR);
    if (!room.game || room.game.phase !== 'over') throw new RoomError("La partie n'est pas terminée.");
    if (room.shared) {
      this.assertHost(room, token);
      this.launch(room);
      return;
    }
    const humans = COLORS.flatMap((c) => {
      const seat = room.seats[c];
      return seat.kind === 'human' ? [seat.token] : [];
    });
    if (!humans.includes(token)) throw new RoomError('Seuls les joueurs peuvent demander une revanche.');
    if (COLORS.filter((c) => room.seats[c].kind !== 'empty').length < 2) {
      throw new RoomError('Ton adversaire est parti : retourne au salon pour inviter quelqu’un.');
    }
    room.rematchVotes.add(token);
    const waiting = humans.filter((t) => room.members.get(t)?.socketId && !room.rematchVotes.has(t));
    if (waiting.length > 0) {
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

  /** Takes every seated player's stake for a private room with a wager; throws if one of them can't pay. */
  private collectWager(room: Room) {
    const table = room.wager;
    if (!table) {
      room.stake = undefined;
      return;
    }
    if (table.currency === 'premium' && !stakeConfig().premiumEnabled) throw new RoomError(`${PREMIUM_CLOSED} Choisis une mise Free ou une partie sans mise.`);
    const players: Partial<Record<Color, number>> = {};
    const guests: string[] = [];
    for (const color of COLORS) {
      const seat = room.seats[color];
      if (seat.kind === 'bot') throw new RoomError(NO_BOTS_WITH_STAKE);
      if (seat.kind !== 'human') continue;
      const userId = room.members.get(seat.token)?.userId;
      if (userId) players[color] = userId;
      else guests.push(this.seatName(room, color));
    }
    if (guests.length) {
      throw new RoomError(`${guests.join(', ')} doi${guests.length > 1 ? 'vent' : 't'} se connecter à un compte pour miser.`);
    }
    if (Object.keys(players).length < 2) throw new RoomError('Il faut au moins 2 joueurs pour lancer la partie.');
    const staked = COLORS.filter((c) => players[c]);
    const linked = linkedPlayers(
      staked.map((c) => {
        const seat = room.seats[c];
        return seat.kind === 'human' ? room.members.get(seat.token)?.origin : undefined;
      }),
      table.currency === 'premium',
    );
    if (linked) throw new RoomError(LINKED_PLAYERS_ERROR(this.seatName(room, staked[linked[0]]), this.seatName(room, staked[linked[1]])));
    const userIds = Object.values(players) as number[];
    const minors = table.currency === 'premium' ? notAdultConfirmed(userIds) : [];
    if (minors.length) {
      const names = staked.filter((c) => minors.includes(players[c]!)).map((c) => this.seatName(room, c));
      throw new RoomError(`${names.join(', ')} doi${names.length > 1 ? 'vent' : 't'} d’abord attester avoir 18 ans ou plus pour miser des pièces Premium.`);
    }
    const potId = randomUUID();
    const short = openPot(potId, table.id, table.currency, table.stake, userIds);
    if (short.length) {
      const names = COLORS.filter((c) => players[c] && short.includes(players[c]!)).map((c) => this.seatName(room, c));
      throw new RoomError(`${names.join(', ')} n’${names.length > 1 ? 'ont' : 'a'} pas assez de pièces pour miser ${table.stake}.`);
    }
    room.stake = { potId, table, players, share: stakeConfig().winnerShare, payout: null };
  }

  private launch(room: Room) {
    this.placeDuelDiagonally(room);
    if (!room.matched) this.collectWager(room);
    const players = COLORS.filter((c) => room.seats[c].kind !== 'empty').map((color) => ({
      color,
      name: this.seatName(room, color),
    }));
    room.game = createGame(players, room.rules);
    room.fair = newFairSeed(room.game.id);
    room.startedAt = Date.now();
    room.rematchVotes.clear();
    room.deadline = null;
    room.timeouts = {};
    room.autoplay = null;
    this.touch(room);
  }

  /** With exactly two side-by-side seats, moves one of them to the diagonal, keeping the host in place. */
  private placeDuelDiagonally(room: Room) {
    const filled = COLORS.filter((c) => room.seats[c].kind !== 'empty');
    if (filled.length !== 2 || areDiagonal(filled[0], filled[1])) return;
    const isHost = (c: Color) => {
      const seat = room.seats[c];
      return seat.kind === 'human' && seat.token === room.hostToken;
    };
    const [keep, move] = isHost(filled[1]) ? [filled[1], filled[0]] : filled;
    room.seats[TEAMMATE[keep]] = room.seats[move];
    room.seats[move] = { kind: 'empty' };
  }

  backToLobby(room: Room, token: string) {
    if (room.shared) throw new RoomError(SHARED_ROOM_ERROR);
    this.assertHost(room, token);
    if (room.matched) throw new RoomError(MATCHED_ROOM_ERROR);
    if (room.stake && !room.stake.payout) throw new RoomError('Partie avec mise en cours : elle doit se terminer d’abord.');
    room.game = null;
    room.stake = undefined;
    room.rematchVotes.clear();
    this.touch(room);
  }

  roll(room: Room, token: string) {
    const game = this.assertTurn(room, token);
    room.game = this.rollFor(room, game);
    this.playerActed(room, game);
    this.touch(room);
  }

  move(room: Room, token: string, pawn: number) {
    const game = this.assertTurn(room, token);
    room.game = applyMove(game, pawn);
    this.playerActed(room, game);
    this.touch(room);
  }

  private rollFor(room: Room, game: GameState): GameState {
    if (room.fair?.gameId !== game.id) room.fair = newFairSeed(game.id);
    return rollDice(game, nextFairRoll(room.fair));
  }

  /** Only turns missed in a row lose the game: playing again clears the count. */
  private playerActed(room: Room, game: GameState) {
    delete room.timeouts[game.players[game.current].color];
  }

  /**
   * Plans the next automatic action: bots play after a short pause; a human who doesn't act
   * within TURN_TIME_MS gets a timeout, then the computer finishes their turn. The
   * MAX_TIMEOUTS-th timeout loses the game.
   */
  schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const game = room.game;
    if (!game || game.phase === 'over') {
      room.deadline = null;
      room.autoplay = null;
      if (room.abandoned) this.delete(room);
      return;
    }

    const color = game.players[game.current].color;
    if (room.autoplay !== color) room.autoplay = null;
    const seat = room.seats[color];
    let level: BotLevel = 'medium';
    let delay: number;
    let timesOut = false;
    if (room.abandoned) {
      delay = ABANDONED_BOT_DELAY_MS;
      room.deadline = null;
    } else if (seat.kind === 'bot') {
      level = seat.level;
      delay = BOT_DELAY_MS;
      room.deadline = null;
    } else if (seat.kind === 'human' && room.autoplay === color) {
      delay = BOT_DELAY_MS;
      room.deadline = null;
    } else if (seat.kind === 'human') {
      // Reconnections and other updates must not give the player more time.
      const key = `${game.id}:${game.history.length}`;
      if (room.deadline?.key !== key) room.deadline = { key, at: Date.now() + TURN_TIME_MS };
      delay = Math.max(0, room.deadline.at - Date.now());
      timesOut = true;
    } else {
      return;
    }

    room.timer = setTimeout(() => {
      room.timer = null;
      const current = room.game;
      if (!current || current.phase === 'over') return;
      if (timesOut) {
        const count = (room.timeouts[color] ?? 0) + 1;
        room.timeouts[color] = count;
        if (count >= MAX_TIMEOUTS) {
          room.game = forfeit(current, color);
          this.touch(room);
          return;
        }
        room.autoplay = color;
      }
      room.game = current.phase === 'roll' ? this.rollFor(room, current) : applyMove(current, chooseMove(current, level));
      this.touch(room);
    }, delay);
  }

  view(room: Room, token: string | undefined): RoomView {
    const seats: PublicSeat[] = COLORS.map((color) => {
      const seat = room.seats[color];
      const member = seat.kind === 'human' ? room.members.get(seat.token) : undefined;
      return {
        color,
        kind: seat.kind,
        name: this.seatName(room, color),
        botLevel: seat.kind === 'bot' ? seat.level : undefined,
        connected: seat.kind === 'bot' || !!(room.shared ? room.members.get(room.hostToken)?.socketId : member?.socketId),
        isHost: seat.kind === 'human' && seat.token === room.hostToken,
        stakeIssue: room.wager && seat.kind === 'human' ? this.stakeIssue(room.wager, member?.userId) : null,
      };
    });
    const seatedTokens = new Set(
      COLORS.map((c) => room.seats[c]).flatMap((s) => (s.kind === 'human' ? [s.token] : [])),
    );
    return {
      code: room.code,
      seats,
      spectators: [...room.members.values()].filter((m) => !seatedTokens.has(m.token)).map((m) => m.name),
      rules: room.rules,
      // The action log is only needed on the server; leave it out of every broadcast.
      game: room.game && { ...room.game, history: [] },
      you: COLORS.find((c) => {
        const s = room.seats[c];
        return s.kind === 'human' && s.token === token;
      }) ?? null,
      isHost: token === room.hostToken,
      result: (token && room.game && room.recordedGame === room.game.id && room.results.get(token)) || null,
      rematch: COLORS.filter((c) => {
        const seat = room.seats[c];
        return seat.kind === 'human' && room.rematchVotes.has(seat.token);
      }),
      turnTimer: room.deadline ? { endsIn: Math.max(0, room.deadline.at - Date.now()), duration: TURN_TIME_MS } : null,
      timeouts: room.timeouts,
      autoplay: room.autoplay,
      stake: room.stake ? this.stakeView(room.stake) : null,
      wager: room.wager?.id ?? null,
      matched: !!room.quick,
      shared: !!room.shared,
      fair: room.game && room.fair?.gameId === room.game.id ? publicFair(room.fair, room.game.phase === 'over') : null,
    };
  }

  private stakeIssue(table: StakeTable, userId: number | undefined): 'guest' | 'funds' | null {
    if (!userId) return 'guest';
    return getWallet(userId)[table.currency] < table.stake ? 'funds' : null;
  }

  private stakeView(stake: RoomStakeState) {
    const { pot, prize } = potSplit(stake.table.stake, Object.keys(stake.players).length, stake.share);
    return {
      table: stake.table.id,
      currency: stake.table.currency,
      stake: stake.table.stake,
      pot,
      prize,
      payout: stake.payout,
    };
  }

  /** Keeps a staked game (players, every action and die, seed) for inspection. */
  private archive(room: Room, game: GameState, reason: string) {
    if (!room.stake) return;
    const stake = room.stake;
    try {
      archiveGame({
        id: `ludo-${game.id}`,
        game: 'ludo',
        potId: stake.potId,
        players: game.players.map((p) => ({ seat: p.color, userId: stake.players[p.color] ?? null, name: this.seatName(room, p.color) })),
        moves: game.history,
        rolls: room.fair?.gameId === game.id ? room.fair.rolls : null,
        diceSeed: room.fair?.gameId === game.id ? room.fair.seed : null,
        diceCommit: room.fair?.gameId === game.id ? room.fair.commit : null,
        winner: game.winners[0] ?? null,
        reason,
        startedAt: room.startedAt ?? null,
        endedAt: Date.now(),
      });
    } catch (err) {
      console.error('Archivage de la partie impossible', err);
    }
  }

  /** Pays the pot to the winner of a staked game, once. */
  private settleStake(room: Room, game: GameState) {
    const stake = room.stake;
    if (!stake || stake.payout) return;
    const winner = game.winners.find((c) => stake.players[c]);
    try {
      if (!winner) {
        refundPot(stake.potId);
        stake.payout = { winner: null, amount: 0 };
        return;
      }
      const { prize } = potSplit(stake.table.stake, Object.keys(stake.players).length, stake.share);
      settlePot(stake.potId, stake.players[winner]!, prize);
      stake.payout = { winner: this.seatName(room, winner), amount: prize };
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

  /** The color a member is still playing in the current game, if any. */
  private playingColor(room: Room, token: string): Color | null {
    const game = room.game;
    if (!game || game.phase === 'over') return null;
    const color = COLORS.find((c) => {
      const seat = room.seats[c];
      return seat.kind === 'human' && seat.token === token;
    });
    if (!color || game.forfeited.includes(color) || !game.players.some((p) => p.color === color)) return null;
    return color;
  }

  private seatName(room: Room, color: Color): string {
    const seat = room.seats[color];
    if (seat.kind === 'bot') return BOT_NAMES[seat.level];
    if (seat.kind === 'human') return room.members.get(seat.token)?.name ?? 'Joueur parti';
    return '';
  }

  private assertHost(room: Room, token: string) {
    if (room.hostToken !== token) throw new RoomError("Seul l'hôte peut faire ça.");
  }

  private assertTurn(room: Room, token: string): GameState {
    const game = room.game;
    if (!game || game.phase === 'over') throw new RoomError("Aucune partie en cours.");
    const seat = room.seats[game.players[game.current].color];
    const yours = room.shared ? token === room.hostToken && !room.abandoned : seat.kind === 'human' && seat.token === token;
    if (seat.kind !== 'human' || !yours) throw new RoomError("Ce n'est pas ton tour.");
    return game;
  }

  /** Sends a quick reaction (emoji or phrase) from a seated player to the whole room. */
  react(room: Room, token: string, reaction: string) {
    const member = room.members.get(token);
    const color = COLORS.find((c) => {
      const seat = room.seats[c];
      return seat.kind === 'human' && seat.token === token;
    });
    if (!member || !color || !room.game) throw new RoomError('Seuls les joueurs peuvent réagir.');
    const now = Date.now();
    if (member.lastReactionAt && now - member.lastReactionAt < REACTION_COOLDOWN_MS) return;
    member.lastReactionAt = now;
    this.onReaction(room, { color, reaction });
  }

  private botsReact(room: Room) {
    const game = room.game;
    if (!game) return;
    const key = eventKey(game);
    if (room.reactedEvent === key) return;
    room.reactedEvent = key;
    const bots = COLORS.filter((c) => room.seats[c].kind === 'bot' && game.players.some((p) => p.color === c));
    const message = botReaction(game, bots);
    if (message) setTimeout(() => this.onReaction(room, message), BOT_REACTION_DELAY_MS);
  }

  /** Credits a finished game to every signed-in player who took part, once. */
  private recordResults(room: Room) {
    const game = room.game;
    if (!game || game.phase !== 'over' || room.recordedGame === game.id) return;
    room.recordedGame = game.id;
    room.results.clear();
    this.settleStake(room, game);
    this.archive(room, game, game.forfeited.length ? 'forfait' : 'fin');
    const opponentKind = (color: Color): OpponentKind => {
      const seat = room.seats[color];
      return seat.kind === 'bot' ? { kind: 'bot', level: seat.level } : { kind: 'human', online: true };
    };
    for (const color of COLORS) {
      const seat = room.seats[color];
      const member = seat.kind === 'human' ? room.members.get(seat.token) : undefined;
      if (!member?.userId) continue;
      try {
        const summary = recordOnlineGame(member.userId, game, color, opponentKind, !!room.stake);
        if (summary) room.results.set(member.token, summary);
      } catch (err) {
        console.error('Impossible de créditer la partie', err);
      }
    }
  }

  private touch(room: Room) {
    room.lastActivity = Date.now();
    this.recordResults(room);
    this.schedule(room);
    this.persist(room);
    this.onChange(room);
    this.botsReact(room);
  }
}
