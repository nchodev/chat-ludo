import type { DuelGame } from './duel';
import type { GameId } from './games';
import { FINISHED, type Color } from './constants';
import { areAllies, type GameState } from './game';
import { computeReward, type OpponentKind, type Reward } from './rewards';

/* ------------------------------------------------------------------ */
/* Shop                                                                */
/* ------------------------------------------------------------------ */

/** Price in coins of every shop item; 0 means free for everyone. */
export const SHOP_PRICES = {
  'board:classic': 0,
  'board:pastel': 100,
  'board:wood': 150,
  'board:wax': 250,
  'board:neon': 300,
  'dice:classic': 0,
  'dice:player': 0,
  'dice:numbers': 50,
  'dice:wood': 100,
  'dice:neon': 200,
  'dice:gold': 400,
  'pawn:board': 0,
  'pawn:cone': 100,
  'pawn:star': 150,
  'pawn:gem': 200,
  'pawn:animal': 250,
  'pawn:crown': 400,
} as const;

export type ShopItem = keyof typeof SHOP_PRICES;
export type ShopCategory = 'board' | 'dice' | 'pawn';

export function isShopItem(value: unknown): value is ShopItem {
  return typeof value === 'string' && Object.hasOwn(SHOP_PRICES, value);
}

export function itemPrice(item: ShopItem): number {
  return SHOP_PRICES[item];
}

export function ownsItem(profile: Pick<Profile, 'owned'>, item: ShopItem): boolean {
  return itemPrice(item) === 0 || profile.owned.includes(item);
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export interface AppearanceChoice {
  board: string;
  dice: string;
  pawn: string;
}

export interface LifetimeStats {
  games: number;
  wins: number;
  captures: number;
  pawnsHome: number;
  winStreak: number;
  bestWinStreak: number;
  hardWins: number;
  onlineWins: number;
  flawlessWins: number;
}

export interface Profile {
  coins: number;
  xp: number;
  owned: ShopItem[];
  appearance: AppearanceChoice;
  stats: LifetimeStats;
  achievements: string[];
  daily: { day: string; progress: Record<string, number>; done: string[] };
  /** Weekly quests, keyed by the Monday (UTC) of the week. */
  weekly: { week: string; progress: Record<string, number>; done: string[] };
  login: { lastDay: string | null; streak: number };
  /** Most recent game ids already counted, so a game is never rewarded twice. */
  rewarded: string[];
  tutorialDone: boolean;
}

const MAX_REWARDED = 100;
export const DEFAULT_APPEARANCE: AppearanceChoice = { board: 'classic', dice: 'classic', pawn: 'board' };

export function newProfile(): Profile {
  return {
    coins: 0,
    xp: 0,
    owned: [],
    appearance: { ...DEFAULT_APPEARANCE },
    stats: {
      games: 0,
      wins: 0,
      captures: 0,
      pawnsHome: 0,
      winStreak: 0,
      bestWinStreak: 0,
      hardWins: 0,
      onlineWins: 0,
      flawlessWins: 0,
    },
    achievements: [],
    daily: { day: '', progress: {}, done: [] },
    weekly: { week: '', progress: {}, done: [] },
    login: { lastDay: null, streak: 0 },
    rewarded: [],
    tutorialDone: false,
  };
}

const nonNegative = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(v))) : fallback;
const strings = (v: unknown, maxLength = 64): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= maxLength))] : [];
const shortString = (v: unknown, maxLength = 10): string | null => (typeof v === 'string' && v.length <= maxLength ? v : null);

