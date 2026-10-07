import { BASE, FINISHED, HOME_COLUMN_START, LAST_TRACK_STEP, START_INDEX, type Color } from './constants';
import {
  areAllies,
  canEnterHome,
  canExitBase,
  isOnTrack,
  isSafeSquare,
  pawnsOnSquare,
  squareAt,
  type GameState,
  type Move,
} from './game';

export type BotLevel = 'easy' | 'medium' | 'hard';

/** Rough number of opponent pawns able to capture a pawn standing on `square` next turn. */
function threatAt(state: GameState, color: Color, square: number): number {
  if (isSafeSquare(state.rules, square)) return 0;
  let threat = 0;
  for (const [other, positions] of Object.entries(state.pawns) as [Color, number[]][]) {
    if (areAllies(state.rules, other, color)) continue;
    for (const pos of positions) {
      if (isOnTrack(pos)) {
        const distance = (square - squareAt(other, pos) + 52) % 52;
        if (distance < 1 || distance > 6) continue;
        const turnsHomeFirst =
          pos <= LAST_TRACK_STEP && pos + distance > LAST_TRACK_STEP && canEnterHome(state, other);
        if (!turnsHomeFirst) threat += 1;
      } else if (pos === BASE && square === START_INDEX[other]) {
        threat += canExitBase(state.rules, 1) ? 0.6 : 0.35;
      }
    }
  }
  return threat;
}

function progress(pos: number): number {
  if (pos === BASE) return 0;
  return Math.min(pos, FINISHED) + 1;
}

function scoreMove(state: GameState, move: Move, level: BotLevel): number {
  const { rules } = state;
  const { color, from, to } = move;
  let score = 0;

  if (to === FINISHED) score += 100;
  for (const cap of move.captures) score += 60 + progress(cap.from) * 0.8;
  if (from === BASE) score += 45;
  if (from < HOME_COLUMN_START && to >= HOME_COLUMN_START) score += 35;

  const landing = isOnTrack(to) ? squareAt(color, to) : null;
  if (landing !== null && isSafeSquare(rules, landing)) score += 15;

  const gained = from === BASE ? 0 : to >= from ? to - from : to + 52 - from;
  score += gained * 0.3;

  if (level === 'medium') {
    if (landing !== null) score -= threatAt(state, color, landing) * 8;
    return score;
  }

  const dangerAfter = landing !== null ? threatAt(state, color, landing) : 0;
  const fromSquare = isOnTrack(from) ? squareAt(color, from) : null;
  const dangerBefore = fromSquare !== null ? threatAt(state, color, fromSquare) : 0;
  score -= dangerAfter * (20 + progress(to) * 0.5);
  score += dangerBefore * (15 + progress(from) * 0.5);

  if (rules.blocks) {
    if (landing !== null && pawnsOnSquare(state, landing).some((o) => o.color === color)) score += 12;
    if (fromSquare !== null && pawnsOnSquare(state, fromSquare).filter((o) => o.color === color).length === 2) {
      score -= 8;
    }
  }

  return score;
}

/** Returns the pawn index to move. Requires `state.phase === 'move'`. */
export function chooseMove(state: GameState, level: BotLevel, rng: () => number = Math.random): number {
  const moves = state.legalMoves;
  if (moves.length === 0) throw new Error('Aucun coup possible.');
  if (level === 'easy') return moves[Math.floor(rng() * moves.length)].pawn;

  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = scoreMove(state, move, level) + rng() * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best.pawn;
}
