import { describe, expect, it } from 'vitest';
import { BASE, FINISHED, HOME_COLUMN_START, applyMove, computeReward, createGame, forfeit, rollDice, type GameState } from './index';

const duel = [
  { color: 'red' as const, name: 'Rouge' },
  { color: 'yellow' as const, name: 'Jaune' },
];
const hardBot = () => ({ kind: 'bot', level: 'hard' }) as const;

/** Red wins by bringing its last pawn home. */
function redWins(base: GameState): GameState {
  const g: GameState = {
    ...base,
    pawns: { ...base.pawns, red: [FINISHED, FINISHED, FINISHED, HOME_COLUMN_START + 3] },
  };
  return applyMove(rollDice(g, 2), 3);
}

describe('récompenses', () => {
  it("rien tant que la partie n'est pas finie, ni pour le perdant", () => {
    const g = createGame(duel);
    expect(computeReward(g, 'red', hardBot)).toBeNull();
    const over = redWins(g);
    expect(computeReward(over, 'yellow', hardBot)).toBeNull();
  });

  it("dépend de l'adversaire battu, avec le bonus sans faute", () => {
    const over = redWins(createGame(duel));
    expect(computeReward(over, 'red', hardBot)).toEqual({
      total: 50 + 20,
      lines: [
        { type: 'opponent', color: 'yellow', opponent: { kind: 'bot', level: 'hard' }, forfeited: false, coins: 50 },
        { type: 'flawless', coins: 20 },
      ],
    });
    expect(computeReward(over, 'red', () => ({ kind: 'bot', level: 'easy' }))!.total).toBe(10 + 20);
    expect(computeReward(over, 'red', () => ({ kind: 'human', online: true }))!.total).toBe(40 + 20);
    expect(computeReward(over, 'red', () => ({ kind: 'human', online: false }))!.total).toBe(15 + 20);
  });

  it('compte les captures et retire le bonus sans faute si on a été capturé', () => {
    // Red at step 7 captures yellow at its step 36 (= square 10) with a 3.
    let g = createGame(duel);
    g = { ...g, pawns: { red: [7, BASE, BASE, BASE], yellow: [36, BASE, BASE, BASE] } };
    g = applyMove(rollDice(g, 3), 0);
    expect(g.stats.red.captures).toBe(1);
    expect(g.stats.yellow.captured).toBe(1);

    g = { ...g, current: 0, phase: 'roll', stats: { ...g.stats, red: { captures: 1, captured: 2 } } };
    const reward = computeReward(redWins(g), 'red', hardBot)!;
    expect(reward.lines.map((l) => l.type)).toEqual(['opponent', 'captures']);
    expect(reward.total).toBe(50 + 5);
  });

  it('plafonne le bonus de captures', () => {
    const g = createGame(duel);
    const over = redWins({ ...g, stats: { ...g.stats, red: { captures: 20, captured: 1 } } });
    expect(computeReward(over, 'red', hardBot)!.total).toBe(50 + 30);
  });

  it("donne la moitié pour un adversaire qui abandonne, sans bonus sans faute", () => {
    const over = forfeit(createGame(duel), 'yellow');
    const reward = computeReward(over, 'red', () => ({ kind: 'human', online: true }))!;
    expect(reward.total).toBe(20);
    expect(reward.lines).toEqual([
      { type: 'opponent', color: 'yellow', opponent: { kind: 'human', online: true }, forfeited: true, coins: 20 },
    ]);
  });

  it('chaque partie a un identifiant unique', () => {
    expect(createGame(duel).id).not.toBe(createGame(duel).id);
  });
});
