import { describe, expect, it } from 'vitest';
import {
  chooseDraughtsMove,
  legalDraughtsMoves,
  newDraughtsGame,
  playDraughtsMove,
  draughtsSquare,
  draughtsCoords,
  type DraughtsState,
  type Piece,
  type Side,
} from './draughts';

function position(pieces: Partial<Record<Piece, number[]>>, turn: Side = 'white'): DraughtsState {
  const game = newDraughtsGame();
  const board: (Piece | null)[] = Array(50).fill(null);
  for (const [piece, squares] of Object.entries(pieces) as [Piece, number[]][]) for (const sq of squares) board[sq - 1] = piece;
  return { ...game, board, ids: board.map((p, i) => (p ? i + 1 : 0)), turn, legalMoves: legalDraughtsMoves(board, turn), repetitions: {} };
}

const summary = (state: DraughtsState) => state.legalMoves.map((m) => `${m.from}>${m.to}:${m.captures.join(',')}`).sort();

describe('draughts board', () => {
  it('numbers the dark squares 1 to 50 from the top left', () => {
    expect(draughtsCoords(1)).toEqual({ row: 0, col: 1 });
    expect(draughtsCoords(6)).toEqual({ row: 1, col: 0 });
    expect(draughtsCoords(50)).toEqual({ row: 9, col: 8 });
    for (let sq = 1; sq <= 50; sq++) {
      const { row, col } = draughtsCoords(sq);
      expect(draughtsSquare(row, col)).toBe(sq);
    }
    expect(draughtsSquare(0, 0)).toBeNull();
  });

  it('starts with white to move and 9 possible moves', () => {
    const game = newDraughtsGame();
    expect(game.turn).toBe('white');
    expect(game.legalMoves).toHaveLength(9);
  });
});

describe('draughts rules', () => {
  it('forces a capture when one is available', () => {
    const state = position({ w: [32, 40], b: [27, 5] });
    expect(summary(state)).toEqual(['32>21:27']);
    expect(() => playDraughtsMove(state, 40, 35)).toThrow(/obligatoire/);
  });

  it('lets men capture backwards', () => {
    const state = position({ w: [22], b: [28, 5] });
    expect(summary(state)).toEqual(['22>33:28']);
  });

  it('requires the sequence taking the most pieces', () => {
    const state = position({ w: [32, 34], b: [27, 29, 18, 5] });
    expect(summary(state)).toEqual(['34>12:29,18']);
  });

  it('lets kings fly and land anywhere past the piece they take', () => {
    const state = position({ W: [46], b: [28, 1] });
    expect(summary(state)).toEqual(['46>10:28', '46>14:28', '46>19:28', '46>23:28', '46>5:28']);
  });

  it('crowns a man ending its move on the last row', () => {
    const next = playDraughtsMove(position({ w: [6], b: [15] }), 6, 1);
    expect(next.board[0]).toBe('W');
    expect(next.lastMove?.promoted).toBe(true);
  });

  it('does not crown a man only passing through the last row during a capture', () => {
    const state = position({ w: [12], b: [8, 9, 50] });
    expect(summary(state)).toEqual(['12>14:8,9']);
    const next = playDraughtsMove(state, 12, 14);
    expect(next.board[13]).toBe('w');
    expect(next.board[7]).toBeNull();
    expect(next.board[8]).toBeNull();
  });

  it('wins when the opponent can no longer move', () => {
    const next = playDraughtsMove(position({ w: [31], b: [46] }), 31, 26);
    expect(next.status).toBe('over');
    expect(next.winner).toBe('white');
    expect(next.endReason).toBe('blocked');
  });

  it('draws when the same position comes back three times', () => {
    let state = position({ W: [46], B: [1] });
    const cycle: [number, number][] = [
      [46, 41],
      [1, 7],
      [41, 46],
      [7, 1],
    ];
    for (let i = 0; i < 3; i++) {
      for (const [from, to] of cycle) {
        if (state.status === 'playing') state = playDraughtsMove(state, from, to);
      }
    }
    expect(state.status).toBe('over');
    expect(state.winner).toBeNull();
    expect(state.endReason).toBe('repetition');
  });

  it('keeps track of each piece through a move', () => {
    const game = newDraughtsGame();
    const id = game.ids[31];
    const next = playDraughtsMove(game, 32, 28);
    expect(next.ids[27]).toBe(id);
    expect(next.ids[31]).toBe(0);
  });
});

describe('draughts computer', () => {
  it('always plays a legal move', () => {
    let state = newDraughtsGame();
    for (let i = 0; i < 30 && state.status === 'playing'; i++) {
      const move = chooseDraughtsMove(state, i % 2 ? 'medium' : 'easy');
      expect(state.legalMoves).toContainEqual(move);
      state = playDraughtsMove(state, move.from, move.to, move.captures);
    }
  });

  it('takes a free piece rather than losing one', () => {
    const state = position({ w: [33, 47], b: [28, 3, 4] });
    const move = chooseDraughtsMove(state, 'hard');
    expect(move.captures).toEqual([28]);
  });
});
