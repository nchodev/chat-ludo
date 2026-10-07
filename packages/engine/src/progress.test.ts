import { describe, expect, it } from 'vitest';
import {
  FINISHED,
  GUEST_IMPORT_MAX_LEVEL,
  GUEST_IMPORT_MAX_VALUE,
  HOME_COLUMN_START,
  MIN_ROLLS_FOR_FORFEIT_WIN,
  SHOP_PRICES,
  importGuestProfile,
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
    const played = { ...createGame(duel), rollId: MIN_ROLLS_FOR_FORFEIT_WIN };
    const r = gameResult(forfeit(played, 'yellow'), 'red', () => ({ kind: 'human', online: true }), true)!;
    expect(r).toMatchObject({ won: true, pawnsHome: 0, flawless: false });
  });

  it("un abandon dès le début ne rapporte rien", () => {
    expect(gameResult(forfeit(createGame(duel), 'yellow'), 'red', hardBot, true)).toBeNull();
  });

  it('import invité borné et cohérent', () => {
    const p = importGuestProfile({
      coins: 999999,
      xp: 1e12,
      owned: Object.keys(SHOP_PRICES),
      appearance: { pawn: 'crown', board: 'x'.repeat(500) },
      stats: { games: 1e6, wins: 1e6, captures: 1e6, hardWins: 50 },
      achievements: ['first_win', 'games_100', 'level_10', 'inconnu'],
    });
    const value = p.coins + p.owned.reduce((s, i) => s + SHOP_PRICES[i], 0);
    expect(value).toBeLessThanOrEqual(GUEST_IMPORT_MAX_VALUE);
    expect(levelInfo(p.xp).level).toBe(GUEST_IMPORT_MAX_LEVEL);
    expect(p.stats.games).toBe(p.xp / 20);
    expect(p.stats.wins).toBeLessThanOrEqual(p.stats.games);
    expect(p.achievements).toEqual(expect.arrayContaining(['first_win', 'wins_10', 'wins_50', 'hard_win']));
    expect(p.achievements).not.toContain('games_100');
    const next = recordGame(p, gameResult({ ...redWins(), id: 'after-import' }, 'red', hardBot, false)!, DAY)!;
    expect(next.summary.achievements.map((a) => a.id)).not.toContain('wins_50');
    expect(p.appearance.board).toBe('classic');
    if (!p.owned.includes('pawn:crown')) expect(p.appearance.pawn).toBe('board');
  });
});