/** Builds a valid profile from stored data, tolerating missing or corrupted fields. */
export function normalizeProfile(raw: unknown): Profile {
  const base = newProfile();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const stats = { ...base.stats };
  for (const key of Object.keys(stats) as (keyof LifetimeStats)[]) stats[key] = nonNegative(r.stats?.[key]);
  const appearance = { ...base.appearance };
  for (const key of Object.keys(appearance) as (keyof AppearanceChoice)[]) {
    const id = r.appearance?.[key];
    if (typeof id === 'string' && isShopItem(`${key}:${id}`)) appearance[key] = id;
  }
  const isChallenge = (id: string) => DAILY_CHALLENGES.some((c) => c.id === id);
  const progress: Record<string, number> = {};
  if (r.daily?.progress && typeof r.daily.progress === 'object') {
    for (const [k, v] of Object.entries(r.daily.progress)) if (isChallenge(k)) progress[k] = nonNegative(v);
  }
  const isQuest = (id: string) => WEEKLY_QUESTS.some((q) => q.id === id);
  const weeklyProgress: Record<string, number> = {};
  if (r.weekly?.progress && typeof r.weekly.progress === 'object') {
    for (const [k, v] of Object.entries(r.weekly.progress)) if (isQuest(k)) weeklyProgress[k] = nonNegative(v);
  }
  return {
    coins: nonNegative(r.coins),
    xp: nonNegative(r.xp),
    owned: strings(r.owned).filter(isShopItem),
    appearance,
    stats,
    achievements: strings(r.achievements).filter((id) => ACHIEVEMENTS.some((a) => a.id === id)),
    daily: { day: shortString(r.daily?.day) ?? '', progress, done: strings(r.daily?.done).filter(isChallenge) },
    weekly: { week: shortString(r.weekly?.week) ?? '', progress: weeklyProgress, done: strings(r.weekly?.done).filter(isQuest) },
    login: {
      lastDay: shortString(r.login?.lastDay),
      streak: nonNegative(r.login?.streak),
    },
    rewarded: strings(r.rewarded).slice(-MAX_REWARDED),
    tutorialDone: r.tutorialDone === true,
  };
}

/** Most a guest can bring into a new account, in coins plus the price of owned styles. */
export const GUEST_IMPORT_MAX_VALUE = 2000;
/** Level 5: what a guest can reasonably reach before creating an account. */
export const GUEST_IMPORT_MAX_LEVEL = 5;

/**
 * A guest profile lives on the device and can be edited at will, so only a bounded,
 * self-consistent part of it is carried into a new account.
 */
export function importGuestProfile(raw: unknown): Profile {
  const guest = normalizeProfile(raw);
  let budget = GUEST_IMPORT_MAX_VALUE;
  const owned: ShopItem[] = [];
  for (const item of [...guest.owned].sort((a, b) => itemPrice(a) - itemPrice(b))) {
    if (itemPrice(item) > budget) break;
    owned.push(item);
    budget -= itemPrice(item);
  }

  const xp = Math.min(guest.xp, xpForLevel(GUEST_IMPORT_MAX_LEVEL));
  const s = guest.stats;
  const games = Math.min(s.games, Math.floor(xp / XP.perGame));
  const wins = Math.min(s.wins, games);
  const stats: LifetimeStats = {
    games,
    wins,
    captures: Math.min(s.captures, games * 10),
    pawnsHome: Math.min(s.pawnsHome, games * 4),
    winStreak: Math.min(s.winStreak, wins),
    bestWinStreak: Math.min(Math.max(s.bestWinStreak, s.winStreak), wins),
    hardWins: Math.min(s.hardWins, wins),
    onlineWins: Math.min(s.onlineWins, wins),
    flawlessWins: Math.min(s.flawlessWins, wins),
  };

  const profile: Profile = {
    ...guest,
    coins: Math.min(guest.coins, budget),
    xp,
    owned,
    stats,
    login: { lastDay: guest.login.lastDay, streak: 0 },
  };
  for (const key of Object.keys(profile.appearance) as ShopCategory[]) {
    const item = `${key}:${profile.appearance[key]}` as ShopItem;
    if (!ownsItem(profile, item)) profile.appearance = { ...profile.appearance, [key]: DEFAULT_APPEARANCE[key] };
  }
  // Badges earned by the imported stats are granted without their coins, so importing never pays out later.
  profile.achievements = ACHIEVEMENTS.filter((a) => a.unlocked(profile)).map((a) => a.id);
  return profile;
}

export class ProgressError extends Error {}

export function buyItem(profile: Profile, item: ShopItem): Profile {
  if (ownsItem(profile, item)) return profile;
  const price = itemPrice(item);
  if (profile.coins < price) throw new ProgressError(`Il te manque ${price - profile.coins} pièces.`);
  return { ...profile, coins: profile.coins - price, owned: [...profile.owned, item] };
}

