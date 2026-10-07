import {
  BASE,
  COLORS,
  FINISHED,
  HOME_COLUMN_LENGTH,
  HOME_COLUMN_START,
  LAST_TRACK_STEP,
  START_INDEX,
  START_SQUARES,
  STAR_SQUARES,
  TEAMMATE,
  TRACK_LENGTH,
  type Color,
} from './constants';

export interface Rules {
  /** Dice values that let a pawn leave its base. */
  exitOn: 'six' | 'oneOrSix';
  /** Rolling three 6 in a row ends the turn. */
  threeSixesForfeit: boolean;
  /** The exact value is required to reach the center. */
  exactFinish: boolean;
  /** Star and start squares protect pawns from capture. */
  safeSquares: boolean;
  /** Two pawns of the same color on a square form an impassable wall. */
  blocks: boolean;
  bonusOnCapture: boolean;
  bonusOnFinish: boolean;
  /** A player must capture at least once before entering the home column. */
  mustCaptureToEnterHome: boolean;
  /** 2 vs 2: red + yellow against green + blue. */
  teams: boolean;
  pawnsPerPlayer: number;
}

export const DEFAULT_RULES: Rules = {
  exitOn: 'six',
  threeSixesForfeit: true,
  exactFinish: true,
  safeSquares: true,
  blocks: false,
  bonusOnCapture: true,
  bonusOnFinish: true,
  mustCaptureToEnterHome: false,
  teams: false,
  pawnsPerPlayer: 4,
};

export interface PlayerInfo {
  color: Color;
  name: string;
}

export interface Capture {
  color: Color;
  pawn: number;
  from: number;
}

export interface Move {
  color: Color;
  pawn: number;
  from: number;
  to: number;
  captures: Capture[];
}

export type GameEvent =
  | { type: 'start' }
  | { type: 'roll'; color: Color; value: number }
  | { type: 'noMoves'; color: Color; value: number }
  | { type: 'threeSixes'; color: Color }
  | MoveEvent
  | { type: 'forfeit'; color: Color }
  | { type: 'win'; colors: Color[]; reason: 'finish' | 'forfeit'; move?: MoveEvent };

export interface MoveEvent {
  type: 'move';
  color: Color;
  pawn: number;
  from: number;
  to: number;
  captures: Capture[];
  extraTurn: boolean;
}

export interface PlayerStats {
  /** Opponent pawns this player sent back to base. */
  captures: number;
  /** Times one of this player's pawns was sent back to base. */
  captured: number;
}

export interface GameState {
  /** Unique per game, so a victory is rewarded only once. */
  id: string;
  rules: Rules;
  players: PlayerInfo[];
  /** Pawns of players still in the game; a player who forfeits has their pawns removed. */
  pawns: Partial<Record<Color, number[]>>;
  stats: Record<Color, PlayerStats>;
  /** Players who left the game and lost. */
  forfeited: Color[];
  current: number;
  phase: 'roll' | 'move' | 'over';
  dice: number | null;
  rollId: number;
  sixStreak: number;
  hasCaptured: Partial<Record<Color, boolean>>;
  legalMoves: Move[];
  winners: Color[];
  lastEvent: GameEvent | null;
}

export class GameError extends Error {}

function newGameId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createGame(players: PlayerInfo[], rules: Partial<Rules> = {}): GameState {
  const fullRules: Rules = { ...DEFAULT_RULES, ...rules };
  fullRules.pawnsPerPlayer = Math.min(4, Math.max(1, Math.round(fullRules.pawnsPerPlayer)));

  if (players.length < 2 || players.length > 4) {
    throw new GameError('Il faut entre 2 et 4 joueurs.');
  }
  if (new Set(players.map((p) => p.color)).size !== players.length) {
    throw new GameError('Chaque joueur doit avoir une couleur différente.');
  }
  if (fullRules.teams && players.length !== 4) {
    throw new GameError('Le mode équipes nécessite 4 joueurs.');
  }
  if (players.length === 2 && !areDiagonal(players[0].color, players[1].color)) {
    throw new GameError('À deux joueurs, les camps doivent être en diagonale : Rouge contre Jaune ou Vert contre Bleu.');
  }

  const ordered = [...players].sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
  const pawns: GameState['pawns'] = {};
  const hasCaptured: GameState['hasCaptured'] = {};
  for (const p of ordered) {
    pawns[p.color] = Array.from({ length: fullRules.pawnsPerPlayer }, () => BASE);
    hasCaptured[p.color] = false;
  }

  return {
    id: newGameId(),
    rules: fullRules,
    players: ordered,
    pawns,
    stats: Object.fromEntries(COLORS.map((c) => [c, { captures: 0, captured: 0 }])) as GameState['stats'],
    forfeited: [],
    current: 0,
    phase: 'roll',
    dice: null,
    rollId: 0,
    sixStreak: 0,
    hasCaptured,
    legalMoves: [],
    winners: [],
    lastEvent: { type: 'start' },
  };
}

