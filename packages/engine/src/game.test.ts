import { describe, expect, it } from 'vitest';
import {
  BASE,
  FINISHED,
  HOME_COLUMN_START,
  applyMove,
  chooseMove,
  createGame,
  forfeit,
  rollDice,
  rollDie,
  type BotLevel,
  type GameState,
  type Rules,
} from './index';

const twoPlayers = [
  { color: 'red' as const, name: 'Rouge' },
  { color: 'yellow' as const, name: 'Jaune' },
];
const fourPlayers = [
  { color: 'red' as const, name: 'R' },
  { color: 'green' as const, name: 'G' },
  { color: 'yellow' as const, name: 'Y' },
  { color: 'blue' as const, name: 'B' },
];

function withPawns(state: GameState, pawns: GameState['pawns']): GameState {
  return { ...state, pawns: { ...state.pawns, ...pawns } };
}

describe('sortie de base', () => {
  it('exige un 6 par défaut', () => {
    const g = createGame(twoPlayers);
    const after = rollDice(g, 3);
    expect(after.lastEvent?.type).toBe('noMoves');
    expect(after.current).toBe(1);
  });

  it('accepte un 1 avec la variante 1 ou 6', () => {
    const g = createGame(twoPlayers, { exitOn: 'oneOrSix' });
    const after = rollDice(g, 1);
    expect(after.phase).toBe('move');
    expect(applyMove(after, 0).pawns.red![0]).toBe(0);
  });

  it('un 6 donne un tour supplémentaire', () => {
    const g = applyMove(rollDice(createGame(twoPlayers), 6), 0);
    expect(g.current).toBe(0);
    expect(g.phase).toBe('roll');
  });
});

describe('trois 6', () => {
  it('fait perdre le tour', () => {
    let g = createGame(twoPlayers);
    g = applyMove(rollDice(g, 6), 0);
    g = applyMove(rollDice(g, 6), 0);
    g = rollDice(g, 6);
    expect(g.lastEvent?.type).toBe('threeSixes');
    expect(g.current).toBe(1);
  });

  it('peut être désactivé', () => {
    let g = createGame(twoPlayers, { threeSixesForfeit: false });
    g = applyMove(rollDice(g, 6), 0);
    g = applyMove(rollDice(g, 6), 0);
    g = rollDice(g, 6);
    expect(g.phase).toBe('move');
  });
});

describe('captures et cases sûres', () => {
  it('capture un pion adverse', () => {
    // Red pawn at step 10 (square 10); yellow at its step 36 -> square (26+36)%52 = 10.
    let g = withPawns(createGame(twoPlayers), { red: [7, BASE, BASE, BASE], yellow: [36, BASE, BASE, BASE] });
    g = rollDice(g, 3);
    g = applyMove(g, 0);
    expect(g.pawns.yellow![0]).toBe(BASE);
    expect(g.hasCaptured.red).toBe(true);
    expect(g.current).toBe(0);
  });

  it('ne capture pas sur une étoile', () => {
    // Square 8 is a star; yellow step 34 -> square 8.
    let g = withPawns(createGame(twoPlayers), { red: [5, BASE, BASE, BASE], yellow: [34, BASE, BASE, BASE] });
    g = applyMove(rollDice(g, 3), 0);
    expect(g.pawns.yellow![0]).toBe(34);
  });

  it('capture sur une étoile si les cases sûres sont désactivées', () => {
    let g = withPawns(createGame(twoPlayers, { safeSquares: false }), {
      red: [5, BASE, BASE, BASE],
      yellow: [34, BASE, BASE, BASE],
    });
    g = applyMove(rollDice(g, 3), 0);
    expect(g.pawns.yellow![0]).toBe(BASE);
  });

  it("ne capture pas un coéquipier en mode équipes", () => {
    // Yellow step 36 -> square 10.
    let g = withPawns(createGame(fourPlayers, { teams: true }), {
      red: [7, BASE, BASE, BASE],
      yellow: [36, BASE, BASE, BASE],
    });
    g = applyMove(rollDice(g, 3), 0);
    expect(g.pawns.yellow![0]).toBe(36);
  });
});

describe('blocages', () => {
  it('un mur adverse ne peut pas être franchi', () => {
    // Yellow wall on square 10 (steps 36).
    const g = withPawns(createGame(twoPlayers, { blocks: true }), {
      red: [7, BASE, BASE, BASE],
      yellow: [36, 36, BASE, BASE],
    });
    expect(rollDice(g, 5).lastEvent?.type).toBe('noMoves');
    expect(rollDice(g, 2).phase).toBe('move');
  });
});