export function setAppearance(profile: Profile, patch: Partial<AppearanceChoice>): Profile {
  const appearance = { ...profile.appearance };
  for (const [category, id] of Object.entries(patch) as [ShopCategory, string][]) {
    const item = `${category}:${id}`;
    if (!isShopItem(item)) throw new ProgressError('Style inconnu.');
    if (!ownsItem(profile, item)) throw new ProgressError("Achète d'abord ce style dans la boutique.");
    appearance[category] = id;
  }
  return { ...profile, appearance };
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

/** Calendar day in UTC, e.g. "2026-10-07"; daily challenges and bonuses reset at midnight UTC. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDay(d);
}

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

/** Total XP needed to reach `level` (level 1 starts at 0, level 2 at 100, level 3 at 300…). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelInfo(xp: number): { level: number; current: number; needed: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return { level, current: xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) };
}

export const LEVEL_UP_COINS_PER_LEVEL = 25;

/* ------------------------------------------------------------------ */
/* Daily login bonus                                                   */
/* ------------------------------------------------------------------ */

/** Coins for the 1st to 7th consecutive day; the cycle then starts again. */
export const LOGIN_REWARDS = [20, 30, 40, 50, 60, 80, 150];

export function loginBonusAvailable(profile: Profile, day: string): boolean {
  return profile.login.lastDay !== day;
}

/** Day of the 7-day cycle (1–7) the next claim would be. */
export function nextLoginStreak(profile: Profile, day: string): number {
  return profile.login.lastDay === previousDay(day) ? profile.login.streak + 1 : 1;
}

export function claimLoginBonus(profile: Profile, day: string): { profile: Profile; coins: number; streak: number } {
  if (!loginBonusAvailable(profile, day)) throw new ProgressError('Bonus du jour déjà récupéré.');
  const streak = nextLoginStreak(profile, day);
  const coins = LOGIN_REWARDS[(streak - 1) % LOGIN_REWARDS.length];
  return { profile: { ...profile, coins: profile.coins + coins, login: { lastDay: day, streak } }, coins, streak };
}

/* ------------------------------------------------------------------ */
/* Game results                                                        */
/* ------------------------------------------------------------------ */

export interface GameResult {
  gameId: string;
  won: boolean;
  reward: Reward | null;
  captures: number;
  pawnsHome: number;
  online: boolean;
  beatHardBot: boolean;
  flawless: boolean;
}

/** A game abandoned before this many dice rolls is not counted, so friends can't trade quick forfeits. */
export const MIN_ROLLS_FOR_FORFEIT_WIN = 20;

/** What a finished game means for the player of `color`. */
export function gameResult(
  state: GameState,
  color: Color,
  opponentKind: (color: Color) => OpponentKind,
  online: boolean,
): GameResult | null {
  if (state.phase !== 'over' || !state.players.some((p) => p.color === color)) return null;
  if (state.lastEvent?.type === 'win' && state.lastEvent.reason === 'forfeit' && state.rollId < MIN_ROLLS_FOR_FORFEIT_WIN) {
    return null;
  }
  const won = state.winners.includes(color);
  const reward = won ? computeReward(state, color, opponentKind) : null;
  const losers = state.players.filter((p) => !state.winners.includes(p.color));
  const opponents = state.players.filter((p) => p.color !== color && !areAllies(state.rules, p.color, color));
  return {
    gameId: state.id,
    won,
    reward,
    captures: state.stats[color].captures,
    pawnsHome: (state.pawns[color] ?? []).filter((p) => p === FINISHED).length,
    online: online && opponents.some((p) => opponentKind(p.color).kind === 'human'),
    beatHardBot: won && losers.some((p) => {
      const kind = opponentKind(p.color);
      return kind.kind === 'bot' && kind.level === 'hard';
    }),
    flawless: !!reward?.lines.some((l) => l.type === 'flawless'),
  };
}

export const XP = { perGame: 20, perWin: 30, perCapture: 5, maxCaptureXp: 50 } as const;

export interface DailyChallenge {
  id: string;
  label: string;
  icon: string;
  goal: number;
  coins: number;
  progress: (r: GameResult) => number;
}

export const DAILY_CHALLENGES: DailyChallenge[] = [
  { id: 'play3', label: 'Joue 3 parties', icon: '🎲', goal: 3, coins: 30, progress: () => 1 },
  { id: 'win2', label: 'Gagne 2 parties', icon: '🏆', goal: 2, coins: 50, progress: (r) => (r.won ? 1 : 0) },
  { id: 'capture5', label: 'Capture 5 pions', icon: '⚔️', goal: 5, coins: 40, progress: (r) => r.captures },
  { id: 'home8', label: 'Rentre 8 pions à la maison', icon: '🏠', goal: 8, coins: 40, progress: (r) => r.pawnsHome },
  { id: 'hard1', label: 'Bats un ordi difficile', icon: '🤖', goal: 1, coins: 80, progress: (r) => (r.beatHardBot ? 1 : 0) },
  { id: 'online1', label: 'Gagne une partie en ligne', icon: '🌍', goal: 1, coins: 60, progress: (r) => (r.won && r.online ? 1 : 0) },
  { id: 'flawless1', label: 'Gagne sans perdre de pion', icon: '🛡️', goal: 1, coins: 60, progress: (r) => (r.flawless ? 1 : 0) },
];

const DAILY_COUNT = 3;

/** The day's challenges: the same for every player, changing each day. */
export function dailyChallenges(day: string): DailyChallenge[] {
  let seed = [...day].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const pool = [...DAILY_CHALLENGES];
  const picked: DailyChallenge[] = [];
  while (picked.length < DAILY_COUNT) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
}

/** Today's progress, starting fresh when the day changed. */
export function dailyState(profile: Profile, day: string): Profile['daily'] {
  return profile.daily.day === day ? profile.daily : { day, progress: {}, done: [] };
}

/* ------------------------------------------------------------------ */
/* Weekly quests                                                       */
/* ------------------------------------------------------------------ */

/** A finished game of any of the app's games, as weekly quests see it. */
export interface Activity {
  game: GameId;
  won: boolean;
  /** Pawns (Ludo) or pieces (draughts) taken from opponents. */
  captures: number;
  /** Ludo pawns brought home. */
  pawnsHome: number;
  /** Played against at least one other person online. */
  online: boolean;
}

export interface WeeklyQuest {
  id: string;
  label: string;
  goal: number;
  coins: number;
  progress: (a: Activity) => number;
}

export const WEEKLY_QUESTS: WeeklyQuest[] = [
  { id: 'w_play15', label: 'Joue 15 parties', goal: 15, coins: 150, progress: () => 1 },
  { id: 'w_win7', label: 'Gagne 7 parties', goal: 7, coins: 200, progress: (a) => (a.won ? 1 : 0) },
  { id: 'w_online3', label: 'Gagne 3 parties en ligne', goal: 3, coins: 200, progress: (a) => (a.won && a.online ? 1 : 0) },
  { id: 'w_dames5', label: 'Joue 5 parties de dames', goal: 5, coins: 150, progress: (a) => (a.game === 'dames' ? 1 : 0) },
  { id: 'w_dameswin2', label: 'Gagne 2 parties de dames', goal: 2, coins: 180, progress: (a) => (a.game === 'dames' && a.won ? 1 : 0) },
  { id: 'w_ludo10', label: 'Joue 10 parties de Ludo', goal: 10, coins: 150, progress: (a) => (a.game === 'ludo' ? 1 : 0) },
  { id: 'w_capture30', label: 'Capture 30 pions ou pièces', goal: 30, coins: 180, progress: (a) => a.captures },
  { id: 'w_home20', label: 'Rentre 20 pions à la maison', goal: 20, coins: 150, progress: (a) => a.pawnsHome },
];

const WEEKLY_COUNT = 3;

/** Monday (UTC) of the week containing `day`, e.g. "2026-10-05"; quests reset every Monday. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return utcDay(d);
}

/** The week's quests: the same for every player, changing each Monday. */
export function weeklyQuests(week: string): WeeklyQuest[] {
  let seed = [...week].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 11);
  const pool = [...WEEKLY_QUESTS];
  const picked: WeeklyQuest[] = [];
  while (picked.length < WEEKLY_COUNT) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
}

