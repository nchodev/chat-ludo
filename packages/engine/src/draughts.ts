/**
 * International draughts (10×10): 20 pieces each, men move forward and capture both ways,
 * capturing is compulsory and the sequence taking the most pieces must be played, kings fly.
 * Squares use the standard numbering 1–50, black at the top (1–20), white at the bottom (31–50).
 */

import type { DuelRoomViewOf } from './duel';

export type Side = 'white' | 'black';
/** `w`/`b` are men, `W`/`B` kings. */
export type Piece = 'w' | 'b' | 'W' | 'B';

export interface DraughtsMove {
  from: number;
  to: number;
  /** Squares landed on after `from`, the last one being `to` (several for a multiple capture). */
  path: number[];
  /** Squares of the pieces taken, in order. */
  captures: number[];
}

export interface PlayedMove extends DraughtsMove {
  side: Side;
  /** The man reached the last row and became a king. */
  promoted: boolean;
}

export type DraughtsEnd =
  /** The player to move had no piece or no legal move left. */
  | 'blocked'
  | 'resign'
  | 'timeout'
  /** Left the game or stayed disconnected. */
  | 'abandon'
  /** Same position for the third time. */
  | 'repetition'
  /** 25 moves each with only kings moved and nothing taken. */
  | 'kings-only'
  | 'agreement'
  /** A first move wasn't played in time: cancelled, stakes given back. */
  | 'aborted';

export interface DraughtsState {
  id: string;
  /** Index i is square i + 1. */
  board: (Piece | null)[];
  /** Stable id of the piece on each square (0 when empty), so a UI can animate pieces. */
  ids: number[];
  turn: Side;
  legalMoves: DraughtsMove[];
  history: PlayedMove[];
  lastMove: PlayedMove | null;
  /** Consecutive moves by kings without a capture (both sides together). */
  quietKingMoves: number;
  /** Times each position was reached since the last irreversible move. */
  repetitions: Record<string, number>;
  status: 'playing' | 'over';
  /** Null at the end of a drawn game. */
  winner: Side | null;
  endReason: DraughtsEnd | null;
}

export class DraughtsError extends Error {}

export const DRAUGHTS_SQUARES = 50;
export const DRAUGHTS_SIZE = 10;
/** 25 moves each. */
const KINGS_ONLY_LIMIT = 50;
const DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

export const otherSide = (side: Side): Side => (side === 'white' ? 'black' : 'white');
export const sideOf = (piece: Piece): Side => (piece === 'w' || piece === 'W' ? 'white' : 'black');
export const isKing = (piece: Piece) => piece === 'W' || piece === 'B';

/** Row 0 is at the top (black's side), column 0 on the left. */
export function draughtsCoords(square: number): { row: number; col: number } {
  const row = Math.floor((square - 1) / 5);
  const i = (square - 1) % 5;
  return { row, col: row % 2 === 0 ? 2 * i + 1 : 2 * i };
}