describe("arrivée", () => {
  it('exige le chiffre exact', () => {
    const g = withPawns(createGame(twoPlayers), { red: [HOME_COLUMN_START + 3, FINISHED, FINISHED, FINISHED] });
    expect(rollDice(g, 3).lastEvent?.type).toBe('noMoves');
    const won = applyMove(rollDice(g, 2), 0);
    expect(won.phase).toBe('over');
    expect(won.winners).toEqual(['red']);
  });

  it('accepte un dépassement si la variante est désactivée', () => {
    const g = withPawns(createGame(twoPlayers, { exactFinish: false }), {
      red: [HOME_COLUMN_START + 3, FINISHED, FINISHED, FINISHED],
    });
    expect(applyMove(rollDice(g, 5), 0).phase).toBe('over');
  });

  it("boucle tant qu'aucune capture n'a été faite", () => {
    const g = withPawns(createGame(twoPlayers, { mustCaptureToEnterHome: true }), { red: [49, BASE, BASE, BASE] });
    const after = applyMove(rollDice(g, 4), 0);
    expect(after.pawns.red![0]).toBe(1);
  });
});

describe('duel', () => {
  it('refuse deux camps côte à côte', () => {
    expect(() =>
      createGame([
        { color: 'red', name: 'A' },
        { color: 'green', name: 'B' },
      ]),
    ).toThrow(/diagonale/);
  });

  it('accepte Vert contre Bleu', () => {
    expect(
      createGame([
        { color: 'green', name: 'A' },
        { color: 'blue', name: 'B' },
      ]).players,
    ).toHaveLength(2);
  });
});

describe('abandon', () => {
  it("en duel, l'adversaire restant gagne", () => {
    const g = forfeit(createGame(twoPlayers), 'red');
    expect(g.phase).toBe('over');
    expect(g.winners).toEqual(['yellow']);
    expect(g.lastEvent).toMatchObject({ type: 'win', reason: 'forfeit' });
  });

  it('à 4, le joueur est retiré et son tour est sauté', () => {
    let g = forfeit(createGame(fourPlayers), 'red');
    expect(g.phase).toBe('roll');
    expect(g.pawns.red).toBeUndefined();
    expect(g.players[g.current].color).toBe('green');
    g = forfeit(g, 'yellow');
    g = rollDice(g, 3); // green: no move
    expect(g.players[g.current].color).toBe('blue');
    g = rollDice(g, 3); // blue: no move, back to green
    expect(g.players[g.current].color).toBe('green');
  });

  it('le dernier joueur restant gagne', () => {
    let g = createGame(fourPlayers);
    g = forfeit(g, 'green');
    g = forfeit(g, 'blue');
    g = forfeit(g, 'red');
    expect(g.winners).toEqual(['yellow']);
  });

  it("en équipes, l'abandon fait perdre toute l'équipe", () => {
    const g = forfeit(createGame(fourPlayers, { teams: true }), 'blue');
    expect(g.phase).toBe('over');
    expect(g.winners).toEqual(['red', 'yellow']);
  });

  it("le coup gagnant reste décrit dans l'événement de victoire", () => {
    const g = withPawns(createGame(twoPlayers), { red: [HOME_COLUMN_START + 3, FINISHED, FINISHED, FINISHED] });
    const won = applyMove(rollDice(g, 2), 0);
    expect(won.lastEvent).toMatchObject({ type: 'win', reason: 'finish', move: { pawn: 0, to: FINISHED } });
  });
});

describe('mode rapide', () => {
  it('limite le nombre de pions', () => {
    expect(createGame(twoPlayers, { pawnsPerPlayer: 2 }).pawns.red).toHaveLength(2);
  });
});

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function simulate(rules: Partial<Rules>, players: typeof fourPlayers, levels: BotLevel[], seed: number) {
  const rng = seeded(seed);
  let g = createGame(players, rules);
  for (let i = 0; i < 20000 && g.phase !== 'over'; i++) {
    if (g.phase === 'roll') g = rollDice(g, rollDie(rng));
    else g = applyMove(g, chooseMove(g, levels[g.current % levels.length], rng));
  }
  return g;
}

describe('parties complètes entre ordinateurs', () => {
  const variants: Partial<Rules>[] = [
    {},
    { exitOn: 'oneOrSix', exactFinish: false },
    { blocks: true },
    { mustCaptureToEnterHome: true },
    { safeSquares: false, bonusOnCapture: false, bonusOnFinish: false },
    { teams: true },
    { teams: true, blocks: true, mustCaptureToEnterHome: true },
    { pawnsPerPlayer: 1 },
  ];

  variants.forEach((rules, i) => {
    it(`se terminent avec ${JSON.stringify(rules)}`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const g = simulate(rules, fourPlayers, ['easy', 'medium', 'hard'], seed * 31 + i);
        expect(g.phase).toBe('over');
      }
    });
  });

  it("l'IA difficile bat l'IA facile la plupart du temps", () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = simulate({}, twoPlayers as typeof fourPlayers, ['hard', 'easy'], seed);
      if (g.winners[0] === 'red') hardWins++;
    }
    expect(hardWins).toBeGreaterThan(36);
  });
});