/** This week's progress, starting fresh when the week changed. */
export function weeklyState(profile: Profile, week: string): Profile['weekly'] {
  return profile.weekly.week === week ? profile.weekly : { week, progress: {}, done: [] };
}

/** Counts a finished game towards the week's quests; returns the new state and the quests just completed. */
function advanceWeekly(profile: Profile, activity: Activity, day: string) {
  const week = weekOf(day);
  const state = weeklyState(profile, week);
  const progress = { ...state.progress };
  const done = [...state.done];
  const quests: { id: string; coins: number }[] = [];
  for (const q of weeklyQuests(week)) {
    if (done.includes(q.id)) continue;
    progress[q.id] = Math.min(q.goal, (progress[q.id] ?? 0) + q.progress(activity));
    if (progress[q.id] >= q.goal) {
      done.push(q.id);
      quests.push({ id: q.id, coins: q.coins });
    }
  }
  return { weekly: { week, progress, done }, quests, coins: quests.reduce((s, q) => s + q.coins, 0) };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  coins: number;
  unlocked: (p: Profile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'tutorial', name: 'Diplômé', description: 'Termine le tutoriel', icon: '🎓', coins: 50, unlocked: (p) => p.tutorialDone },
  { id: 'first_win', name: 'Première victoire', description: 'Gagne ta première partie', icon: '🏆', coins: 50, unlocked: (p) => p.stats.wins >= 1 },
  { id: 'wins_10', name: 'Habitué du podium', description: 'Gagne 10 parties', icon: '🥈', coins: 100, unlocked: (p) => p.stats.wins >= 10 },
  { id: 'wins_50', name: 'Légende du Ludo', description: 'Gagne 50 parties', icon: '🥇', coins: 300, unlocked: (p) => p.stats.wins >= 50 },
  { id: 'captures_50', name: 'Chasseur', description: 'Capture 50 pions', icon: '⚔️', coins: 100, unlocked: (p) => p.stats.captures >= 50 },
  { id: 'captures_200', name: 'Terreur du plateau', description: 'Capture 200 pions', icon: '🗡️', coins: 300, unlocked: (p) => p.stats.captures >= 200 },
  { id: 'hard_win', name: 'Plus fort que la machine', description: 'Bats un ordi difficile', icon: '🤖', coins: 100, unlocked: (p) => p.stats.hardWins >= 1 },
  { id: 'online_win', name: 'Champion en ligne', description: 'Gagne une partie en ligne', icon: '🌍', coins: 100, unlocked: (p) => p.stats.onlineWins >= 1 },
  { id: 'flawless', name: 'Intouchable', description: 'Gagne sans perdre un seul pion', icon: '🛡️', coins: 100, unlocked: (p) => p.stats.flawlessWins >= 1 },
  { id: 'streak_3', name: 'En feu', description: 'Gagne 3 parties d’affilée', icon: '🔥', coins: 100, unlocked: (p) => p.stats.bestWinStreak >= 3 },
  { id: 'games_100', name: 'Accro', description: 'Joue 100 parties', icon: '🎲', coins: 200, unlocked: (p) => p.stats.games >= 100 },
  { id: 'level_10', name: 'Vétéran', description: 'Atteins le niveau 10', icon: '⭐', coins: 200, unlocked: (p) => levelInfo(p.xp).level >= 10 },
];

