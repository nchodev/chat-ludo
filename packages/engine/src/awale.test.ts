import { describe, expect, it } from 'vitest';
import {
  AwaleError,
  chooseAwaleMove,
  legalAwaleMoves,
  newAwaleGame,
  playAwaleMove,
  sowAwale,
  type AwaleState,
} from './awale';

function position(pits: number[], turn: 'white' | 'black' = 'white', store = { white: 0, black: 0 }): AwaleState {
  return { ...newAwaleGame(), pits, turn, store, legalMoves: legalAwaleMoves(pits, turn), repetitions: {} };
}

describe('awalé', () => {
  it('starts with 4 seeds in each of the 12 pits, first player to move', () => {
    const game = newAwaleGame();
    expect(game.pits).toEqual(Array(12).fill(4));
    expect(game.turn).toBe('white');
    expect(game.legalMoves).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('sows counter-clockwise, one seed per pit', () => {
    const next = playAwaleMove(newAwaleGame(), 3);
    expect(next.pits).toEqual([4, 4, 4, 0, 5, 5, 5, 5, 4, 4, 4, 4]);
    expect(next.turn).toBe('black');
    expect(next.lastMove?.sown).toEqual([4, 5, 6, 7]);
  });

  it('skips the emptied pit when sowing 12 seeds or more', () => {
    const pits = [12, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const { pits: after, move } = sowAwale(pits, 0);
    expect(after[0]).toBe(0);
    expect(move.sown).toHaveLength(12);
    expect(move.sown).not.toContain(0);
  });

  it('captures 2 or 3 in the last pit and the pits before it on the opponent side', () => {
    // Sowing pit 5 (3 seeds) lands in 6, 7, 8 making 2, 3, 2: all three are taken.
    const game = position([1, 0, 0, 0, 0, 3, 1, 2, 1, 4, 0, 0]);
    const next = playAwaleMove(game, 5);
    expect(next.lastMove?.captured).toEqual([8, 7, 6]);
    expect(next.store.white).toBe(7);
    expect(next.pits.slice(6, 9)).toEqual([0, 0, 0]);
  });

  it('stops the capture at a pit that does not hold 2 or 3', () => {
    const game = position([1, 0, 0, 0, 0, 3, 1, 5, 1, 4, 0, 0]);
    const next = playAwaleMove(game, 5);
    expect(next.lastMove?.captured).toEqual([8]);
    expect(next.store.white).toBe(2);
  });

  it('takes nothing when the capture would leave the opponent without any seed (grand slam)', () => {
    const game = position([1, 0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 0]);
    const next = playAwaleMove(game, 5);
    expect(next.lastMove?.slam).toBe(true);
    expect(next.store.white).toBe(0);
    expect(next.pits.slice(6, 8)).toEqual([2, 3]);
  });

  it('forces a move that feeds an opponent with no seed', () => {
    const game = position([3, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(game.legalMoves).toEqual([4]);
    expect(() => playAwaleMove(game, 0)).toThrow(AwaleError);
  });

  it('ends when the opponent cannot be fed: each keeps the seeds of their side', () => {
    // Black plays its last seed into pit 0; white has 1 seed in pit 0... then cannot reach black.
    const game = position([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 'black', { white: 23, black: 22 });
    const after = playAwaleMove(game, 11);
    // White now has 1 seed in pit 0 and cannot give black anything: white keeps it.
    expect(after.status).toBe('over');
    expect(after.endReason).toBe('starved');
    expect(after.store).toEqual({ white: 24, black: 22 });
    expect(after.winner).toBe('white');
  });

  it('wins at 25 seeds', () => {
    const game = position([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 3], 'white', { white: 23, black: 20 });
    const next = playAwaleMove(game, 5);
    expect(next.status).toBe('over');
    expect(next.endReason).toBe('majority');
    expect(next.winner).toBe('white');
  });

  it('keeps 48 seeds in play over a whole game', () => {
    let game = newAwaleGame();
    let guard = 0;
    while (game.status === 'playing' && guard++ < 400) {
      game = playAwaleMove(game, game.legalMoves[guard % game.legalMoves.length]);
      const total = game.pits.reduce((a, b) => a + b, 0) + game.store.white + game.store.black;
      expect(total).toBe(48);
    }
    expect(game.status).toBe('over');
  });

  it('the computer takes a capture when one is there', () => {
    const game = position([1, 0, 0, 0, 0, 3, 1, 2, 1, 4, 0, 0]);
    expect(chooseAwaleMove(game, 'medium', () => 0.5)).toBe(5);
  });

  it('the hard computer beats the easy one', () => {
    let wins = 0;
    for (let g = 0; g < 4; g++) {
      let game = newAwaleGame();
      const hard = g % 2 === 0 ? 'white' : 'black';
      let seed = g + 1;
      const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      while (game.status === 'playing') game = playAwaleMove(game, chooseAwaleMove(game, game.turn === hard ? 'hard' : 'easy', random));
      if (game.winner === hard) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  }, 30_000);
});
