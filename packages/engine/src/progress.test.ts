import { describe, expect, it } from 'vitest';
import {
  FINISHED,
  HOME_COLUMN_START,
  applyMove,
  buyItem,
  claimLoginBonus,
  completeTutorial,
  createGame,
  dailyChallenges,
  forfeit,
  gameResult,
  levelInfo,
  newProfile,
  normalizeProfile,
  nextLoginStreak,
  recordGame,
  rollDice,
  setAppearance,
  type GameState,
} from './index';

const duel = [
  { color: 'red' as const, name: 'Rouge' },
  { color: 'yellow' as const, name: 'Jaune' },
];
const hardBot = () => ({ kind: 'bot', level: 'hard' }) as const;
const DAY = '2026-10-07';

function redWins(): GameState {
  const g = createGame(duel);
  const ready: GameState = { ...g, pawns: { ...g.pawns, red: [FINISHED, FINISHED, FINISHED, HOME_COLUMN_START + 3] } };
  return applyMove(rollDice(ready, 2), 3);
}

describe('progression', () => {
  it('niveaux', () => {
    expect(levelInfo(0)).toEqual({ level: 1, current: 0, needed: 100 });
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(299).level).toBe(2);
    expect(levelInfo(300)).toEqual({ level: 3, current: 0, needed: 300 });
  });

  it("une victoire rapporte pièces, XP, badge et n'est comptée qu'une fois", () => {
    const result = gameResult(redWins(), 'red', hardBot, false)!;
    expect(result).toMatchObject({ won: true, pawnsHome: 4, beatHardBot: true, flawless: true });

    const first = recordGame(newProfile(), result, DAY)!;
    expect(first.profile.stats).toMatchObject({ games: 1, wins: 1, hardWins: 1, winStreak: 1, pawnsHome: 4 });
    expect(first.summary.reward!.total).toBe(70);
    expect(first.summary.achievements.map((a) => a.id)).toEqual(
      expect.arrayContaining(['first_win', 'hard_win', 'flawless']),
    );
    expect(first.profile.coins).toBe(first.summary.coins);
    expect(first.summary.xp).toBe(50);
    expect(recordGame(first.profile, result, DAY)).toBeNull();
  });

  it('une victoire en ligne ne compte comme telle que face à un humain', () => {
    expect(gameResult(redWins(), 'red', hardBot, true)!.online).toBe(false);
    expect(gameResult(redWins(), 'red', () => ({ kind: 'human', online: true }), true)!.online).toBe(true);
  });

  it('une défaite compte la partie et casse la série', () => {
    const lost = gameResult(redWins(), 'yellow', hardBot, false)!;
    const p = { ...newProfile(), stats: { ...newProfile().stats, winStreak: 4 } };
    const { profile, summary } = recordGame(p, lost, DAY)!;
    expect(profile.stats.games).toBe(1);
    expect(profile.stats.winStreak).toBe(0);
    expect(summary.reward).toBeNull();
  });

  it('les défis du jour avancent et paient une seule fois', () => {
    const challenges = dailyChallenges(DAY);
    expect(challenges).toHaveLength(3);
    expect(new Set(challenges.map((c) => c.id)).size).toBe(3);
    expect(dailyChallenges(DAY)).toEqual(challenges);

    let profile = newProfile();
    let paid = 0;
    for (let i = 0; i < 5; i++) {
      const g = { ...redWins(), id: `g${i}` };
      const res = recordGame(profile, gameResult(g, 'red', hardBot, true)!, DAY)!;
      profile = res.profile;
      paid += res.summary.challenges.length;
    }
    expect(profile.daily.done.length).toBeGreaterThan(0);
    expect(paid).toBe(profile.daily.done.length);
    const tomorrow = recordGame(profile, gameResult({ ...redWins(), id: 'next' }, 'red', hardBot, true)!, '2026-10-08')!;
    expect(tomorrow.profile.daily.day).toBe('2026-10-08');
  });

  it('bonus de connexion avec série sur 7 jours', () => {
    let p = newProfile();
    const days = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const coins = days.map((d) => {
      const r = claimLoginBonus(p, d);
      p = r.profile;
      return r.coins;
    });
    expect(coins).toEqual([20, 30, 40]);
    expect(() => claimLoginBonus(p, '2026-10-03')).toThrow();
    expect(nextLoginStreak(p, '2026-10-05')).toBe(1);
  });

  it('boutique et apparence', () => {
    const rich = { ...newProfile(), coins: 500 };
    expect(() => buyItem(newProfile(), 'pawn:crown')).toThrow(/manque 400/);
    const bought = buyItem(rich, 'pawn:crown');
    expect(bought.coins).toBe(100);
    expect(buyItem(bought, 'pawn:crown')).toBe(bought);
    expect(setAppearance(bought, { pawn: 'crown' }).appearance.pawn).toBe('crown');
    expect(() => setAppearance(rich, { board: 'neon' })).toThrow();
    expect(() => setAppearance(rich, { board: 'nope' })).toThrow();
  });

  it('tutoriel une seule fois', () => {
    const done = completeTutorial(newProfile())!;
    expect(done.summary.achievements[0]).toEqual({ id: 'tutorial', coins: 50 });
    expect(completeTutorial(done.profile)).toBeNull();
  });

  it('profil corrompu réparé', () => {
    const p = normalizeProfile({ coins: -5, xp: 'x', owned: ['pawn:crown', 'hack'], stats: { wins: 3.7 } });
    expect(p.coins).toBe(0);
    expect(p.xp).toBe(0);
    expect(p.owned).toEqual(['pawn:crown']);
    expect(p.stats.wins).toBe(3);
  });

  it('victoire par abandon sans pions rentrés', () => {
    const r = gameResult(forfeit(createGame(duel), 'yellow'), 'red', () => ({ kind: 'human', online: true }), true)!;
    expect(r).toMatchObject({ won: true, pawnsHome: 0, flawless: false });
  });
});
