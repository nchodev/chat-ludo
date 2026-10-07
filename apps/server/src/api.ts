import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import {
  COLORS,
  BOT_LEVELS,
  ProgressError,
  buyItem,
  claimLoginBonus,
  completeTutorial,
  gameResult,
  importGuestProfile,
  isColor,
  isShopItem,
  levelInfo,
  newProfile,
  recordGame,
  replayGame,
  sanitizeRules,
  setAppearance,
  utcDay,
  type Color,
  type GameState,
  type OpponentKind,
  type PlayerInfo,
  type Profile,
} from '@ludo/engine';
import * as db from './db';
import { RateLimiter, cleanText, clientIp } from './security';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const MAX_BODY_BYTES = 256 * 1024;
const USERNAME_RE = /^[\p{L}\p{N}_-]{3,16}$/u;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
/** Games end at least this far apart for one player; quicker results are not counted. */
const MIN_GAME_INTERVAL_MS = 30_000;
/** Local games can't be fully verified (the device rolls the dice), so their rewards are capped. */
const MAX_LOCAL_GAMES_PER_DAY = 30;
const MAX_HISTORY = 5000;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Checked against when the username doesn't exist, so response time doesn't reveal which accounts exist. */
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

const loginLimiter = new RateLimiter(10, 5 * 60_000);
const registerLimiter = new RateLimiter(10, 60 * 60_000);

function limit(limiter: RateLimiter, key: string) {
  if (!limiter.hit(key)) throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
}

const lastRewardedGame = new Map<number, number>();
const localGamesToday = new Map<string, number>();

/**
 * Whether a finished game may be credited to this player now: games can't end closer
 * than MIN_GAME_INTERVAL_MS apart, and local games are capped per day.
 */
function claimRewardSlot(userId: number, local: boolean): string | null {
  const now = Date.now();
  if (now - (lastRewardedGame.get(userId) ?? 0) < MIN_GAME_INTERVAL_MS) return 'Partie trop courte pour être comptée.';
  const key = `${userId}:${utcDay()}`;
  if (local && (localGamesToday.get(key) ?? 0) >= MAX_LOCAL_GAMES_PER_DAY) {
    return 'Limite de parties récompensées atteinte pour aujourd’hui.';
  }
  lastRewardedGame.set(userId, now);
  if (local) {
    if (localGamesToday.size > 10_000) localGamesToday.clear();
    localGamesToday.set(key, (localGamesToday.get(key) ?? 0) + 1);
  }
  return null;
}

export interface PublicProfile {
  username: string;
  profile: Profile;
  rank: number;
}

function publicProfile(user: db.User): PublicProfile {
  return { username: user.username, profile: user.profile, rank: db.rankOf(user.id) };
}

function newSession(userId: number): string {
  const token = randomBytes(32).toString('base64url');
  db.createSession(token, userId);
  return token;
}

/** Resolves a session token to a user id, or null. */
export function userIdForToken(token: unknown): number | null {
  return typeof token === 'string' && token.length > 0 ? db.sessionUserId(token) : null;
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireUser(req: IncomingMessage): db.User {
  const id = userIdForToken(bearer(req));
  const user = id ? db.getUser(id) : null;
  if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
  return user;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

function credentials(body: Record<string, unknown>) {
  const username = typeof body.username === 'string' ? body.username.normalize('NFKC').trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > MAX_PASSWORD) throw new HttpError(400, `Mot de passe : au plus ${MAX_PASSWORD} caractères.`);
  return { username, password };
}

function parsePlayers(raw: unknown): PlayerInfo[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) throw new HttpError(400, 'Résultat de partie invalide.');
  return raw.map((p) => {
    if (!p || !isColor(p.color)) throw new HttpError(400, 'Résultat de partie invalide.');
    return { color: p.color, name: cleanText(p.name, 20) || 'Joueur' };
  });
}

function parseOpponents(raw: unknown): Partial<Record<Color, OpponentKind>> {
  const result: Partial<Record<Color, OpponentKind>> = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const color of COLORS) {
    const o = (raw as Record<string, any>)[color];
    if (o?.kind === 'bot' && BOT_LEVELS.includes(o.level)) result[color] = { kind: 'bot', level: o.level };
    else if (o?.kind === 'human') result[color] = { kind: 'human', online: false };
  }
  return result;
}

/** Applies a profile change for the signed-in user and returns the updated public profile. */
function mutate<T extends object>(user: db.User, change: (p: Profile) => { profile: Profile; result: T }) {
  try {
    const result = db.updateProfile(user.id, change);
    const updated = db.getUser(user.id)!;
    return { ...result, ...publicProfile(updated) };
  } catch (err) {
    if (err instanceof ProgressError) throw new HttpError(400, err.message);
    throw err;
  }
}

type Handler = (req: IncomingMessage, body: Record<string, unknown>) => Promise<unknown> | unknown;

const ip = (req: IncomingMessage) => clientIp(req.headers, req.socket.remoteAddress);