export function rollDie(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6);
}

/** Diagonally opposite camps, the only valid pairs for a 2-player game. */
export const DUEL_PAIRS: [Color, Color][] = [
  ['red', 'yellow'],
  ['green', 'blue'],
];

export function areDiagonal(a: Color, b: Color): boolean {
  return TEAMMATE[a] === b;
}

export function areAllies(rules: Rules, a: Color, b: Color): boolean {
  return a === b || (rules.teams && TEAMMATE[a] === b);
}

export function squareAt(color: Color, pos: number): number {
  return (START_INDEX[color] + pos) % TRACK_LENGTH;
}

export function isOnTrack(pos: number): boolean {
  return pos >= 0 && pos < TRACK_LENGTH;
}

export function isSafeSquare(rules: Rules, square: number): boolean {
  return rules.safeSquares && (STAR_SQUARES.includes(square) || START_SQUARES.includes(square));
}

export function allFinished(state: GameState, color: Color): boolean {
  return (state.pawns[color] ?? []).every((p) => p === FINISHED);
}

/** The color moved by a player: in teams mode, a finished player moves for their partner. */
export function controlledColor(state: GameState, playerIndex = state.current): Color {
  const own = state.players[playerIndex].color;
  if (state.rules.teams && allFinished(state, own)) return TEAMMATE[own];
  return own;
}

export function canExitBase(rules: Rules, dice: number): boolean {
  return dice === 6 || (rules.exitOn === 'oneOrSix' && dice === 1);
}

export function canEnterHome(state: GameState, color: Color): boolean {
  return !state.rules.mustCaptureToEnterHome || !!state.hasCaptured[color];
}

export function pawnsOnSquare(state: GameState, square: number): Capture[] {
  const result: Capture[] = [];
  for (const [color, positions] of Object.entries(state.pawns) as [Color, number[]][]) {
    positions.forEach((pos, pawn) => {
      if (isOnTrack(pos) && squareAt(color, pos) === square) result.push({ color, pawn, from: pos });
    });
  }
  return result;
}