export interface ProgressSummary {
  /** All coins earned, bonuses included. */
  coins: number;
  xp: number;
  reward: Reward | null;
  levelBefore: number;
  levelAfter: number;
  levelUpCoins: number;
  achievements: { id: string; coins: number }[];
  challenges: { id: string; coins: number }[];
  /** Weekly quests completed by this game. */
  quests: { id: string; coins: number }[];
}

/** Grants level-up coins and any newly unlocked achievements. */
function settle(before: Profile, after: Profile, base: Omit<ProgressSummary, 'levelBefore' | 'levelAfter' | 'levelUpCoins' | 'achievements'>) {
  let profile = after;
  const levelBefore = levelInfo(before.xp).level;
  const levelAfter = levelInfo(profile.xp).level;
  let levelUpCoins = 0;
  for (let l = levelBefore + 1; l <= levelAfter; l++) levelUpCoins += l * LEVEL_UP_COINS_PER_LEVEL;
  profile = { ...profile, coins: profile.coins + levelUpCoins };

  const achievements: ProgressSummary['achievements'] = [];
  for (const a of ACHIEVEMENTS) {
    if (!profile.achievements.includes(a.id) && a.unlocked(profile)) achievements.push({ id: a.id, coins: a.coins });
  }
  const achievementCoins = achievements.reduce((s, a) => s + a.coins, 0);
  profile = {
    ...profile,
    coins: profile.coins + achievementCoins,
    achievements: [...profile.achievements, ...achievements.map((a) => a.id)],
  };
  const summary: ProgressSummary = {
    ...base,
    coins: base.coins + levelUpCoins + achievementCoins,
    levelBefore,
    levelAfter,
    levelUpCoins,
    achievements,
  };
  return { profile, summary };
}

