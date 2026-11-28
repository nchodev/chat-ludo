/**
 * Awalé (abapa rules): 12 pits of 4 seeds, 6 per player. A player takes every seed of one of their
 * pits and sows them one by one counter-clockwise, skipping the pit emptied. If the last seed makes
 * 2 or 3 in an opponent's pit, those seeds are taken, then the pits before it on the opponent's side
 * while they hold 2 or 3. A capture that would take every opponent seed (grand slam) takes nothing.
 * When the opponent has no seed, the move must give them some; if none can, the game ends.
 * 25 seeds win; at 24 each it is a draw.
 *
 * Pits 0–5 belong to the first player (`white`, shown at the bottom, left to right), 6–11 to the
 * second (`black`, at the top, right to left), so sowing goes up the indices.
 */

import type { Side } from './draughts';

export const AWALE_PITS = 12;
export const AWALE_SEEDS = 48;
const WIN = AWALE_SEEDS / 2 + 1;
/** 50 moves each without a capture: the seeds left go round forever. */
const QUIET_LIMIT = 100;

export interface AwaleMove {
  side: Side;
  pit: number;
  /** Pits that received a seed, in order. */
  sown: number[];
  /** Pits emptied by the capture, from the last seed backwards. */
  captured: number[];
  /** Seeds taken. */
  seeds: number;
  /** The capture would have taken all the opponent's seeds, so nothing was taken. */
  slam: boolean;
}

export type AwaleEnd =
  /** One player has more than half of the seeds. */
  | 'majority'
  /** The player to move could not give the opponent any seed: each keeps the seeds of their side. */
  | 'starved'
  /** The same seeds went round without any capture: each keeps the seeds of their side. */
  | 'cycle'
  | 'resign'
  | 'timeout'
  | 'abandon'
  | 'agreement'
  /** A first move wasn't played in time: cancelled, stakes given back. */
  | 'aborted';

export interface AwaleState {
  id: string;
  pits: number[];
  store: Record<Side, number>;
  turn: Side;
  /** Pits the side to move may play. */
  legalMoves: number[];
  history: AwaleMove[];
  lastMove: AwaleMove | null;
  /** Moves since the last capture (both sides together). */
  quietMoves: number;
  /** Times each position was reached since the last capture. */
  repetitions: Record<string, number>;
  status: 'playing' | 'over';
  /** Null at the end of a drawn game. */
  winner: Side | null;
  endReason: AwaleEnd | null;
}

export class AwaleError extends Error {}

const other = (side: Side): Side => (side === 'white' ? 'black' : 'white');

export function awalePitSide(pit: number): Side {
  return pit < 6 ? 'white' : 'black';
}

/** Pits of a side, in sowing order. */
export function awalePitsOf(side: Side): number[] {
  return side === 'white' ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
}