export function draughtsSquare(row: number, col: number): number | null {
  if (row < 0 || row >= DRAUGHTS_SIZE || col < 0 || col >= DRAUGHTS_SIZE || (row + col) % 2 === 0) return null;
  return row * 5 + Math.floor(col / 2) + 1;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function initialBoard(): (Piece | null)[] {
  return Array.from({ length: DRAUGHTS_SQUARES }, (_, i) => (i < 20 ? 'b' : i >= 30 ? 'w' : null));
}

function positionKey(board: (Piece | null)[], turn: Side) {
  return turn[0] + board.map((p) => p ?? '.').join('');
}

/** Every capture sequence the piece on `from` can make, before applying the majority rule. */
function captureSequences(board: (Piece | null)[], from: number): DraughtsMove[] {
  const piece = board[from - 1]!;
  const side = sideOf(piece);
  const king = isKing(piece);
  const results: DraughtsMove[] = [];
  // The moving piece has left its square; taken pieces stay on the board until the end of the sequence.
  const empty = (sq: number) => sq === from || board[sq - 1] === null;
  const enemy = (sq: number) => sq !== from && board[sq - 1] !== null && sideOf(board[sq - 1]!) !== side;

  const search = (pos: number, path: number[], taken: number[]) => {
    const { row, col } = draughtsCoords(pos);
    let extended = false;
    for (const [dr, dc] of DIRECTIONS) {
      if (king) {
        let r = row + dr;
        let c = col + dc;
        let sq = draughtsSquare(r, c);
        while (sq !== null && empty(sq)) {
          r += dr;
          c += dc;
          sq = draughtsSquare(r, c);
        }
        if (sq === null || !enemy(sq) || taken.includes(sq)) continue;
        const victim = sq;
        r += dr;
        c += dc;
        sq = draughtsSquare(r, c);
        while (sq !== null && empty(sq)) {
          extended = true;
          search(sq, [...path, sq], [...taken, victim]);
          r += dr;
          c += dc;
          sq = draughtsSquare(r, c);
        }
      } else {
        const victim = draughtsSquare(row + dr, col + dc);
        const landing = draughtsSquare(row + 2 * dr, col + 2 * dc);
        if (victim === null || landing === null || !enemy(victim) || taken.includes(victim) || !empty(landing)) continue;
        extended = true;
        search(landing, [...path, landing], [...taken, victim]);
      }
    }
    if (!extended && taken.length) results.push({ from, to: pos, path, captures: taken });
  };
  search(from, [], []);
  return results;
}

function quietMoves(board: (Piece | null)[], from: number): DraughtsMove[] {
  const piece = board[from - 1]!;
  const { row, col } = draughtsCoords(from);
  const forward = sideOf(piece) === 'white' ? -1 : 1;
  const moves: DraughtsMove[] = [];
  for (const [dr, dc] of DIRECTIONS) {
    if (!isKing(piece) && dr !== forward) continue;
    let r = row + dr;
    let c = col + dc;
    let sq = draughtsSquare(r, c);
    while (sq !== null && board[sq - 1] === null) {
      moves.push({ from, to: sq, path: [sq], captures: [] });
      if (!isKing(piece)) break;
      r += dr;
      c += dc;
      sq = draughtsSquare(r, c);
    }
  }
  return moves;
}

/** Legal moves of `side`: the captures taking the most pieces if any capture exists, else every plain move. */
export function legalDraughtsMoves(board: (Piece | null)[], side: Side): DraughtsMove[] {
  const own: number[] = [];
  board.forEach((p, i) => p && sideOf(p) === side && own.push(i + 1));
  const captures = own.flatMap((sq) => captureSequences(board, sq));
  if (captures.length) {
    const most = Math.max(...captures.map((m) => m.captures.length));
    const seen = new Set<string>();
    return captures.filter((m) => {
      if (m.captures.length !== most) return false;
      // The same pieces taken from the same start to the same end is one move, whatever the route.
      const key = `${m.from}-${m.to}-${[...m.captures].sort((a, b) => a - b).join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return own.flatMap((sq) => quietMoves(board, sq));
}

export function newDraughtsGame(): DraughtsState {
  const board = initialBoard();
  return {
    id: newId(),
    board,
    ids: board.map((p, i) => (p ? i + 1 : 0)),
    turn: 'white',
    legalMoves: legalDraughtsMoves(board, 'white'),
    history: [],
    lastMove: null,
    quietKingMoves: 0,
    repetitions: { [positionKey(board, 'white')]: 1 },
    status: 'playing',
    winner: null,
    endReason: null,
  };
}

/** The board after a move, without checking it is legal. */
export function applyToBoard(board: (Piece | null)[], move: DraughtsMove): { board: (Piece | null)[]; promoted: boolean } {
  const next = board.slice();
  const piece = next[move.from - 1]!;
  next[move.from - 1] = null;
  for (const sq of move.captures) next[sq - 1] = null;
  const { row } = draughtsCoords(move.to);
  const promoted = (piece === 'w' && row === 0) || (piece === 'b' && row === DRAUGHTS_SIZE - 1);
  next[move.to - 1] = promoted ? (piece === 'w' ? 'W' : 'B') : piece;
  return { board: next, promoted };
}

/**
 * Finds the legal move going from `from` to `to`. When several routes take different pieces,
 * `captures` tells them apart.
 */
export function findDraughtsMove(state: DraughtsState, from: number, to: number, captures?: number[]): DraughtsMove | null {
  const candidates = state.legalMoves.filter((m) => m.from === from && m.to === to);
  if (candidates.length <= 1 || !captures) return candidates[0] ?? null;
  const wanted = [...captures].sort((a, b) => a - b).join(',');
  return candidates.find((m) => [...m.captures].sort((a, b) => a - b).join(',') === wanted) ?? candidates[0];
}

export function playDraughtsMove(state: DraughtsState, from: number, to: number, captures?: number[]): DraughtsState {
  if (state.status !== 'playing') throw new DraughtsError('La partie est terminée.');
  const move = findDraughtsMove(state, from, to, captures);
  if (!move) {
    const mustCapture = state.legalMoves.some((m) => m.captures.length);
    throw new DraughtsError(mustCapture ? 'La prise est obligatoire, et il faut prendre le plus de pièces possible.' : 'Coup impossible.');
  }
  const movedPiece = state.board[move.from - 1]!;
  const { board, promoted } = applyToBoard(state.board, move);
  const ids = state.ids.slice();
  const id = ids[move.from - 1];
  ids[move.from - 1] = 0;
  for (const sq of move.captures) ids[sq - 1] = 0;
  ids[move.to - 1] = id;

  const played: PlayedMove = { ...move, side: state.turn, promoted };
  const turn = otherSide(state.turn);
  const irreversible = !isKing(movedPiece) || move.captures.length > 0;
  const quietKingMoves = irreversible ? 0 : state.quietKingMoves + 1;
  const key = positionKey(board, turn);
  const repetitions = irreversible ? { [key]: 1 } : { ...state.repetitions, [key]: (state.repetitions[key] ?? 0) + 1 };
  const legalMoves = legalDraughtsMoves(board, turn);

  const next: DraughtsState = {
    ...state,
    board,
    ids,
    turn,
    legalMoves,
    history: [...state.history, played],
    lastMove: played,
    quietKingMoves,
    repetitions,
  };
  if (legalMoves.length === 0) return endDraughtsGame(next, state.turn, 'blocked');
  if (repetitions[key] >= 3) return endDraughtsGame(next, null, 'repetition');
  if (quietKingMoves >= KINGS_ONLY_LIMIT) return endDraughtsGame(next, null, 'kings-only');
  return next;
}

/** Ends the game; `winner` null is a draw. */
export function endDraughtsGame(state: DraughtsState, winner: Side | null, reason: DraughtsEnd): DraughtsState {
  if (state.status === 'over') return state;
  return { ...state, status: 'over', winner, endReason: reason, legalMoves: [] };
}

export function countPieces(board: (Piece | null)[]) {
  const count = { white: 0, black: 0, whiteKings: 0, blackKings: 0 };
  for (const p of board) {
    if (!p) continue;
    count[sideOf(p)]++;
    if (p === 'W') count.whiteKings++;
    if (p === 'B') count.blackKings++;
  }
  return count;
}

export function moveNotation(move: DraughtsMove) {
  return move.captures.length ? [move.from, ...move.path].join('x') : `${move.from}-${move.to}`;
}

export const END_REASON_TEXT: Record<DraughtsEnd, string> = {
  blocked: 'plus aucun coup possible',
  resign: 'abandon',
  timeout: 'temps écoulé',
  abandon: 'partie quittée',
  repetition: 'même position trois fois',
  'kings-only': '25 coups de dames sans prise',
  agreement: 'nulle acceptée',
  aborted: 'premier coup non joué : partie annulée',
};

/* ---------- Computer opponent ---------- */

export type DraughtsBotLevel = 'easy' | 'medium' | 'hard';

const MAN = 100;
const KING = 330;

function evaluate(board: (Piece | null)[], side: Side): number {
  let score = 0;
  for (let i = 0; i < DRAUGHTS_SQUARES; i++) {
    const p = board[i];
    if (!p) continue;
    const { row, col } = draughtsCoords(i + 1);
    let value: number;
    if (isKing(p)) value = KING;
    else {
      // Men are worth more as they get closer to promotion, and in the centre.
      const advance = p === 'w' ? DRAUGHTS_SIZE - 1 - row : row;
      value = MAN + advance * 3 + (col >= 2 && col <= 7 ? 4 : 0);
      // Keeping the back row guarded stops the opponent from crowning.
      if ((p === 'w' && row === 9) || (p === 'b' && row === 0)) value += 6;
    }
    score += sideOf(p) === side ? value : -value;
  }
  return score;
}

function search(board: (Piece | null)[], side: Side, depth: number, alpha: number, beta: number, budget: { nodes: number }): number {
  const moves = legalDraughtsMoves(board, side);
  if (moves.length === 0) return -100_000 - depth;
  // Captures must be played out before judging a position.
  if ((depth <= 0 && !moves[0].captures.length) || budget.nodes <= 0) return evaluate(board, side);
  budget.nodes--;
  let best = -Infinity;
  for (const move of moves) {
    const score = -search(applyToBoard(board, move).board, otherSide(side), depth - 1, -beta, -alpha, budget);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const BOT_DEPTH: Record<DraughtsBotLevel, number> = { easy: 1, medium: 3, hard: 6 };

/** Picks the computer's move for the player to move. */
export function chooseDraughtsMove(state: DraughtsState, level: DraughtsBotLevel, random: () => number = Math.random): DraughtsMove {
  const moves = state.legalMoves;
  if (moves.length === 1) return moves[0];
  if (level === 'easy' && random() < 0.35) return moves[Math.floor(random() * moves.length)];
  const budget = { nodes: level === 'hard' ? 120_000 : 30_000 };
  let best: DraughtsMove[] = [];
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = -search(applyToBoard(state.board, move).board, otherSide(state.turn), BOT_DEPTH[level] - 1, -Infinity, Infinity, budget);
    if (score > bestScore) {
      bestScore = score;
      best = [move];
    } else if (score === bestScore) best.push(move);
  }
  return best[Math.floor(random() * best.length)];
}

/* ---------- Online play ---------- */

/** Thinking time of each player for a whole online game. */
export const DRAUGHTS_CLOCK_MS = 10 * 60_000; // default; rooms may pick more (DUEL_MINUTES)

export type { DuelSeatView as DraughtsSeatView, DuelQueueStatus as DraughtsQueueStatus } from './duel';
export type DraughtsRoomView = DuelRoomViewOf<'dames'>;