/** Applies a finished game to the profile; returns null if this game was already counted. */
export function recordGame(profile: Profile, result: GameResult, day: string): { profile: Profile; summary: ProgressSummary } | null {
  if (profile.rewarded.includes(result.gameId)) return null;

  const s = { ...profile.stats };
  s.games++;
  s.captures += result.captures;
  s.pawnsHome += result.pawnsHome;
  if (result.won) {
    s.wins++;
    s.winStreak++;
    s.bestWinStreak = Math.max(s.bestWinStreak, s.winStreak);
    if (result.beatHardBot) s.hardWins++;
    if (result.online) s.onlineWins++;
    if (result.flawless) s.flawlessWins++;
  } else {
    s.winStreak = 0;
  }

  const xp = XP.perGame + (result.won ? XP.perWin : 0) + Math.min(XP.maxCaptureXp, result.captures * XP.perCapture);
  const rewardCoins = result.reward?.total ?? 0;

  const daily = dailyState(profile, day);
  const progress = { ...daily.progress };
  const done = [...daily.done];
  const challenges: ProgressSummary['challenges'] = [];
  for (const c of dailyChallenges(day)) {
    if (done.includes(c.id)) continue;
    progress[c.id] = Math.min(c.goal, (progress[c.id] ?? 0) + c.progress(result));
    if (progress[c.id] >= c.goal) {
      done.push(c.id);
      challenges.push({ id: c.id, coins: c.coins });
    }
  }
  const challengeCoins = challenges.reduce((sum, c) => sum + c.coins, 0);
  const weekly = advanceWeekly(
    profile,
    { game: 'ludo', won: result.won, captures: result.captures, pawnsHome: result.pawnsHome, online: result.online },
    day,
  );

  const after: Profile = {
    ...profile,
    stats: s,
    xp: profile.xp + xp,
    coins: profile.coins + rewardCoins + challengeCoins + weekly.coins,
    daily: { day, progress, done },
    weekly: weekly.weekly,
    rewarded: [...profile.rewarded, result.gameId].slice(-MAX_REWARDED),
  };
  return settle(profile, after, {
    coins: rewardCoins + challengeCoins + weekly.coins,
    xp,
    reward: result.reward,
    challenges,
    quests: weekly.quests,
  });
}

/** XP for a game of draughts or awalé; they have no coin reward of their own, only weekly quests. */
export const DRAUGHTS_XP = { perGame: 20, perWin: 30 } as const;

/** Applies a finished game of draughts (or awalé) to the profile; returns null if this game was already counted. */
export function recordDraughtsGame(
  profile: Profile,
  game: { gameId: string; won: boolean; captures: number; online: boolean; kind?: DuelGame },
  day: string,
): { profile: Profile; summary: ProgressSummary } | null {
  if (profile.rewarded.includes(game.gameId)) return null;
  const xp = DRAUGHTS_XP.perGame + (game.won ? DRAUGHTS_XP.perWin : 0);
  const weekly = advanceWeekly(profile, { game: game.kind ?? 'dames', won: game.won, captures: game.captures, pawnsHome: 0, online: game.online }, day);
  const after: Profile = {
    ...profile,
    xp: profile.xp + xp,
    coins: profile.coins + weekly.coins,
    weekly: weekly.weekly,
    rewarded: [...profile.rewarded, game.gameId].slice(-MAX_REWARDED),
  };
  return settle(profile, after, { coins: weekly.coins, xp, reward: null, challenges: [], quests: weekly.quests });
}

export const TUTORIAL_XP = 50;

export function completeTutorial(profile: Profile): { profile: Profile; summary: ProgressSummary } | null {
  if (profile.tutorialDone) return null;
  const after = { ...profile, tutorialDone: true, xp: profile.xp + TUTORIAL_XP };
  return settle(profile, after, { coins: 0, xp: TUTORIAL_XP, reward: null, challenges: [], quests: [] });
}