function seedsOf(pits: number[], side: Side) {
  return awalePitsOf(side).reduce((n, p) => n + pits[p], 0);
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function positionKey(pits: number[], turn: Side) {
  return `${turn[0]}${pits.join(',')}`;
}

/** The board after sowing `pit`, without checking it is legal. */
export function sowAwale(pits: number[], pit: number): { pits: number[]; move: Omit<AwaleMove, 'side'> } {
  const side = awalePitSide(pit);
  const next = pits.slice();
  let seeds = next[pit];
  next[pit] = 0;
  const sown: number[] = [];
  let at = pit;
  while (seeds > 0) {
    at = (at + 1) % AWALE_PITS;
    if (at === pit) continue;
    next[at]++;
    sown.push(at);
    seeds--;
  }
  const captured: number[] = [];
  let taken = 0;
  for (let p = at; awalePitSide(p) !== side && (next[p] === 2 || next[p] === 3); p = (p + AWALE_PITS - 1) % AWALE_PITS) {
    captured.push(p);
    taken += next[p];
  }
  const slam = captured.length > 0 && taken === seedsOf(next, other(side));
  if (slam || captured.length === 0) return { pits: next, move: { pit, sown, captured: [], seeds: 0, slam } };
  for (const p of captured) next[p] = 0;
  return { pits: next, move: { pit, sown, captured, seeds: taken, slam: false } };
}

/** Pits `side` may play: any non-empty pit, but only those feeding the opponent if they have no seed. */
export function legalAwaleMoves(pits: number[], side: Side): number[] {
  const own = awalePitsOf(side).filter((p) => pits[p] > 0);
  if (seedsOf(pits, other(side)) > 0) return own;
  return own.filter((p) => seedsOf(sowAwale(pits, p).pits, other(side)) > 0);
}

export function newAwaleGame(): AwaleState {
  const pits = Array.from({ length: AWALE_PITS }, () => AWALE_SEEDS / AWALE_PITS);
  return {
    id: newId(),
    pits,
    store: { white: 0, black: 0 },
    turn: 'white',
    legalMoves: legalAwaleMoves(pits, 'white'),
    history: [],
    lastMove: null,
    quietMoves: 0,
    repetitions: { [positionKey(pits, 'white')]: 1 },
    status: 'playing',
    winner: null,
    endReason: null,
  };
}

/** Ends the game; `winner` null is a draw. */
export function endAwaleGame(state: AwaleState, winner: Side | null, reason: AwaleEnd): AwaleState {
  if (state.status === 'over') return state;
  return { ...state, status: 'over', winner, endReason: reason, legalMoves: [] };
}

/** Each player takes the seeds left on their side, then the bigger store wins. */
function endBySharing(state: AwaleState, reason: AwaleEnd): AwaleState {
  const store = { white: state.store.white + seedsOf(state.pits, 'white'), black: state.store.black + seedsOf(state.pits, 'black') };
  const pits = state.pits.map(() => 0);
  const winner = store.white === store.black ? null : store.white > store.black ? 'white' : 'black';
  return endAwaleGame({ ...state, pits, store }, winner, reason);
}

export function playAwaleMove(state: AwaleState, pit: number): AwaleState {
  if (state.status !== 'playing') throw new AwaleError('La partie est terminée.');
  if (!state.legalMoves.includes(pit)) {
    const starving = Number.isInteger(pit) && pit >= 0 && pit < AWALE_PITS && awalePitSide(pit) === state.turn && state.pits[pit] > 0;
    throw new AwaleError(starving ? 'Ton adversaire n’a plus de graines : tu dois lui en donner.' : 'Coup impossible.');
  }
  const { pits, move } = sowAwale(state.pits, pit);
  const played: AwaleMove = { side: state.turn, ...move };
  const store = { ...state.store, [state.turn]: state.store[state.turn] + move.seeds };
  const turn = other(state.turn);
  const key = positionKey(pits, turn);
  const repetitions = move.seeds ? { [key]: 1 } : { ...state.repetitions, [key]: (state.repetitions[key] ?? 0) + 1 };
  const next: AwaleState = {
    ...state,
    pits,
    store,
    turn,
    legalMoves: legalAwaleMoves(pits, turn),
    history: [...state.history, played],
    lastMove: played,
    quietMoves: move.seeds ? 0 : state.quietMoves + 1,
    repetitions,
  };
  if (store[played.side] >= WIN) return endAwaleGame(next, played.side, 'majority');
  if (next.legalMoves.length === 0) return endBySharing(next, 'starved');
  if (repetitions[key] >= 3 || next.quietMoves >= QUIET_LIMIT) return endBySharing(next, 'cycle');
  return next;
}

export const AWALE_END_TEXT: Record<AwaleEnd, string> = {
  majority: 'plus de la moitié des graines',
  starved: 'impossible de nourrir l’adversaire',
  cycle: 'les graines tournent sans prise',
  resign: 'abandon',
  timeout: 'temps écoulé',
  abandon: 'partie quittée',
  agreement: 'nulle acceptée',
  aborted: 'premier coup non joué : partie annulée',
};

/* ---------- Computer opponent ---------- */

export type AwaleBotLevel = 'easy' | 'medium' | 'hard';

interface Node {
  pits: number[];
  store: Record<Side, number>;
}

function evaluate(node: Node, side: Side): number {
  // Seeds kept on one's side are worth a little: they can't be taken by the opponent yet.
  return (node.store[side] - node.store[other(side)]) * 10 + (seedsOf(node.pits, side) - seedsOf(node.pits, other(side)));
}

function search(node: Node, side: Side, depth: number, alpha: number, beta: number, budget: { nodes: number }): number {
  if (node.store[side] >= WIN) return 10_000 + depth;
  if (node.store[other(side)] >= WIN) return -10_000 - depth;
  const moves = legalAwaleMoves(node.pits, side);
  if (moves.length === 0) {
    const mine = node.store[side] + seedsOf(node.pits, side);
    const theirs = node.store[other(side)] + seedsOf(node.pits, other(side));
    return mine === theirs ? 0 : mine > theirs ? 10_000 + depth : -10_000 - depth;
  }
  if (depth <= 0 || budget.nodes <= 0) return evaluate(node, side);
  budget.nodes--;
  let best = -Infinity;
  for (const pit of moves) {
    const { pits, move } = sowAwale(node.pits, pit);
    const store = { ...node.store, [side]: node.store[side] + move.seeds };
    const score = -search({ pits, store }, other(side), depth - 1, -beta, -alpha, budget);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const BOT_DEPTH: Record<AwaleBotLevel, number> = { easy: 2, medium: 5, hard: 9 };

/** Picks the computer's pit for the player to move. */
export function chooseAwaleMove(state: AwaleState, level: AwaleBotLevel, random: () => number = Math.random): number {
  const moves = state.legalMoves;
  if (moves.length === 1) return moves[0];
  if (level === 'easy' && random() < 0.4) return moves[Math.floor(random() * moves.length)];
  const budget = { nodes: level === 'hard' ? 400_000 : 40_000 };
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const pit of moves) {
    const { pits, move } = sowAwale(state.pits, pit);
    const store = { ...state.store, [state.turn]: state.store[state.turn] + move.seeds };
    const score = -search({ pits, store }, other(state.turn), BOT_DEPTH[level] - 1, -Infinity, Infinity, budget);
    if (score > bestScore) {
      bestScore = score;
      best = [pit];
    } else if (score === bestScore) best.push(pit);
  }
  return best[Math.floor(random() * best.length)];
}

/** Thinking time of each player for a whole online game. */
export const AWALE_CLOCK_MS = 10 * 60_000; // default; rooms may pick more (DUEL_MINUTES)
