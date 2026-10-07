import { describe, expect, it } from 'vitest';
import { BASE, applyMove, botReaction, createGame, eventKey, forfeit, getReaction, isReactionId, rollDice } from './index';

const duel = [
  { color: 'red' as const, name: 'Rouge' },
  { color: 'yellow' as const, name: 'Jaune' },
];
const always = () => 0;

function captureByRed() {
  // Red at step 7 captures yellow at its step 36 (= square 10) with a 3.
  const g = createGame(duel);
  return applyMove(rollDice({ ...g, pawns: { red: [7, BASE, BASE, BASE], yellow: [36, BASE, BASE, BASE] } }, 3), 0);
}

describe('réactions', () => {
  it('ne connaît que la liste fixe', () => {
    expect(isReactionId('hurry')).toBe(true);
    expect(isReactionId('<script>')).toBe(false);
    expect(getReaction('hurry')?.text).toBe('Dépêche-toi !');
  });

  it('un ordi capturé ou qui capture peut réagir', () => {
    const g = captureByRed();
    expect(['bye', 'laugh', 'easy', 'cool']).toContain(botReaction(g, ['red'], always)?.reaction);
    expect(['revenge', 'angry', 'cry', 'oops']).toContain(botReaction(g, ['yellow'], always)?.reaction);
    expect(botReaction(g, ['red'], () => 0.99)).toBeNull();
  });

  it('pas de réaction sans événement marquant ni sans ordi', () => {
    expect(botReaction(rollDice(createGame(duel), 3), ['red'], always)).toBeNull();
    expect(botReaction(captureByRed(), [], always)).toBeNull();
  });

  it('réagit à la fin de partie', () => {
    const over = forfeit(createGame(duel), 'yellow');
    expect(botReaction(over, ['red'], always)?.color).toBe('red');
  });

  it("la clé d'événement change à chaque coup", () => {
    const g = createGame(duel);
    const rolled = rollDice(g, 6);
    expect(eventKey(rolled)).not.toBe(eventKey(applyMove(rolled, 0)));
  });
});
