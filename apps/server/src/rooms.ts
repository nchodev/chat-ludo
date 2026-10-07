import { randomBytes, randomUUID } from 'node:crypto';
import {
  COLORS,
  TEAMMATE,
  REACTION_COOLDOWN_MS,
  applyMove,
  areDiagonal,
  botReaction,
  chooseMove,
  createGame,
  eventKey,
  forfeit,
  rollDice,
  rollDie,
  type BotLevel,
  type Color,
  type GameState,
  type OpponentKind,
  type ProgressSummary,
  type PublicSeat,
  type ReactionMessage,
  type RoomView,
  type Rules,
} from '@ludo/engine';
import { recordOnlineGame } from './api';

type Seat = { kind: 'empty' } | { kind: 'human'; token: string } | { kind: 'bot'; level: BotLevel };

export interface Member {
  token: string;
  name: string;
  socketId: string | null;
  forfeitTimer?: NodeJS.Timeout;
  lastReactionAt?: number;
  /** Account of a signed-in player, whose online games count for their profile. */
  userId?: number;
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
}

const BOT_NAMES: Record<BotLevel, string> = {
  easy: 'Ordi facile',
  medium: 'Ordi moyen',
  hard: 'Ordi difficile',
};

const BOT_DELAY_MS = 1000;
const BOT_REACTION_DELAY_MS = 700;
/** Free seats are handed out so that the first two players face each other diagonally. */
const SEAT_PREFERENCE: Color[] = ['red', 'yellow', 'green', 'blue'];
const DISCONNECTED_TAKEOVER_MS = 15_000;
const DISCONNECT_FORFEIT_MS = 60_000;
const IDLE_TAKEOVER_MS = 45_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
    let code: string;
    do {
      code = Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.rooms.has(code));

    const token = randomUUID();
    const room: Room = {
      code,
      hostToken: token,
      members: new Map([[token, { token, name: hostName, socketId, userId }]]),
      seats: { red: { kind: 'human', token }, green: { kind: 'empty' }, yellow: { kind: 'empty' }, blue: { kind: 'empty' } },
      rules,
      game: null,
      timer: null,
      lastActivity: Date.now(),
      results: new Map(),
      rematchVotes: new Set(),
    };
    this.rooms.set(code, room);
    return { room, token };
  }

  /** Creates a public room for matched players (plus bots if needed) and starts the game at once. */
  createMatch(players: { name: string; socketId: string; userId?: number }[], bots: BotLevel[], rules: Rules) {
    const { room, token } = this.create(players[0].name, rules, players[0].socketId, players[0].userId);
    room.seats.red = { kind: 'empty' };
    const tokens = [token];
    for (const p of players.slice(1)) {
      const t = randomUUID();
      room.members.set(t, { token: t, name: p.name, socketId: p.socketId, userId: p.userId });
      tokens.push(t);
    }
    const seats: Seat[] = [
      ...tokens.map((t): Seat => ({ kind: 'human', token: t })),
      ...bots.map((level): Seat => ({ kind: 'bot', level })),
    ];
    seats.forEach((seat, i) => (room.seats[SEAT_PREFERENCE[i]] = seat));
    this.launch(room);
    return { room, tokens };
  }

  join(room: Room, name: string, socketId: string, token?: string, userId?: number): string {
    const existing = token ? room.members.get(token) : undefined;
    if (existing) {
      existing.socketId = socketId;
      existing.name = name || existing.name;
      existing.userId = userId ?? existing.userId;
      clearTimeout(existing.forfeitTimer);
      this.touch(room);
      return existing.token;
    }

    const newToken = randomUUID();
    room.members.set(newToken, { token: newToken, name, socketId, userId });
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
      if (this.playingColor(room, token)) {
        clearTimeout(member.forfeitTimer);
        member.forfeitTimer = setTimeout(() => {
          const color = this.playingColor(room, token);
          if (member.socketId || !color || !room.game) return;
          room.game = forfeit(room.game, color);
          this.touch(room);
        }, DISCONNECT_FORFEIT_MS);
      }
    }
    this.touch(room);
  }

  /** Leaving during a game counts as a forfeit. */
  leave(room: Room, token: string) {
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
    this.rooms.delete(room.code);
  }

  takeSeat(room: Room, token: string, color: Color) {
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
    if (room.game) throw new RoomError('La partie a déjà commencé.');
    const seat = room.seats[color];
    if (seat.kind === 'human' && seat.token === token) throw new RoomError('Tu ne peux pas libérer ta propre place.');
    room.seats[color] = kind === 'bot' ? { kind: 'bot', level } : { kind: 'empty' };
    this.touch(room);
  }

  setRules(room: Room, token: string, rules: Rules) {
    this.assertHost(room, token);
    if (room.game) throw new RoomError('La partie a déjà commencé.');
    room.rules = rules;
    this.touch(room);
  }

  start(room: Room, token: string) {
    this.assertHost(room, token);
    if (room.game && room.game.phase !== 'over') throw new RoomError('La partie a déjà commencé.');
    this.launch(room);
  }

  /**
   * Votes for a rematch once a game is over; the new game starts when every connected
   * player still seated has voted.
   */
  rematch(room: Room, token: string) {
    if (!room.game || room.game.phase !== 'over') throw new RoomError("La partie n'est pas terminée.");
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
    if (waiting.length === 0) this.launch(room);
    else this.touch(room);
  }

  private launch(room: Room) {
    this.placeDuelDiagonally(room);
    const players = COLORS.filter((c) => room.seats[c].kind !== 'empty').map((color) => ({
      color,
      name: this.seatName(room, color),
    }));
    room.game = createGame(players, room.rules);
    room.rematchVotes.clear();
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
    this.assertHost(room, token);
    room.game = null;
    room.rematchVotes.clear();
    this.touch(room);
  }

  roll(room: Room, token: string) {
    const game = this.assertTurn(room, token);
    room.game = rollDieFor(game);
    this.touch(room);
  }

  move(room: Room, token: string, pawn: number) {
    const game = this.assertTurn(room, token);
    room.game = applyMove(game, pawn);
    this.touch(room);
  }

  /** Plans the next automatic action: bots, and humans who are disconnected or idle. */
  schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const game = room.game;
    if (!game || game.phase === 'over') return;

    const seat = room.seats[game.players[game.current].color];
    let level: BotLevel = 'medium';
    let delay: number;
    if (seat.kind === 'bot') {
      level = seat.level;
      delay = BOT_DELAY_MS;
    } else if (seat.kind === 'human') {
      delay = room.members.get(seat.token)?.socketId ? IDLE_TAKEOVER_MS : DISCONNECTED_TAKEOVER_MS;
    } else {
      return;
    }

    room.timer = setTimeout(() => {
      room.timer = null;
      const current = room.game;
      if (!current || current.phase === 'over') return;
      room.game = current.phase === 'roll' ? rollDieFor(current) : applyMove(current, chooseMove(current, level));
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
        connected: seat.kind === 'bot' || !!member?.socketId,
        isHost: seat.kind === 'human' && seat.token === room.hostToken,
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
      game: room.game,
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
    };
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
    if (seat.kind !== 'human' || seat.token !== token) throw new RoomError("Ce n'est pas ton tour.");
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
    const opponentKind = (color: Color): OpponentKind => {
      const seat = room.seats[color];
      return seat.kind === 'bot' ? { kind: 'bot', level: seat.level } : { kind: 'human', online: true };
    };
    for (const color of COLORS) {
      const seat = room.seats[color];
      const member = seat.kind === 'human' ? room.members.get(seat.token) : undefined;
      if (!member?.userId) continue;
      try {
        const summary = recordOnlineGame(member.userId, game, color, opponentKind);
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
    this.onChange(room);
    this.botsReact(room);
  }
}

function rollDieFor(game: GameState): GameState {
  return rollDice(game, rollDie());
}
