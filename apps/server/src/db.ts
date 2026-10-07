import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeProfile, type Profile } from '@ludo/engine';

const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/ludo.db';

if (DATABASE_PATH !== ':memory:') mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const db = new DatabaseSync(DATABASE_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    profile TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_xp ON users (xp DESC);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
`);

export interface User {
  id: number;
  username: string;
  profile: Profile;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  profile: string;
}

function toUser(row: UserRow): User {
  return { id: row.id, username: row.username, profile: normalizeProfile(JSON.parse(row.profile)) };
}

export function createUser(username: string, passwordHash: string, profile: Profile): User {
  const result = db
    .prepare('INSERT INTO users (username, password_hash, profile, xp, wins, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(username, passwordHash, JSON.stringify(profile), profile.xp, profile.stats.wins, Date.now());
  return { id: Number(result.lastInsertRowid), username, profile };
}

export function findUserForLogin(username: string): (User & { passwordHash: string }) | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export function usernameTaken(username: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
}

export function getUser(id: number): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function saveProfile(userId: number, profile: Profile) {
  db.prepare('UPDATE users SET profile = ?, xp = ?, wins = ? WHERE id = ?').run(
    JSON.stringify(profile),
    profile.xp,
    profile.stats.wins,
    userId,
  );
}

/** Reads, transforms and saves a profile in one transaction, so concurrent updates don't overwrite each other. */
export function updateProfile<T>(userId: number, change: (profile: Profile) => { profile: Profile; result: T }): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = getUser(userId);
    if (!user) throw new Error('Utilisateur introuvable');
    const { profile, result } = change(user.profile);
    if (profile !== user.profile) saveProfile(userId, profile);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function createSession(token: string, userId: number) {
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, Date.now());
}

export function sessionUserId(token: string): number | null {
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export interface LeaderboardRow {
  username: string;
  xp: number;
  wins: number;
}

export function leaderboard(limit = 50): LeaderboardRow[] {
  return db.prepare('SELECT username, xp, wins FROM users ORDER BY xp DESC, wins DESC, id ASC LIMIT ?').all(limit) as unknown as LeaderboardRow[];
}

export function rankOf(userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) + 1 AS rank FROM users WHERE xp > (SELECT xp FROM users WHERE id = ?)')
    .get(userId) as { rank: number };
  return row.rank;
}