const routes: Record<string, Handler> = {
  'POST /api/register': async (req, body) => {
    const { username, password } = credentials(body);
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'Pseudo : 3 à 16 caractères (lettres, chiffres, - ou _).');
    }
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Mot de passe : au moins ${MIN_PASSWORD} caractères.`);
    limit(registerLimiter, ip(req));
    if (db.usernameTaken(username)) throw new HttpError(409, 'Ce pseudo est déjà pris.');

    const profile = body.guestProfile ? importGuestProfile(body.guestProfile) : newProfile();
    const user = db.createUser(username, await hashPassword(password), profile);
    return { token: newSession(user.id), ...publicProfile(user) };
  },

  'POST /api/login': async (req, body) => {
    limit(loginLimiter, ip(req));
    const { username, password } = credentials(body);
    const user = db.findUserForLogin(username);
    const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !valid) throw new HttpError(401, 'Pseudo ou mot de passe incorrect.');
    return { token: newSession(user.id), ...publicProfile(user) };
  },

  'POST /api/logout': (req) => {
    const token = bearer(req);
    if (token) db.deleteSession(token);
    return { ok: true };
  },

  'GET /api/me': (req) => publicProfile(requireUser(req)),

  'POST /api/shop/buy': (req, body) => {
    const item = body.item;
    if (!isShopItem(item)) throw new HttpError(400, 'Article inconnu.');
    return mutate(requireUser(req), (p) => ({ profile: buyItem(p, item), result: {} }));
  },

  'POST /api/appearance': (req, body) => {
    const patch: Record<string, string> = {};
    for (const key of ['board', 'dice', 'pawn']) if (typeof body[key] === 'string') patch[key] = body[key] as string;
    return mutate(requireUser(req), (p) => ({ profile: setAppearance(p, patch), result: {} }));
  },

  'POST /api/daily/login': (req) =>
    mutate(requireUser(req), (p) => {
      const { profile, coins, streak } = claimLoginBonus(p, utcDay());
      return { profile, result: { coins, streak } };
    }),

  'POST /api/tutorial/complete': (req) =>
    mutate(requireUser(req), (p) => {
      const done = completeTutorial(p);
      return { profile: done?.profile ?? p, result: { summary: done?.summary ?? null } };
    }),

  /**
   * Result of a game played on the device (against the computer or friends on the same screen).
   * The game is replayed from its actions, so its outcome and statistics follow the rules.
   */
  'POST /api/games/local': (req, body) => {
    const user = requireUser(req);
    const color = body.color;
    const history = body.history;
    if (!isColor(color) || !Array.isArray(history) || history.length > MAX_HISTORY) {
      throw new HttpError(400, 'Résultat de partie invalide.');
    }
    const players = parsePlayers(body.players);
    const rules = sanitizeRules(body.rules);
    let state: GameState;
    try {
      state = replayGame(players, rules, history);
    } catch {
      throw new HttpError(400, 'Résultat de partie invalide.');
    }
    if (state.phase !== 'over') throw new HttpError(400, "La partie n'est pas terminée.");
    state.id = `local-${createHash('sha256').update(JSON.stringify([players, rules, history])).digest('base64url')}`;

    const opponents = parseOpponents(body.opponents);
    const result = gameResult(state, color, (c) => opponents[c] ?? { kind: 'human', online: false }, false);
    if (!result) return { ...publicProfile(user), summary: null };
    if (user.profile.rewarded.includes(result.gameId)) throw new HttpError(409, 'Partie déjà comptée.');
    const refused = claimRewardSlot(user.id, true);
    if (refused) throw new HttpError(429, refused);
    return mutate(user, (p) => {
      const recorded = recordGame(p, result, utcDay());
      return { profile: recorded?.profile ?? p, result: { summary: recorded?.summary ?? null } };
    });
  },

  'GET /api/leaderboard': (req) => {
    const id = userIdForToken(bearer(req));
    const user = id ? db.getUser(id) : null;
    return {
      players: db.leaderboard().map((row, i) => ({ rank: i + 1, ...row, level: levelInfo(row.xp).level })),
      you: user ? { username: user.username, rank: db.rankOf(user.id), xp: user.profile.xp, level: levelInfo(user.profile.xp).level } : null,
    };
  },
};

/** Records a finished online game for a signed-in player; null if already counted. */
export function recordOnlineGame(userId: number, state: GameState, color: Color, opponentKind: (c: Color) => OpponentKind) {
  const result = gameResult(state, color, opponentKind, true);
  if (!result || claimRewardSlot(userId, false)) return null;
  return db.updateProfile(userId, (p) => {
    const recorded = recordGame(p, result, utcDay());
    return { profile: recorded?.profile ?? p, result: recorded?.summary ?? null };
  });
}

export function usernameOf(userId: number): string | null {
  return db.getUser(userId)?.username ?? null;
}

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());

function setCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  const allowed = !ALLOWED_ORIGINS || (origin && ALLOWED_ORIGINS.includes(origin));
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

/** Handles /api/* requests; returns false for other paths. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith('/api/')) return false;
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  const handler = routes[`${req.method} ${path}`];
  if (!handler) {
    send(res, 404, { error: 'Introuvable.' });
    return true;
  }
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    send(res, 200, await handler(req, body));
  } catch (err) {
    if (err instanceof HttpError) send(res, err.status, { error: err.message });
    else {
      console.error(err);
      send(res, 500, { error: 'Erreur du serveur.' });
    }
  }
  return true;
}
