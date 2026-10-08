import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeProfile, type Profile } from '@ludo/engine';

const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/ludo.db';

if (DATABASE_PATH !== ':memory:') mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const db = new DatabaseSync(DATABASE_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;
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
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
  CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    CHECK (requester_id <> addressee_id),
    UNIQUE (requester_id, addressee_id)
  );
  CREATE INDEX IF NOT EXISTS friend_requests_addressee ON friend_requests (addressee_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS friendships (
    user_a INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_b INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    CHECK (user_a < user_b),
    PRIMARY KEY (user_a, user_b)
  );
  CREATE INDEX IF NOT EXISTS friendships_user_b ON friendships (user_b);
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages (
    MIN(sender_id, recipient_id),
    MAX(sender_id, recipient_id),
    id DESC
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

export function findUserByUsername(username: string): User | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  return row ? toUser(row) : null;
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

const SESSION_TTL_MS = 60 * 24 * 60 * 60_000;

/** Only a hash of each session token is stored, so a leaked database doesn't hand out live sessions. */
const tokenHash = (token: string) => createHash('sha256').update(token).digest('base64url');

export function createSession(token: string, userId: number) {
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, Date.now());
}

export function sessionUserId(token: string): number | null {
  const row = db
    .prepare('SELECT user_id FROM sessions WHERE token = ? AND created_at > ?')
    .get(tokenHash(token), Date.now() - SESSION_TTL_MS) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

export function deleteExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE created_at <= ?').run(Date.now() - SESSION_TTL_MS);
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token));
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

/* ------------------------------------------------------------------ */
/* Social graph and private messages                                   */
/* ------------------------------------------------------------------ */

export interface FriendContact {
  username: string;
  xp: number;
  wins: number;
  since: number;
}

export interface FriendRequest {
  username: string;
  createdAt: number;
}

export interface StoredMessage {
  id: number;
  senderId: number;
  recipientId: number;
  sender: string;
  recipient: string;
  body: string;
  createdAt: number;
}

interface FriendRow {
  username: string;
  xp: number;
  wins: number;
  since: number;
}

interface RequestRow {
  username: string;
  created_at: number;
}

interface MessageRow {
  id: number;
  sender_id: number;
  recipient_id: number;
  sender: string;
  recipient: string;
  body: string;
  created_at: number;
}

function friendshipPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function areFriends(userId: number, otherId: number): boolean {
  const [userA, userB] = friendshipPair(userId, otherId);
  return !!db.prepare('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?').get(userA, userB);
}

export function listFriends(userId: number): FriendContact[] {
  return db
    .prepare(
      `SELECT u.username, u.xp, u.wins, f.created_at AS since
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE f.user_a = ? OR f.user_b = ?
       ORDER BY u.username COLLATE NOCASE`,
    )
    .all(userId, userId, userId) as unknown as FriendRow[];
}

export function listIncomingFriendRequests(userId: number): FriendRequest[] {
  const rows = db
    .prepare(
      `SELECT u.username, r.created_at
       FROM friend_requests r
       JOIN users u ON u.id = r.requester_id
       WHERE r.addressee_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(userId) as unknown as RequestRow[];
  return rows.map((row) => ({ username: row.username, createdAt: row.created_at }));
}

export function listOutgoingFriendRequests(userId: number): FriendRequest[] {
  const rows = db
    .prepare(
      `SELECT u.username, r.created_at
       FROM friend_requests r
       JOIN users u ON u.id = r.addressee_id
       WHERE r.requester_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(userId) as unknown as RequestRow[];
  return rows.map((row) => ({ username: row.username, createdAt: row.created_at }));
}

export type FriendRequestResult = 'requested' | 'pending' | 'accepted' | 'already_friends';

export function createFriendRequest(requesterId: number, addresseeId: number): FriendRequestResult {
  if (areFriends(requesterId, addresseeId)) return 'already_friends';

  const reverse = db
    .prepare('SELECT 1 FROM friend_requests WHERE requester_id = ? AND addressee_id = ?')
    .get(addresseeId, requesterId);
  if (reverse) {
    createFriendship(requesterId, addresseeId);
    return 'accepted';
  }

  const existing = db
    .prepare('SELECT 1 FROM friend_requests WHERE requester_id = ? AND addressee_id = ?')
    .get(requesterId, addresseeId);
  if (existing) return 'pending';

  db.prepare('INSERT INTO friend_requests (requester_id, addressee_id, created_at) VALUES (?, ?, ?)').run(
    requesterId,
    addresseeId,
    Date.now(),
  );
  return 'requested';
}

export function createFriendship(userId: number, otherId: number) {
  const [userA, userB] = friendshipPair(userId, otherId);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(userA, userB, Date.now());
    db.prepare(
      `DELETE FROM friend_requests
       WHERE (requester_id = ? AND addressee_id = ?)
          OR (requester_id = ? AND addressee_id = ?)`,
    ).run(userId, otherId, otherId, userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function declineFriendRequest(addresseeId: number, requesterId: number): boolean {
  const result = db
    .prepare('DELETE FROM friend_requests WHERE requester_id = ? AND addressee_id = ?')
    .run(requesterId, addresseeId);
  return result.changes > 0;
}

export function storeMessage(senderId: number, recipientId: number, body: string): StoredMessage {
  const createdAt = Date.now();
  const result = db
    .prepare('INSERT INTO chat_messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(senderId, recipientId, body, createdAt);
  return getMessage(Number(result.lastInsertRowid))!;
}

function rowToMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    sender: row.sender,
    recipient: row.recipient,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function getMessage(id: number): StoredMessage | null {
  const row = db
    .prepare(
      `SELECT m.id, m.sender_id, m.recipient_id, sender.username AS sender, recipient.username AS recipient, m.body, m.created_at
       FROM chat_messages m
       JOIN users sender ON sender.id = m.sender_id
       JOIN users recipient ON recipient.id = m.recipient_id
       WHERE m.id = ?`,
    )
    .get(id) as MessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function listThread(userId: number, otherId: number, limit = 80): StoredMessage[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.sender_id, m.recipient_id, sender.username AS sender, recipient.username AS recipient, m.body, m.created_at
       FROM chat_messages m
       JOIN users sender ON sender.id = m.sender_id
       JOIN users recipient ON recipient.id = m.recipient_id
       WHERE (m.sender_id = ? AND m.recipient_id = ?)
          OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.id DESC
       LIMIT ?`,
    )
    .all(userId, otherId, otherId, userId, limit) as unknown as MessageRow[];
  return rows.reverse().map(rowToMessage);
}

export function lastThreadMessage(userId: number, otherId: number): StoredMessage | null {
  const row = db
    .prepare(
      `SELECT m.id, m.sender_id, m.recipient_id, sender.username AS sender, recipient.username AS recipient, m.body, m.created_at
       FROM chat_messages m
       JOIN users sender ON sender.id = m.sender_id
       JOIN users recipient ON recipient.id = m.recipient_id
       WHERE (m.sender_id = ? AND m.recipient_id = ?)
          OR (m.sender_id = ? AND m.recipient_id = ?)
       ORDER BY m.id DESC
       LIMIT 1`,
    )
    .get(userId, otherId, otherId, userId) as MessageRow | undefined;
  return row ? rowToMessage(row) : null;
}