function isBlockedFor(state: GameState, square: number, mover: Color): boolean {
  if (!state.rules.blocks) return false;
  const counts = new Map<Color, number>();
  for (const occ of pawnsOnSquare(state, square)) {
    if (areAllies(state.rules, occ.color, mover)) continue;
    counts.set(occ.color, (counts.get(occ.color) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n >= 2);
}

export function computeMove(state: GameState, color: Color, pawn: number, dice: number): Move | null {
  const { rules } = state;
  const from = state.pawns[color]?.[pawn];
  if (from === undefined || from === FINISHED) return null;

  let to: number;
  const passed: number[] = [];

  if (from === BASE) {
    if (!canExitBase(rules, dice)) return null;
    to = 0;
  } else if (from >= HOME_COLUMN_START) {
    const target = from + dice;
    if (target > FINISHED) {
      if (rules.exactFinish) return null;
      to = FINISHED;
    } else {
      to = target;
    }
  } else if (from > LAST_TRACK_STEP || !canEnterHome(state, color)) {
    for (let s = 1; s < dice; s++) passed.push(squareAt(color, from + s));
    to = (from + dice) % TRACK_LENGTH;
  } else {
    const target = from + dice;
    if (target <= LAST_TRACK_STEP) {
      for (let s = 1; s < dice; s++) passed.push(squareAt(color, from + s));
      to = target;
    } else {
      for (let s = from + 1; s <= LAST_TRACK_STEP; s++) passed.push(squareAt(color, s));
      const homeIndex = target - LAST_TRACK_STEP - 1;
      if (homeIndex < HOME_COLUMN_LENGTH) to = HOME_COLUMN_START + homeIndex;
      else if (homeIndex === HOME_COLUMN_LENGTH || !rules.exactFinish) to = FINISHED;
      else return null;
    }
  }

  if (passed.some((sq) => isBlockedFor(state, sq, color))) return null;

  let captures: Capture[] = [];
  if (isOnTrack(to)) {
    const landing = squareAt(color, to);
    if (isBlockedFor(state, landing, color)) return null;
    if (!isSafeSquare(rules, landing)) {
      captures = pawnsOnSquare(state, landing).filter((o) => !areAllies(rules, o.color, color));
    }
  }

  return { color, pawn, from, to, captures };
}

export function getLegalMoves(state: GameState, dice: number): Move[] {
  const color = controlledColor(state);
  const moves: Move[] = [];
  (state.pawns[color] ?? []).forEach((_, pawn) => {
    const move = computeMove(state, color, pawn, dice);
    if (move) moves.push(move);
  });
  return moves;
}

export function activeColors(state: GameState): Color[] {
  return state.players.map((p) => p.color).filter((c) => !state.forfeited.includes(c));
}

function passTurn(state: GameState): GameState {
  const count = state.players.length;
  for (let step = 1; step <= count; step++) {
    const index = (state.current + step) % count;
    if (!state.forfeited.includes(state.players[index].color)) {
      state.current = index;
      break;
    }
  }
  state.sixStreak = 0;
  state.phase = 'roll';
  state.legalMoves = [];
  return state;
}

function findWinners(state: GameState): Color[] | null {
  const colors = activeColors(state);
  if (state.rules.teams) {
    for (const team of [
      ['red', 'yellow'],
      ['green', 'blue'],
    ] as Color[][]) {
      if (team.every((c) => colors.includes(c) && allFinished(state, c))) return team;
    }
    return null;
  }
  const winner = colors.find((c) => allFinished(state, c));
  return winner ? [winner] : null;
}

export function rollDice(state: GameState, value: number): GameState {
  if (state.phase !== 'roll') throw new GameError("Ce n'est pas le moment de lancer le dé.");
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new GameError('Valeur de dé invalide.');

  const next = structuredClone(state);
  const playerColor = next.players[next.current].color;
  next.dice = value;
  next.rollId += 1;
  next.sixStreak = value === 6 ? next.sixStreak + 1 : 0;

  if (next.rules.threeSixesForfeit && next.sixStreak >= 3) {
    next.lastEvent = { type: 'threeSixes', color: playerColor };
    return passTurn(next);
  }

  const moves = getLegalMoves(next, value);
  if (moves.length === 0) {
    next.lastEvent = { type: 'noMoves', color: playerColor, value };
    if (value === 6) {
      next.phase = 'roll';
      return next;
    }
    return passTurn(next);
  }

  next.legalMoves = moves;
  next.phase = 'move';
  next.lastEvent = { type: 'roll', color: playerColor, value };
  return next;
}

/**
 * A player leaves the game and loses: their pawns are removed and their turns skipped.
 * The last player (or team) remaining wins.
 */
export function forfeit(state: GameState, color: Color): GameState {
  if (state.phase === 'over') throw new GameError('La partie est terminée.');
  if (!state.players.some((p) => p.color === color) || state.forfeited.includes(color)) {
    throw new GameError("Ce joueur n'est plus dans la partie.");
  }

  const next = structuredClone(state);
  next.forfeited.push(color);
  delete next.pawns[color];
  next.lastEvent = { type: 'forfeit', color };

  const remaining = activeColors(next);
  const winners = next.rules.teams
    ? remaining.filter((c) => c !== TEAMMATE[color])
    : remaining.length === 1
      ? remaining
      : null;
  if (winners) {
    next.phase = 'over';
    next.winners = winners;
    next.legalMoves = [];
    next.lastEvent = { type: 'win', colors: winners, reason: 'forfeit' };
    return next;
  }

  if (next.players[next.current].color === color) return passTurn(next);
  return next;
}

export function applyMove(state: GameState, pawn: number): GameState {
  if (state.phase !== 'move') throw new GameError("Ce n'est pas le moment de déplacer un pion.");
  const move = state.legalMoves.find((m) => m.pawn === pawn);
  if (!move) throw new GameError('Ce pion ne peut pas bouger.');

  const next = structuredClone(state);
  next.pawns[move.color]![pawn] = move.to;
  const mover = next.players[next.current].color;
  for (const cap of move.captures) {
    next.pawns[cap.color]![cap.pawn] = BASE;
    next.stats[mover].captures++;
    next.stats[cap.color].captured++;
  }
  if (move.captures.length > 0) next.hasCaptured[move.color] = true;
  next.legalMoves = [];

  const extraTurn =
    next.dice === 6 ||
    (next.rules.bonusOnCapture && move.captures.length > 0) ||
    (next.rules.bonusOnFinish && move.to === FINISHED);
  const moveEvent: MoveEvent = {
    type: 'move',
    color: move.color,
    pawn,
    from: move.from,
    to: move.to,
    captures: move.captures,
    extraTurn,
  };

  const winners = findWinners(next);
  if (winners) {
    next.phase = 'over';
    next.winners = winners;
    next.lastEvent = { type: 'win', colors: winners, reason: 'finish', move: moveEvent };
    return next;
  }

  next.lastEvent = moveEvent;
  if (extraTurn) {
    next.phase = 'roll';
    return next;
  }
  return passTurn(next);
}
