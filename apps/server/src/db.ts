import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ADULT_REQUIRED,
  PREMIUM_CLOSED,
  DEFAULT_REFERRAL_SETTINGS,
  normalizeProfile,
  referralDepositBonus,
  validateReferralSettings,
  type ReferralSettings,
  stakeConfig, type AppNotification, type ChatMessageKind, type GameId, type NotificationKind, type Profile } from '@ludo/engine';

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

if (!(db.prepare('PRAGMA table_info(chat_messages)').all() as { name: string }[]).some((c) => c.name === 'read_at')) {
  db.exec('ALTER TABLE chat_messages ADD COLUMN read_at INTEGER');
}
{
  const columns = (db.prepare('PRAGMA table_info(chat_messages)').all() as { name: string }[]).map((c) => c.name);
  const add = (name: string, definition: string) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE chat_messages ADD COLUMN ${name} ${definition}`);
  };
  add('kind', "TEXT NOT NULL DEFAULT 'text'");
  add('reply_to', 'INTEGER');
  add('forwarded', 'INTEGER NOT NULL DEFAULT 0');
  add('deleted_at', 'INTEGER');
  add('duration_ms', 'INTEGER');
  // Group messages carry their group and have the sender as recipient: private-thread queries never match them.
  add('group_id', 'INTEGER');
  add('edited_at', 'INTEGER');
}
// Earlier versions of edited messages, kept for the moderators: rows are only ever added.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_message_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    previous_body TEXT NOT NULL,
    edited_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_message_edits_message ON chat_message_edits (message_id, id);
  CREATE TRIGGER IF NOT EXISTS chat_message_edits_no_update BEFORE UPDATE ON chat_message_edits
  BEGIN SELECT RAISE(ABORT, 'chat_message_edits is append-only'); END;
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS chat_messages_group ON chat_messages (group_id, id) WHERE group_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS chat_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_group_members (
    group_id INTEGER NOT NULL REFERENCES chat_groups (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    admin INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    -- Messages up to this id were posted before they joined: they don't see them.
    history_from INTEGER NOT NULL DEFAULT 0,
    read_up_to INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS chat_group_members_user ON chat_group_members (user_id);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_audio (
    message_id INTEGER PRIMARY KEY REFERENCES chat_messages (id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_reactions (
    message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS chat_hidden (
    message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
  );
`);
db.exec('CREATE INDEX IF NOT EXISTS chat_messages_unread ON chat_messages (recipient_id, sender_id) WHERE read_at IS NULL');
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);
`);

if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === 'premium_coins')) {
  db.exec('ALTER TABLE users ADD COLUMN premium_coins INTEGER NOT NULL DEFAULT 0 CHECK (premium_coins >= 0)');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS coin_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- NULL for the platform's own account (commissions).
    user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    currency TEXT NOT NULL CHECK (currency IN ('free', 'premium')),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS coin_ledger_user ON coin_ledger (user_id, id DESC);
  CREATE TABLE IF NOT EXISTS stake_pots (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    stake INTEGER NOT NULL,
    players TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'settled', 'refunded')),
    winner_id INTEGER,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );
  -- Rooms in play, saved after every change so a restart can resume them (see rooms.ts, duel-rooms.ts).
  CREATE TABLE IF NOT EXISTS live_rooms (
    kind TEXT NOT NULL,
    code TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (kind, code)
  );
`);

const userColumns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
if (!userColumns.includes('banned_at')) db.exec('ALTER TABLE users ADD COLUMN banned_at INTEGER');
if (!userColumns.includes('ban_reason')) db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT');
// Real name given at sign-up; private (the player and the admins only). NULL for accounts made before.
if (!userColumns.includes('full_name')) db.exec('ALTER TABLE users ADD COLUMN full_name TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER REFERENCES admins (id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS admin_log_target ON admin_log (target, id DESC);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolution TEXT,
    UNIQUE (message_id, reporter_id)
  );
  CREATE INDEX IF NOT EXISTS chat_reports_open ON chat_reports (resolved_at, id DESC);
`);

// Audit trail kept for inspection: archived games and ledger lines can only be added.
db.exec(`
  CREATE TABLE IF NOT EXISTS game_archive (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    pot_id TEXT,
    players TEXT NOT NULL,
    moves TEXT NOT NULL,
    rolls TEXT,
    dice_seed TEXT,
    dice_commit TEXT,
    winner TEXT,
    reason TEXT,
    started_at INTEGER,
    ended_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS game_archive_pot ON game_archive (pot_id);
  CREATE TRIGGER IF NOT EXISTS game_archive_no_update BEFORE UPDATE ON game_archive
    BEGIN SELECT RAISE(ABORT, 'Archive en lecture seule'); END;
  CREATE TRIGGER IF NOT EXISTS game_archive_no_delete BEFORE DELETE ON game_archive
    BEGIN SELECT RAISE(ABORT, 'Archive en lecture seule'); END;
  CREATE TRIGGER IF NOT EXISTS coin_ledger_no_delete BEFORE DELETE ON coin_ledger
    BEGIN SELECT RAISE(ABORT, 'Historique des pièces en lecture seule'); END;
  CREATE TRIGGER IF NOT EXISTS coin_ledger_no_update BEFORE UPDATE ON coin_ledger
    WHEN NEW.delta IS NOT OLD.delta OR NEW.currency IS NOT OLD.currency OR NEW.reason IS NOT OLD.reason
      OR NEW.ref IS NOT OLD.ref OR NEW.created_at IS NOT OLD.created_at
      OR (NEW.user_id IS NOT NULL AND NEW.user_id IS NOT OLD.user_id)
    BEGIN SELECT RAISE(ABORT, 'Historique des pièces en lecture seule'); END;
`);

export interface ArchivedGame {
  id: string;
  game: GameId;
  potId: string | null;
  players: { seat: string; userId: number | null; name: string }[];
  moves: unknown[];
  rolls: number[] | null;
  diceSeed: string | null;
  diceCommit: string | null;
  winner: string | null;
  reason: string | null;
  startedAt: number | null;
  endedAt: number;
}

/** Stores a finished game for inspection, once; later calls with the same id are ignored. */
export function archiveGame(a: ArchivedGame) {
  db.prepare(
    `INSERT OR IGNORE INTO game_archive (id, game, pot_id, players, moves, rolls, dice_seed, dice_commit, winner, reason, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    a.id,
    a.game,
    a.potId,
    JSON.stringify(a.players),
    JSON.stringify(a.moves),
    a.rolls ? JSON.stringify(a.rolls) : null,
    a.diceSeed,
    a.diceCommit,
    a.winner,
    a.reason,
    a.startedAt,
    a.endedAt,
  );
}

export interface SuspiciousPair {
  players: { id: number; username: string | null; wins: number }[];
  games: number;
  /** Coins that changed hands between the two, by currency. */
  volume: { free: number; premium: number };
}

/**
 * Pairs of accounts who often meet at staked tables with one of them nearly always winning:
 * a sign of one person feeding coins from one account to another.
 */
export function suspiciousPairs(minGames = 5, minWinRate = 0.8, days = 30): SuspiciousPair[] {
  const rows = db
    .prepare("SELECT players, winner_id, currency, stake FROM stake_pots WHERE status = 'settled' AND winner_id IS NOT NULL AND created_at > ?")
    .all(Date.now() - days * 86_400_000) as { players: string; winner_id: number; currency: Currency; stake: number }[];
  const pairs = new Map<string, { a: number; b: number; winsA: number; winsB: number; volume: { free: number; premium: number } }>();
  for (const row of rows) {
    const ids = JSON.parse(row.players) as number[];
    if (ids.length !== 2) continue;
    const [a, b] = ids[0]! < ids[1]! ? [ids[0]!, ids[1]!] : [ids[1]!, ids[0]!];
    const key = `${a}:${b}`;
    const pair = pairs.get(key) ?? { a, b, winsA: 0, winsB: 0, volume: { free: 0, premium: 0 } };
    if (row.winner_id === a) pair.winsA++;
    else pair.winsB++;
    pair.volume[row.currency] += row.stake;
    pairs.set(key, pair);
  }
  const name = (id: number) => (db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined)?.username ?? null;
  return [...pairs.values()]
    .filter((p) => p.winsA + p.winsB >= minGames && Math.max(p.winsA, p.winsB) / (p.winsA + p.winsB) >= minWinRate)
    .sort((x, y) => y.winsA + y.winsB - (x.winsA + x.winsB))
    .slice(0, 50)
    .map((p) => ({
      players: [
        { id: p.a, username: name(p.a), wins: p.winsA },
        { id: p.b, username: name(p.b), wins: p.winsB },
      ],
      games: p.winsA + p.winsB,
      volume: p.volume,
    }));
}

export function archivedGamesOfPot(potId: string): ArchivedGame[] {
  const rows = db.prepare('SELECT * FROM game_archive WHERE pot_id = ? ORDER BY ended_at').all(potId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    game: r.game as ArchivedGame['game'],
    potId: r.pot_id as string | null,
    players: JSON.parse(r.players as string),
    moves: JSON.parse(r.moves as string),
    rolls: r.rolls ? JSON.parse(r.rolls as string) : null,
    diceSeed: r.dice_seed as string | null,
    diceCommit: r.dice_commit as string | null,
    winner: r.winner as string | null,
    reason: r.reason as string | null,
    startedAt: r.started_at as number | null,
    endedAt: r.ended_at as number,
  }));
}

export type Currency = 'free' | 'premium';

export interface Wallet {
  free: number;
  premium: number;
}

export function getWallet(userId: number): Wallet {
  const row = db.prepare('SELECT profile, premium_coins FROM users WHERE id = ?').get(userId) as
    | { profile: string; premium_coins: number }
    | undefined;
  if (!row) return { free: 0, premium: 0 };
  return { free: normalizeProfile(JSON.parse(row.profile)).coins, premium: row.premium_coins };
}

export interface CoinMove {
  userId: number;
  currency: Currency;
  delta: number;
  reason: string;
  ref: string;
}

const coinListeners = new Set<(move: CoinMove) => void>();
/** Moves of the transaction in progress, announced only once it is committed. */
let uncommittedMoves: CoinMove[] | null = null;

/** Called after each committed stake, prize or refund, e.g. to tell the player's phone. */
export function onCoinsMoved(listener: (move: CoinMove) => void) {
  coinListeners.add(listener);
  return () => coinListeners.delete(listener);
}

/** Adds (or with a negative delta removes) coins and writes the ledger line; call inside a transaction. */
function moveCoins(userId: number, currency: Currency, delta: number, reason: string, ref: string) {
  uncommittedMoves?.push({ userId, currency, delta, reason, ref });
  if (currency === 'premium') {
    const done = db.prepare('UPDATE users SET premium_coins = premium_coins + ? WHERE id = ? AND premium_coins + ? >= 0').run(delta, userId, delta);
    if (done.changes === 0) throw new Error('Solde insuffisant');
  } else {
    const row = db.prepare('SELECT profile FROM users WHERE id = ?').get(userId) as { profile: string } | undefined;
    if (!row) throw new Error('Utilisateur introuvable');
    const profile = normalizeProfile(JSON.parse(row.profile));
    if (profile.coins + delta < 0) throw new Error('Solde insuffisant');
    saveProfile(userId, { ...profile, coins: profile.coins + delta });
  }
  db.prepare('INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    userId,
    currency,
    delta,
    reason,
    ref,
    Date.now(),
  );
}

function inTransaction<T>(run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  uncommittedMoves = [];
  let result: T;
  try {
    result = run();
    db.exec('COMMIT');
  } catch (err) {
    uncommittedMoves = null;
    db.exec('ROLLBACK');
    throw err;
  }
  const moves = uncommittedMoves;
  uncommittedMoves = null;
  for (const move of moves) {
    for (const listener of coinListeners) {
      try {
        listener(move);
      } catch (err) {
        console.error('Notification de solde impossible', err);
      }
    }
  }
  return result;
}

/**
 * Takes every player's stake into a new pot, all or nothing. Returns the players who can't
 * afford it (nothing is taken then).
 */
export function openPot(potId: string, tableId: string, currency: Currency, stake: number, userIds: number[]): number[] {
  if (currency === 'premium' && !stakeConfig().premiumEnabled) throw new Error(PREMIUM_CLOSED);
  if (currency === 'premium' && notAdultConfirmed(userIds).length) throw new Error(ADULT_REQUIRED);
  return inTransaction(() => {
    const short = userIds.filter((id) => getWallet(id)[currency] < stake);
    if (short.length) return short;
    for (const id of userIds) moveCoins(id, currency, -stake, 'stake', potId);
    db.prepare('INSERT INTO stake_pots (id, table_id, currency, stake, players, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      potId,
      tableId,
      currency,
      stake,
      JSON.stringify(userIds),
      'open',
      Date.now(),
    );
    return [];
  });
}

interface PotRow {
  id: string;
  currency: Currency;
  stake: number;
  players: string;
  status: string;
}

/** Pays the winner's prize and books the rest as the platform's commission. */
export function settlePot(potId: string, winnerId: number, prize: number): boolean {
  return inTransaction(() => {
    const pot = db.prepare('SELECT * FROM stake_pots WHERE id = ?').get(potId) as PotRow | undefined;
    if (!pot || pot.status !== 'open') return false;
    const total = pot.stake * (JSON.parse(pot.players) as number[]).length;
    moveCoins(winnerId, pot.currency, prize, 'prize', potId);
    if (pot.currency === 'premium') for (const id of JSON.parse(pot.players) as number[]) countWager(id, pot.stake);
    db.prepare('INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, created_at) VALUES (NULL, ?, ?, ?, ?, ?)').run(
      pot.currency,
      total - prize,
      'commission',
      potId,
      Date.now(),
    );
    db.prepare("UPDATE stake_pots SET status = 'settled', winner_id = ?, closed_at = ? WHERE id = ?").run(winnerId, Date.now(), potId);
    return true;
  });
}

/** Gives every stake back, e.g. when a game could not finish. */
export function refundPot(potId: string): boolean {
  return inTransaction(() => {
    const pot = db.prepare('SELECT * FROM stake_pots WHERE id = ?').get(potId) as PotRow | undefined;
    if (!pot || pot.status !== 'open') return false;
    for (const id of JSON.parse(pot.players) as number[]) {
      if (getUser(id)) moveCoins(id, pot.currency, pot.stake, 'refund', potId);
    }
    db.prepare("UPDATE stake_pots SET status = 'refunded', closed_at = ? WHERE id = ?").run(Date.now(), potId);
    return true;
  });
}

/**
 * Nobody gets the pot back: the game was quit on purpose on the only device it was played on.
 * The stakes stay taken and are booked as the platform's.
 */
export function forfeitPot(potId: string): boolean {
  return inTransaction(() => {
    const pot = db.prepare('SELECT * FROM stake_pots WHERE id = ?').get(potId) as PotRow | undefined;
    if (!pot || pot.status !== 'open') return false;
    const players = JSON.parse(pot.players) as number[];
    const now = Date.now();
    for (const id of players) {
      db.prepare('INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, created_at) VALUES (?, ?, 0, ?, ?, ?)').run(
        id,
        pot.currency,
        'forfeit',
        potId,
        now,
      );
      uncommittedMoves?.push({ userId: id, currency: pot.currency, delta: -pot.stake, reason: 'forfeit', ref: potId });
      if (pot.currency === 'premium') countWager(id, pot.stake);
    }
    db.prepare('INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, created_at) VALUES (NULL, ?, ?, ?, ?, ?)').run(
      pot.currency,
      pot.stake * players.length,
      'commission',
      potId,
      now,
    );
    db.prepare("UPDATE stake_pots SET status = 'settled', closed_at = ? WHERE id = ?").run(now, potId);
    return true;
  });
}

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- The payment provider's transaction id: one transaction is credited at most once.
    reference TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users (id),
    kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    phone TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS payments_user ON payments (user_id, id DESC);
`);

{
  const columns = (db.prepare('PRAGMA table_info(payments)').all() as { name: string }[]).map((c) => c.name);
  const add = (name: string, definition: string) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE payments ADD COLUMN ${name} ${definition}`);
  };
  // Wave's checkout session id for a deposit, Wave's transaction id for a withdrawal paid by hand.
  add('provider_ref', 'TEXT');
  add('note', 'TEXT');
  add('admin_id', 'INTEGER REFERENCES admins (id) ON DELETE SET NULL');
  db.exec("CREATE INDEX IF NOT EXISTS payments_pending ON payments (kind, status, id) WHERE status = 'pending'");
}
if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === 'wave_phone')) {
  db.exec('ALTER TABLE users ADD COLUMN wave_phone TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_wave_phone ON users (wave_phone) WHERE wave_phone IS NOT NULL');
{
  const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes('adult_confirmed_at')) db.exec('ALTER TABLE users ADD COLUMN adult_confirmed_at INTEGER');
  if (!columns.includes('adult_confirmed_ip')) db.exec('ALTER TABLE users ADD COLUMN adult_confirmed_ip TEXT');
}

/** When the player certified being 18 or older, required for anything Premium; null if never. */
export function adultConfirmedAt(userId: number): number | null {
  const row = db.prepare('SELECT adult_confirmed_at AS at FROM users WHERE id = ?').get(userId) as { at: number | null } | undefined;
  return row?.at ?? null;
}

/** Records the player's age certification once; the first date and address are kept. */
export function confirmAdult(userId: number, ip: string) {
  db.prepare('UPDATE users SET adult_confirmed_at = ?, adult_confirmed_ip = ? WHERE id = ? AND adult_confirmed_at IS NULL').run(Date.now(), ip.slice(0, 64), userId);
}

export function adultConfirmation(userId: number): { at: number; ip: string | null } | null {
  const row = db.prepare('SELECT adult_confirmed_at AS at, adult_confirmed_ip AS ip FROM users WHERE id = ?').get(userId) as
    | { at: number | null; ip: string | null }
    | undefined;
  return row?.at ? { at: row.at, ip: row.ip } : null;
}

/** The players among `userIds` who haven't certified being 18 or older. */
export function notAdultConfirmed(userIds: number[]): number[] {
  return userIds.filter((id) => adultConfirmedAt(id) === null);
}

export type PaymentKind = 'deposit' | 'withdrawal';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface Payment {
  reference: string;
  userId: number;
  kind: PaymentKind;
  amount: number;
  phone: string | null;
  status: PaymentStatus;
  providerRef: string | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

const PAYMENT_COLUMNS = `reference, user_id AS userId, kind, amount, phone, status, provider_ref AS providerRef, note,
  created_at AS createdAt, updated_at AS updatedAt`;

export function getPayment(reference: string): Payment | null {
  return (db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE reference = ?`).get(reference) as Payment | undefined) ?? null;
}

/** The player's latest deposits and withdrawals, newest first. */
export function paymentsOf(userId: number, limit = 10): Payment[] {
  return db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(userId, limit) as unknown as Payment[];
}

/** The Wave number tied to the account: deposits must come from it and withdrawals go to it. */
export function wavePhoneOf(userId: number): string | null {
  return (db.prepare('SELECT wave_phone FROM users WHERE id = ?').get(userId) as { wave_phone: string | null } | undefined)?.wave_phone ?? null;
}

/**
 * Ties a Wave number to the account, once. One number serves one account only: two accounts
 * cashing out to the same wallet are one person.
 */
export function claimWavePhone(userId: number, phone: string): 'ok' | 'other_number' | 'used_elsewhere' {
  return inTransaction(() => {
    const tied = wavePhoneOf(userId);
    if (tied) return tied === phone ? 'ok' : 'other_number';
    if (db.prepare('SELECT 1 FROM users WHERE wave_phone = ? AND id <> ?').get(phone, userId)) return 'used_elsewhere';
    db.prepare('UPDATE users SET wave_phone = ? WHERE id = ?').run(phone, userId);
    return 'ok';
  });
}

export function clearWavePhone(userId: number) {
  db.prepare('UPDATE users SET wave_phone = NULL WHERE id = ?').run(userId);
}

/** A deposit waiting for its Wave payment; nothing is credited yet. */
export function openDeposit(reference: string, userId: number, amount: number, phone: string) {
  const now = Date.now();
  db.prepare("INSERT INTO payments (reference, user_id, kind, amount, phone, status, created_at, updated_at) VALUES (?, ?, 'deposit', ?, ?, 'pending', ?, ?)").run(
    reference,
    userId,
    amount,
    phone,
    now,
    now,
  );
}

export function setPaymentProviderRef(reference: string, providerRef: string) {
  db.prepare('UPDATE payments SET provider_ref = ?, updated_at = ? WHERE reference = ?').run(providerRef, Date.now(), reference);
}

/**
 * Credits a pending deposit Wave confirmed as paid; false if unknown or already closed (a replayed notification).
 * `by` is set when an admin credits it by hand after checking the payment in the Wave Business account.
 */
export function confirmDeposit(reference: string, providerRef: string, by?: { adminId: number; note: string }): boolean {
  return inTransaction(() => {
    const row = db.prepare("SELECT user_id, amount FROM payments WHERE reference = ? AND kind = 'deposit' AND status = 'pending'").get(reference) as
      | { user_id: number; amount: number }
      | undefined;
    if (!row) return false;
    db.prepare("UPDATE payments SET status = 'succeeded', provider_ref = ?, note = ?, admin_id = ?, updated_at = ? WHERE reference = ?").run(
      providerRef,
      by?.note ?? null,
      by?.adminId ?? null,
      Date.now(),
      reference,
    );
    moveCoins(row.user_id, 'premium', row.amount, 'deposit', reference);
    rewardReferralDeposit(row.user_id, row.amount);
    return true;
  });
}

/** Closes a pending deposit that was never paid (expired or refused by Wave, or closed by an admin). */
export function failDeposit(reference: string, note: string, adminId: number | null = null): boolean {
  const result = db
    .prepare("UPDATE payments SET status = 'failed', note = ?, admin_id = ?, updated_at = ? WHERE reference = ? AND kind = 'deposit' AND status = 'pending'")
    .run(note, adminId, Date.now(), reference);
  return result.changes > 0;
}

/** Another payment already credited with this Wave transaction id, if any (a transaction is credited once). */
export function paymentWithProviderRef(providerRef: string, except: string): string | null {
  const row = db
    .prepare("SELECT reference FROM payments WHERE provider_ref = ? AND status = 'succeeded' AND reference <> ? LIMIT 1")
    .get(providerRef, except) as { reference: string } | undefined;
  return row?.reference ?? null;
}

/** Pending deposits opened before `before`: their Wave session has expired, they must be settled. */
export function staleDeposits(before: number): Payment[] {
  return db
    .prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE kind = 'deposit' AND status = 'pending' AND created_at < ? ORDER BY id LIMIT 100`)
    .all(before) as unknown as Payment[];
}

export function pendingDepositsOf(userId: number): { count: number; total: number } {
  const row = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM payments WHERE user_id = ? AND kind = 'deposit' AND status = 'pending'")
    .get(userId) as { n: number; total: number };
  return { count: row.n, total: row.total };
}

/**
 * Takes the coins of a withdrawal at once; an admin then pays it by hand on Wave or refuses it.
 * Returns why it was refused, or null. Balance and limits are checked in the same transaction as the debit.
 */
export function requestWithdrawal(
  reference: string,
  userId: number,
  amount: number,
  phone: string,
  limits: { perDay: number },
): string | null {
  return inTransaction(() => {
    const pending = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND kind = 'withdrawal' AND status = 'pending'").get(userId) as { n: number };
    if (pending.n > 0) return 'Tu as déjà un retrait en cours de traitement.';
    const since = Date.now() - 24 * 60 * 60_000;
    const recent = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE user_id = ? AND kind = 'withdrawal' AND status <> 'failed' AND created_at > ?")
      .get(userId, since) as { n: number };
    if (recent.n + amount > limits.perDay) {
      return `Retraits limités à ${limits.perDay.toLocaleString('fr-FR')} F par 24 h (encore ${Math.max(0, limits.perDay - recent.n).toLocaleString('fr-FR')} F possibles).`;
    }
    const { premium } = getWallet(userId);
    if (premium < amount) return 'Solde Premium insuffisant.';
    const bonus = premiumBonusOf(userId);
    if (premium - bonus.locked < amount) {
      return `${bonus.locked.toLocaleString('fr-FR')} pièces de bonus ne sont pas encore retirables : mise encore ${bonus.wagerDue.toLocaleString('fr-FR')} pièces Premium en parties pour les débloquer (retirable maintenant : ${Math.max(0, premium - bonus.locked).toLocaleString('fr-FR')}).`;
    }
    const now = Date.now();
    moveCoins(userId, 'premium', -amount, 'withdrawal', reference);
    db.prepare("INSERT INTO payments (reference, user_id, kind, amount, phone, status, created_at, updated_at) VALUES (?, ?, 'withdrawal', ?, ?, 'pending', ?, ?)").run(
      reference,
      userId,
      amount,
      phone,
      now,
      now,
    );
    return null;
  });
}

/**
 * Closes a pending withdrawal: paid by hand on Wave (with Wave's transaction id), or refused and
 * given back. False if unknown or already closed.
 */
export function settleWithdrawal(reference: string, outcome: { paid: true; providerRef: string } | { paid: false; note: string }, adminId: number): boolean {
  return inTransaction(() => {
    const row = db.prepare("SELECT user_id, amount FROM payments WHERE reference = ? AND kind = 'withdrawal' AND status = 'pending'").get(reference) as
      | { user_id: number; amount: number }
      | undefined;
    if (!row) return false;
    db.prepare('UPDATE payments SET status = ?, provider_ref = ?, note = ?, admin_id = ?, updated_at = ? WHERE reference = ?').run(
      outcome.paid ? 'succeeded' : 'failed',
      outcome.paid ? outcome.providerRef : null,
      outcome.paid ? null : outcome.note,
      adminId,
      Date.now(),
      reference,
    );
    if (!outcome.paid) moveCoins(row.user_id, 'premium', row.amount, 'withdrawal_refund', reference);
    return true;
  });
}

export interface AdminPayment extends Payment {
  username: string;
  wavePhone: string | null;
  premiumCoins: number;
  /** All deposits and paid withdrawals of the player, to spot coins cashed out without being played. */
  totalDeposited: number;
  totalWithdrawn: number;
  admin: string | null;
}

export function listPayments(options: { kind?: PaymentKind; status?: PaymentStatus; offset?: number; limit?: number }): {
  payments: AdminPayment[];
  total: number;
} {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.kind) {
    where.push('p.kind = ?');
    params.push(options.kind);
  }
  if (options.status) {
    where.push('p.status = ?');
    params.push(options.status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM payments p ${clause}`).get(...params) as { n: number }).n;
  // Oldest first while waiting, so withdrawals are paid in the order they were asked.
  const order = options.status === 'pending' ? 'p.id ASC' : 'p.id DESC';
  const payments = db
    .prepare(
      `SELECT p.reference, p.user_id AS userId, p.kind, p.amount, p.phone, p.status, p.provider_ref AS providerRef, p.note,
         p.created_at AS createdAt, p.updated_at AS updatedAt, u.username, u.wave_phone AS wavePhone, u.premium_coins AS premiumCoins,
         (SELECT COALESCE(SUM(amount), 0) FROM payments d WHERE d.user_id = p.user_id AND d.kind = 'deposit' AND d.status = 'succeeded') AS totalDeposited,
         (SELECT COALESCE(SUM(amount), 0) FROM payments w WHERE w.user_id = p.user_id AND w.kind = 'withdrawal' AND w.status = 'succeeded') AS totalWithdrawn,
         a.email AS admin
       FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN admins a ON a.id = p.admin_id
       ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    )
    .all(...params, options.limit ?? 50, options.offset ?? 0) as unknown as AdminPayment[];
  return { payments, total };
}

export function pendingWithdrawalCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM payments WHERE kind = 'withdrawal' AND status = 'pending'").get() as { n: number }).n;
}

{
  const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  const add = (name: string, definition: string) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  };
  add('referred_by', 'INTEGER REFERENCES users (id) ON DELETE SET NULL');
  add('referral_games', 'INTEGER NOT NULL DEFAULT 0');
  add('referral_rewarded_at', 'INTEGER');
  add('signup_ip', 'TEXT');
  add('signup_device', 'TEXT');
  // On the invited account: when its first qualifying deposit paid its inviter, and how much.
  add('referral_deposit_at', 'INTEGER');
  add('referral_deposit_bonus', 'INTEGER');
  add('referral_welcome_bonus', 'INTEGER');
  // Premium bonus coins that can be staked but not withdrawn yet, and what is left to stake to free them.
  add('premium_locked', 'INTEGER NOT NULL DEFAULT 0');
  add('premium_wager_due', 'INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE INDEX IF NOT EXISTS users_referred_by ON users (referred_by)');
}

/** Where a new account was created from, and who invited it (unless it looks like the inviter's own second account). */
export function recordSignup(userId: number, ip: string, device: string, referrerId: number | null) {
  let referredBy = referrerId;
  if (referrerId !== null) {
    const referrer = db.prepare('SELECT signup_ip, signup_device FROM users WHERE id = ?').get(referrerId) as
      | { signup_ip: string | null; signup_device: string | null }
      | undefined;
    const sameDevice = !!device && referrer?.signup_device === device;
    const sameIp = !!ip && referrer?.signup_ip === ip;
    if (!referrer || sameDevice || sameIp) referredBy = null;
  }
  db.prepare('UPDATE users SET signup_ip = ?, signup_device = ?, referred_by = ? WHERE id = ?').run(ip || null, device || null, referredBy, userId);
  return referredBy;
}

export interface ReferralReward {
  referrerId: number;
  referrerCoins: number;
  newcomerCoins: number;
}

/**
 * Counts an online game against real players for an invited account; at `gamesNeeded` both
 * it and its inviter get their coins, once (and at most `maxRewarded` times per inviter).
 */
export function progressReferral(
  userId: number,
  rules: { gamesNeeded: number; referrerCoins: number; newcomerCoins: number; maxRewarded: number },
): ReferralReward | null {
  return inTransaction(() => {
    const row = db.prepare('SELECT referred_by, referral_games, referral_rewarded_at FROM users WHERE id = ?').get(userId) as
      | { referred_by: number | null; referral_games: number; referral_rewarded_at: number | null }
      | undefined;
    if (!row?.referred_by || row.referral_rewarded_at !== null) return null;
    const games = row.referral_games + 1;
    db.prepare('UPDATE users SET referral_games = ? WHERE id = ?').run(games, userId);
    if (games < rules.gamesNeeded) return null;
    const rewarded = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND referral_rewarded_at IS NOT NULL').get(row.referred_by) as {
      n: number;
    }).n;
    db.prepare('UPDATE users SET referral_rewarded_at = ? WHERE id = ?').run(Date.now(), userId);
    const ref = `user:${userId}`;
    const referrerCoins = rewarded < rules.maxRewarded && getUser(row.referred_by) ? rules.referrerCoins : 0;
    if (referrerCoins) moveCoins(row.referred_by, 'free', referrerCoins, 'referral', ref);
    if (rules.newcomerCoins) moveCoins(userId, 'free', rules.newcomerCoins, 'referral', ref);
    return { referrerId: row.referred_by, referrerCoins, newcomerCoins: rules.newcomerCoins };
  });
}

export interface Referral {
  username: string;
  games: number;
  rewardedAt: number | null;
  /** Premium bonus the inviter got for this friend's first deposit; null before it. */
  depositBonus: number | null;
  joinedAt: number;
}

export function referralsOf(userId: number): Referral[] {
  return (
    db
      .prepare(
        'SELECT username, referral_games, referral_rewarded_at, referral_deposit_bonus, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 100',
      )
      .all(userId) as {
      username: string;
      referral_games: number;
      referral_rewarded_at: number | null;
      referral_deposit_bonus: number | null;
      created_at: number;
    }[]
  ).map((r) => ({
    username: r.username,
    games: r.referral_games,
    rewardedAt: r.referral_rewarded_at,
    depositBonus: r.referral_deposit_bonus,
    joinedAt: r.created_at,
  }));
}

/** Who invited this player, and how far they are towards the welcome bonus. */
export function referrerOf(userId: number): { username: string; games: number; rewardedAt: number | null; welcomeBonus: number | null } | null {
  const row = db
    .prepare(
      'SELECT r.username, u.referral_games, u.referral_rewarded_at, u.referral_welcome_bonus FROM users u JOIN users r ON r.id = u.referred_by WHERE u.id = ?',
    )
    .get(userId) as
    | { username: string; referral_games: number; referral_rewarded_at: number | null; referral_welcome_bonus: number | null }
    | undefined;
  return row
    ? { username: row.username, games: row.referral_games, rewardedAt: row.referral_rewarded_at, welcomeBonus: row.referral_welcome_bonus }
    : null;
}

export function referralEarnings(userId: number): number {
  const row = db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'referral' AND ref <> ?").get(userId, `user:${userId}`) as { n: number };
  return row.n;
}

export function referralPremiumEarnings(userId: number): number {
  const row = db.prepare("SELECT COALESCE(SUM(delta), 0) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'referral_deposit'").get(userId) as { n: number };
  return row.n;
}

const REFERRAL_SETTING = 'referral';
/** Before the Parrainage page: only the first-deposit bonus's switch and percentage were saved. */
const LEGACY_REFERRAL_BONUS_SETTING = 'referral_bonus';

/** The referral programme as set by the admins (defaults until they change it). */
export function referralSettings(): ReferralSettings {
  const saved = getSetting<unknown>(REFERRAL_SETTING);
  if (saved !== null) {
    const valid = validateReferralSettings(saved);
    if (typeof valid !== 'string') return valid;
    console.error('Réglages de parrainage ignorés :', valid);
  }
  const defaults = structuredClone(DEFAULT_REFERRAL_SETTINGS);
  const legacy = getSetting<{ enabled?: unknown; percent?: unknown }>(LEGACY_REFERRAL_BONUS_SETTING);
  if (legacy) {
    const upgraded = validateReferralSettings({ ...defaults, deposit: { ...defaults.deposit, enabled: legacy.enabled, percent: legacy.percent } });
    if (typeof upgraded !== 'string') return upgraded;
  }
  return defaults;
}

export function setReferralSettings(settings: ReferralSettings) {
  saveSetting(REFERRAL_SETTING, settings);
}

export interface ReferralStats {
  /** Accounts created through an invitation link. */
  invited: number;
  /** Invited accounts that played enough games for the Free bonus. */
  validated: number;
  /** Invited accounts that made their first deposit. */
  depositors: number;
  /** What invited accounts deposited in all, on Wave. */
  depositedByInvited: number;
  /** What the programme cost the platform. */
  cost: { free: number; premiumInviters: number; premiumWelcome: number };
  /** Premium bonus coins still locked, waiting to be staked, across all players. */
  lockedPremium: number;
  topInviters: {
    id: number;
    username: string;
    invited: number;
    validated: number;
    depositors: number;
    freeEarned: number;
    premiumEarned: number;
  }[];
  recent: {
    id: number;
    username: string;
    inviterId: number;
    inviter: string;
    joinedAt: number;
    games: number;
    validated: boolean;
    depositBonus: number | null;
    welcomeBonus: number | null;
  }[];
}

/** Figures of the referral programme for the admin panel. */
export function referralStats(): ReferralStats {
  const one = (sql: string, ...params: (string | number)[]) => (db.prepare(sql).get(...params) as { n: number | null }).n ?? 0;
  const topInviters = db
    .prepare(
      `SELECT r.id, r.username,
         COUNT(*) AS invited,
         SUM(u.referral_rewarded_at IS NOT NULL) AS validated,
         SUM(u.referral_deposit_at IS NOT NULL) AS depositors,
         (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger c WHERE c.user_id = r.id AND c.reason = 'referral' AND c.ref <> 'user:' || r.id) AS freeEarned,
         (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger c WHERE c.user_id = r.id AND c.reason = 'referral_deposit') AS premiumEarned
       FROM users u JOIN users r ON r.id = u.referred_by
       GROUP BY r.id ORDER BY depositors DESC, validated DESC, invited DESC LIMIT 20`,
    )
    .all() as unknown as ReferralStats['topInviters'];
  const recent = (
    db
      .prepare(
        `SELECT u.id, u.username, r.id AS inviterId, r.username AS inviter, u.created_at AS joinedAt, u.referral_games AS games,
           u.referral_rewarded_at AS rewardedAt, u.referral_deposit_bonus AS depositBonus, u.referral_welcome_bonus AS welcomeBonus
         FROM users u JOIN users r ON r.id = u.referred_by ORDER BY u.created_at DESC LIMIT 30`,
      )
      .all() as {
      id: number;
      username: string;
      inviterId: number;
      inviter: string;
      joinedAt: number;
      games: number;
      rewardedAt: number | null;
      depositBonus: number | null;
      welcomeBonus: number | null;
    }[]
  ).map(({ rewardedAt, ...r }) => ({ ...r, validated: rewardedAt !== null }));
  return {
    invited: one('SELECT COUNT(*) AS n FROM users WHERE referred_by IS NOT NULL'),
    validated: one('SELECT COUNT(*) AS n FROM users WHERE referred_by IS NOT NULL AND referral_rewarded_at IS NOT NULL'),
    depositors: one('SELECT COUNT(*) AS n FROM users WHERE referred_by IS NOT NULL AND referral_deposit_at IS NOT NULL'),
    depositedByInvited: one(
      "SELECT SUM(p.amount) AS n FROM payments p JOIN users u ON u.id = p.user_id WHERE u.referred_by IS NOT NULL AND p.kind = 'deposit' AND p.status = 'succeeded'",
    ),
    cost: {
      free: one("SELECT SUM(delta) AS n FROM coin_ledger WHERE user_id IS NOT NULL AND currency = 'free' AND reason = 'referral'"),
      premiumInviters: -one("SELECT SUM(delta) AS n FROM coin_ledger WHERE user_id IS NULL AND reason = 'referral_deposit'"),
      premiumWelcome: -one("SELECT SUM(delta) AS n FROM coin_ledger WHERE user_id IS NULL AND reason = 'referral_welcome'"),
    },
    lockedPremium: one('SELECT SUM(MIN(premium_locked, premium_coins)) AS n FROM users WHERE premium_wager_due > 0'),
    topInviters,
    recent,
  };
}

/**
 * An invited player's first deposit, whatever its amount, once per invited player:
 * the inviter (for `maxRewarded` friends at most, never when banned) and the invited player each get
 * the admins' percentage of it, capped at `maxBonus`, locked until staked, and never over the Premium
 * wallet cap. Nothing happens while the admins have switched the bonus off. Call inside the deposit's transaction.
 */
function rewardReferralDeposit(userId: number, amount: number) {
  const settings = referralSettings().deposit;
  const bonus = settings.enabled ? referralDepositBonus(amount, settings.percent, settings.maxBonus) : 0;
  if (!bonus) return;
  const row = db.prepare('SELECT referred_by, referral_deposit_at FROM users WHERE id = ?').get(userId) as
    | { referred_by: number | null; referral_deposit_at: number | null }
    | undefined;
  if (!row?.referred_by || row.referral_deposit_at !== null) return;
  const inviterId = row.referred_by;
  const inviter = db.prepare('SELECT banned_at FROM users WHERE id = ?').get(inviterId) as { banned_at: number | null } | undefined;
  const paid = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND referral_deposit_bonus > 0').get(inviterId) as { n: number }).n;
  const inviterBonus = inviter && !inviter.banned_at && paid < settings.maxRewarded ? capToWallet(inviterId, bonus) : 0;
  const welcomeBonus = capToWallet(userId, bonus);
  db.prepare('UPDATE users SET referral_deposit_at = ?, referral_deposit_bonus = ?, referral_welcome_bonus = ? WHERE id = ?').run(
    Date.now(),
    inviterBonus,
    welcomeBonus,
    userId,
  );
  const ref = `user:${userId}`;
  if (inviterBonus) grantLockedBonus(inviterId, inviterBonus, settings.wagerMultiplier, 'referral_deposit', ref);
  if (welcomeBonus) grantLockedBonus(userId, welcomeBonus, settings.wagerMultiplier, 'referral_welcome', ref);
}

/** As much of `bonus` as fits under the Premium wallet cap. */
function capToWallet(userId: number, bonus: number): number {
  return Math.min(bonus, Math.max(0, stakeConfig().premiumWalletCap - getWallet(userId).premium));
}

/** Credits Premium bonus coins that must be staked before they can be withdrawn. Call inside a transaction. */
function grantLockedBonus(userId: number, amount: number, wagerMultiplier: number, reason: string, ref: string) {
  moveCoins(userId, 'premium', amount, reason, ref);
  db.prepare('UPDATE users SET premium_locked = premium_locked + ?, premium_wager_due = premium_wager_due + ? WHERE id = ?').run(
    amount,
    amount * wagerMultiplier,
    userId,
  );
  // The platform pays the bonus: booked apart from commissions, so revenue figures stay true.
  db.prepare("INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, created_at) VALUES (NULL, 'premium', ?, ?, ?, ?)").run(
    -amount,
    reason,
    ref,
    Date.now(),
  );
}

/**
 * A Premium stake of a game that went to the end (won, lost or forfeited, never refunded) counts
 * towards freeing the player's locked bonus. Once enough was staked, the bonus is free; until then,
 * coins lost in games shrink the locked part, which can't exceed the balance. Call inside a transaction.
 */
function countWager(userId: number, stake: number) {
  db.prepare(
    `UPDATE users SET
       premium_wager_due = MAX(0, premium_wager_due - ?),
       premium_locked = CASE WHEN premium_wager_due - ? <= 0 THEN 0 ELSE MIN(premium_locked, premium_coins) END
     WHERE id = ? AND premium_wager_due > 0`,
  ).run(stake, stake, userId);
}

/** Premium bonus coins the player can stake but not withdraw yet, and what is left to stake to free them. */
export function premiumBonusOf(userId: number): { locked: number; wagerDue: number } {
  const row = db.prepare('SELECT premium_locked, premium_wager_due, premium_coins FROM users WHERE id = ?').get(userId) as
    | { premium_locked: number; premium_wager_due: number; premium_coins: number }
    | undefined;
  if (!row || row.premium_wager_due <= 0) return { locked: 0, wagerDue: 0 };
  return { locked: Math.min(row.premium_locked, row.premium_coins), wagerDue: row.premium_wager_due };
}

/** Pots of games lost to a server restart: their players get their stakes back. */
/** Gives back the stakes of games that can't go on; `keep` are the pots of rooms resumed after a restart. */
export function refundOpenPots(keep: ReadonlySet<string> = new Set()): number {
  const open = db.prepare("SELECT id FROM stake_pots WHERE status = 'open'").all() as { id: string }[];
  return open.filter(({ id }) => !keep.has(id) && refundPot(id)).length;
}

export type LiveRoomKind = 'ludo' | 'duel';

export interface LiveRoomRow {
  code: string;
  version: number;
  data: string;
}

export function saveLiveRoom(kind: LiveRoomKind, code: string, version: number, data: string) {
  db.prepare('INSERT OR REPLACE INTO live_rooms (kind, code, version, data, updated_at) VALUES (?, ?, ?, ?, ?)').run(kind, code, version, data, Date.now());
}

export function deleteLiveRoom(kind: LiveRoomKind, code: string) {
  db.prepare('DELETE FROM live_rooms WHERE kind = ? AND code = ?').run(kind, code);
}

export function listLiveRooms(kind: LiveRoomKind): LiveRoomRow[] {
  return db.prepare('SELECT code, version, data FROM live_rooms WHERE kind = ?').all(kind) as unknown as LiveRoomRow[];
}

export interface LedgerLine {
  id: number;
  currency: Currency;
  delta: number;
  reason: string;
  createdAt: number;
}

/** A player's wallet history, newest first; `before` (a line id) loads the next page. */
export function ledgerOf(userId: number, limit = 30, before?: number): LedgerLine[] {
  return db
    .prepare(
      'SELECT id, currency, delta, reason, created_at AS createdAt FROM coin_ledger WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
    )
    .all(userId, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as LedgerLine[];
}

/** Commissions earned by the platform, per currency. */
export function platformRevenue(): Wallet {
  const rows = db
    .prepare("SELECT currency, SUM(delta) AS total FROM coin_ledger WHERE user_id IS NULL AND reason = 'commission' GROUP BY currency")
    .all() as { currency: Currency; total: number }[];
  return {
    free: rows.find((r) => r.currency === 'free')?.total ?? 0,
    premium: rows.find((r) => r.currency === 'premium')?.total ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Notification centre (the bell)                                      */
/* ------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- NULL for an announcement sent by the admins to every player.
    user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, id DESC);
`);
if (!(db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some((c) => c.name === 'notifications_seen_id')) {
  // The newest notification id the player had when they last opened the bell.
  db.exec('ALTER TABLE users ADD COLUMN notifications_seen_id INTEGER NOT NULL DEFAULT 0');
}

/** Personal notifications kept per player; older ones are dropped. */
const MAX_NOTIFICATIONS_PER_USER = 200;

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string | null;
}

const NOTIFICATION_COLUMNS = 'id, kind, title, body, url, created_at AS createdAt';

/** Stores a notification for one player, or for everyone (`userId` null: an announcement). */
export function addNotification(userId: number | null, n: NewNotification): AppNotification {
  const createdAt = Date.now();
  const result = db
    .prepare('INSERT INTO notifications (user_id, kind, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, n.kind, n.title, n.body, n.url ?? null, createdAt);
  const id = Number(result.lastInsertRowid);
  if (userId !== null) {
    db.prepare(
      'DELETE FROM notifications WHERE user_id = ? AND id <= (SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)',
    ).run(userId, userId, MAX_NOTIFICATIONS_PER_USER);
  }
  return { id, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, createdAt };
}

/** A player's own notifications, and the announcements sent since they joined. */
const VISIBLE_TO = '(user_id = ? OR (user_id IS NULL AND created_at >= (SELECT created_at FROM users WHERE id = ?)))';

/** Newest first; `before` (an id) loads the next page. */
export function notificationsOf(userId: number, limit = 40, before?: number): AppNotification[] {
  return db
    .prepare(`SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE ${VISIBLE_TO} AND id < ? ORDER BY id DESC LIMIT ?`)
    .all(userId, userId, before ?? Number.MAX_SAFE_INTEGER, limit) as unknown as AppNotification[];
}

export function notificationsSeenId(userId: number): number {
  return (db.prepare('SELECT notifications_seen_id AS n FROM users WHERE id = ?').get(userId) as { n: number } | undefined)?.n ?? 0;
}

export function unreadNotificationCount(userId: number): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${VISIBLE_TO} AND id > ?`).get(userId, userId, notificationsSeenId(userId)) as { n: number }
  ).n;
}

/** The player opened the bell: everything up to now is seen. */
export function markNotificationsSeen(userId: number) {
  db.prepare(`UPDATE users SET notifications_seen_id = MAX(notifications_seen_id, COALESCE((SELECT MAX(id) FROM notifications WHERE ${VISIBLE_TO}), 0)) WHERE id = ?`).run(
    userId,
    userId,
    userId,
  );
}

export interface Announcement extends AppNotification {
  /** Players who have opened the bell since it was sent. */
  seenBy: number;
}

export function listAnnouncements(limit = 50): Announcement[] {
  return db
    .prepare(
      `SELECT ${NOTIFICATION_COLUMNS}, (SELECT COUNT(*) FROM users u WHERE u.notifications_seen_id >= n.id) AS seenBy
       FROM notifications n WHERE user_id IS NULL ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as unknown as Announcement[];
}

export function deleteAnnouncement(id: number): boolean {
  return db.prepare('DELETE FROM notifications WHERE id = ? AND user_id IS NULL').run(id).changes > 0;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A device belongs to one account at a time: subscribing again moves it. */
export function savePushSubscription(userId: number, sub: PushSubscriptionRow) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
  ).run(sub.endpoint, userId, sub.p256dh, sub.auth, Date.now());
}

/** Players with at least one device subscribed to push notifications. */
export function usersWithPushSubscriptions(): number[] {
  return (db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all() as { user_id: number }[]).map((r) => r.user_id);
}

export function listPushSubscriptions(userId: number): PushSubscriptionRow[] {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as unknown as PushSubscriptionRow[];
}

export function deletePushSubscription(endpoint: string, userId?: number) {
  if (userId === undefined) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  else db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
}

/** Caps how many devices one account keeps notifications on. */
export function trimPushSubscriptions(userId: number, keep: number) {
  db.prepare(
    `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN (
       SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
  ).run(userId, userId, keep);
}

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

export function createUser(username: string, passwordHash: string, profile: Profile, fullName: string | null = null): User {
  const result = db
    .prepare('INSERT INTO users (username, password_hash, profile, xp, wins, created_at, full_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(username, passwordHash, JSON.stringify(profile), profile.xp, profile.stats.wins, Date.now(), fullName);
  return { id: Number(result.lastInsertRowid), username, profile };
}

/** The player's real name, or null for an account made before it was asked. */
export function fullNameOf(userId: number): string | null {
  return (db.prepare('SELECT full_name FROM users WHERE id = ?').get(userId) as { full_name: string | null } | undefined)?.full_name ?? null;
}

export function setFullName(userId: number, fullName: string) {
  db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, userId);
}

export function findUserForLogin(username: string): (User & { passwordHash: string; banned: boolean }) | null {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as (UserRow & { banned_at: number | null }) | undefined;
  return row ? { ...toUser(row), passwordHash: row.password_hash, banned: row.banned_at !== null } : null;
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

/**
 * Reads, transforms and saves a profile in one transaction, so concurrent updates don't overwrite each other.
 * With a `reason`, a change of Free coins is written to the ledger (the player's wallet history).
 */
export function updateProfile<T>(
  userId: number,
  change: (profile: Profile) => { profile: Profile; result: T },
  reason?: string,
  ref = '',
): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = getUser(userId);
    if (!user) throw new Error('Utilisateur introuvable');
    const { profile, result } = change(user.profile);
    if (profile !== user.profile) saveProfile(userId, profile);
    const delta = profile.coins - user.profile.coins;
    if (reason && delta !== 0) {
      db.prepare('INSERT INTO coin_ledger (user_id, currency, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        userId,
        'free',
        delta,
        reason,
        ref,
        Date.now(),
      );
    }
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
    .prepare(
      `SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.created_at > ? AND u.banned_at IS NULL`,
    )
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
  readAt: number | null;
  kind: ChatMessageKind;
  durationMs: number | null;
  forwarded: boolean;
  deleted: boolean;
  edited: boolean;
  replyTo: { id: number; from: string; kind: ChatMessageKind; body: string; durationMs: number | null; deleted: boolean } | null;
  reactions: { from: string; emoji: string }[];
  groupId: number | null;
  groupName: string | null;
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
  read_at: number | null;
  kind: string;
  reply_to: number | null;
  forwarded: number;
  deleted_at: number | null;
  edited_at: number | null;
  duration_ms: number | null;
  group_id: number | null;
  group_name: string | null;
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

export function listFriendIds(userId: number): number[] {
  const rows = db
    .prepare('SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = ? OR user_b = ?')
    .all(userId, userId, userId) as { id: number }[];
  return rows.map((row) => row.id);
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

export function cancelFriendRequest(requesterId: number, addresseeId: number): boolean {
  return declineFriendRequest(addresseeId, requesterId);
}

/** Ends a friendship; the conversation stays stored but can't continue until they're friends again. */
export function removeFriendship(userId: number, otherId: number): boolean {
  const [userA, userB] = friendshipPair(userId, otherId);
  return db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(userA, userB).changes > 0;
}

export interface NewMessage {
  body: string;
  kind?: ChatMessageKind;
  replyTo?: number | null;
  forwarded?: boolean;
  durationMs?: number | null;
}

export function storeMessage(senderId: number, recipientId: number, message: NewMessage, groupId: number | null = null): StoredMessage {
  const result = db
    .prepare(
      'INSERT INTO chat_messages (sender_id, recipient_id, body, created_at, kind, reply_to, forwarded, duration_ms, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      senderId,
      recipientId,
      message.body,
      Date.now(),
      message.kind ?? 'text',
      message.replyTo ?? null,
      message.forwarded ? 1 : 0,
      message.durationMs ?? null,
      groupId,
    );
  const id = Number(result.lastInsertRowid);
  // Your own message is read by you.
  if (groupId !== null) db.prepare('UPDATE chat_group_members SET read_up_to = ? WHERE group_id = ? AND user_id = ?').run(id, groupId, senderId);
  return getMessage(id)!;
}

export function storeGroupMessage(senderId: number, groupId: number, message: NewMessage): StoredMessage {
  return storeMessage(senderId, senderId, message, groupId);
}

/** File of a voice note or a photo (the table predates photos, hence its name). */
export function storeMedia(messageId: number, mime: string, data: Uint8Array) {
  db.prepare('INSERT INTO chat_audio (message_id, mime, data) VALUES (?, ?, ?)').run(messageId, mime, data);
}

export function getMedia(messageId: number): { mime: string; data: Uint8Array } | null {
  const row = db.prepare('SELECT mime, data FROM chat_audio WHERE message_id = ?').get(messageId) as
    | { mime: string; data: Uint8Array }
    | undefined;
  return row ?? null;
}

/** Sets or (with null) clears a user's single reaction to a message. */
export function setReaction(messageId: number, userId: number, emoji: string | null) {
  if (emoji === null) db.prepare('DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ?').run(messageId, userId);
  else {
    db.prepare(
      `INSERT INTO chat_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`,
    ).run(messageId, userId, emoji, Date.now());
  }
}

/** Leaves a "message deleted" placeholder in place of the content, for both people. */
export function deleteMessageForAll(messageId: number) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE chat_messages SET body = '', deleted_at = ?, duration_ms = NULL WHERE id = ?").run(Date.now(), messageId);
    db.prepare('DELETE FROM chat_audio WHERE message_id = ?').run(messageId);
    db.prepare('DELETE FROM chat_reactions WHERE message_id = ?').run(messageId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Replaces a message's text, keeping the previous one in `chat_message_edits`. */
export function editMessage(messageId: number, body: string) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    db.prepare('INSERT INTO chat_message_edits (message_id, previous_body, edited_at) SELECT id, body, ? FROM chat_messages WHERE id = ?').run(now, messageId);
    db.prepare('UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?').run(body, now, messageId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Earlier versions of a message, oldest first. */
export function messageEdits(messageId: number): { body: string; editedAt: number }[] {
  return (
    db.prepare('SELECT previous_body, edited_at FROM chat_message_edits WHERE message_id = ? ORDER BY id').all(messageId) as {
      previous_body: string;
      edited_at: number;
    }[]
  ).map((r) => ({ body: r.previous_body, editedAt: r.edited_at }));
}

export function hideMessage(messageId: number, userId: number) {
  db.prepare('INSERT OR IGNORE INTO chat_hidden (message_id, user_id) VALUES (?, ?)').run(messageId, userId);
}

const MESSAGE_COLUMNS = `m.id, m.sender_id, m.recipient_id, sender.username AS sender, recipient.username AS recipient, m.body,
  m.created_at, m.read_at, m.kind, m.reply_to, m.forwarded, m.deleted_at, m.edited_at, m.duration_ms, m.group_id, g.name AS group_name`;
const MESSAGE_FROM = `chat_messages m
  JOIN users sender ON sender.id = m.sender_id
  JOIN users recipient ON recipient.id = m.recipient_id
  LEFT JOIN chat_groups g ON g.id = m.group_id`;
const NOT_HIDDEN = 'NOT EXISTS (SELECT 1 FROM chat_hidden h WHERE h.message_id = m.id AND h.user_id = ?)';

function rowToMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    sender: row.sender,
    recipient: row.recipient,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    kind: row.kind === 'voice' || row.kind === 'invite' || row.kind === 'image' || row.kind === 'system' ? row.kind : 'text',
    durationMs: row.duration_ms,
    forwarded: !!row.forwarded,
    deleted: row.deleted_at !== null,
    edited: row.edited_at !== null && row.deleted_at === null,
    replyTo: null,
    reactions: [],
    groupId: row.group_id,
    groupName: row.group_name,
  };
}

/** Adds what each message quotes and its reactions. */
function withDetails(messages: StoredMessage[], rows: MessageRow[]): StoredMessage[] {
  if (messages.length === 0) return messages;
  const ids = messages.map((m) => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const reactions = db
    .prepare(
      `SELECT r.message_id, u.username, r.emoji FROM chat_reactions r JOIN users u ON u.id = r.user_id
       WHERE r.message_id IN (${placeholders}) ORDER BY r.created_at`,
    )
    .all(...ids) as { message_id: number; username: string; emoji: string }[];
  const quotedIds = [...new Set(rows.map((r) => r.reply_to).filter((id): id is number => id !== null))];
  const quoted = new Map<number, StoredMessage>();
  if (quotedIds.length) {
    const quotedRows = db
      .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE m.id IN (${quotedIds.map(() => '?').join(',')})`)
      .all(...quotedIds) as unknown as MessageRow[];
    for (const row of quotedRows) quoted.set(row.id, rowToMessage(row));
  }
  return messages.map((message, i) => {
    const q = rows[i].reply_to !== null ? quoted.get(rows[i].reply_to!) : undefined;
    return {
      ...message,
      reactions: reactions.filter((r) => r.message_id === message.id).map((r) => ({ from: r.username, emoji: r.emoji })),
      replyTo: q
        ? { id: q.id, from: q.sender, kind: q.kind, body: q.body.slice(0, 200), durationMs: q.durationMs, deleted: q.deleted }
        : null,
    };
  });
}

/** Marks what `otherId` sent to `userId` as read; returns the newest message id marked, or null if none. */
export function markThreadRead(userId: number, otherId: number): number | null {
  const row = db
    .prepare('SELECT MAX(id) AS id FROM chat_messages WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL')
    .get(userId, otherId) as { id: number | null };
  if (!row.id) return null;
  db.prepare('UPDATE chat_messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL AND id <= ?').run(
    Date.now(),
    userId,
    otherId,
    row.id,
  );
  return row.id;
}

export function unreadCount(userId: number, otherId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL')
    .get(userId, otherId) as { n: number };
  return row.n;
}

export function getMessage(id: number): StoredMessage | null {
  const row = db.prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE m.id = ?`).get(id) as MessageRow | undefined;
  return row ? withDetails([rowToMessage(row)], [row])[0] : null;
}

/** Whether a user still sees a message (it isn't hidden for them). */
export function isHidden(messageId: number, userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM chat_hidden WHERE message_id = ? AND user_id = ?').get(messageId, userId);
}

export function listThread(userId: number, otherId: number, limit = 80): StoredMessage[] {
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM}
       WHERE ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)) AND ${NOT_HIDDEN}
       ORDER BY m.id DESC
       LIMIT ?`,
    )
    .all(userId, otherId, otherId, userId, userId, limit) as unknown as MessageRow[];
  rows.reverse();
  return withDetails(rows.map(rowToMessage), rows);
}

export function lastThreadMessage(userId: number, otherId: number): StoredMessage | null {
  const row = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM}
       WHERE ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)) AND ${NOT_HIDDEN}
       ORDER BY m.id DESC
       LIMIT 1`,
    )
    .get(userId, otherId, otherId, userId, userId) as MessageRow | undefined;
  return row ? withDetails([rowToMessage(row)], [row])[0] : null;
}

/* ---------- Group conversations ---------- */

export interface GroupMemberRow {
  userId: number;
  username: string;
  admin: boolean;
  joinedAt: number;
}

export interface Group {
  id: number;
  name: string;
  createdBy: string;
  members: GroupMemberRow[];
}

function latestMessageId(): number {
  return (db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages').get() as { id: number }).id;
}

export function getGroup(groupId: number): Group | null {
  const row = db
    .prepare('SELECT g.id, g.name, COALESCE(u.username, \'\') AS created_by FROM chat_groups g LEFT JOIN users u ON u.id = g.created_by WHERE g.id = ?')
    .get(groupId) as { id: number; name: string; created_by: string } | undefined;
  if (!row) return null;
  const members = (
    db
      .prepare(
        `SELECT m.user_id, u.username, m.admin, m.joined_at FROM chat_group_members m JOIN users u ON u.id = m.user_id
         WHERE m.group_id = ? ORDER BY m.admin DESC, u.username COLLATE NOCASE`,
      )
      .all(groupId) as { user_id: number; username: string; admin: number; joined_at: number }[]
  ).map((m) => ({ userId: m.user_id, username: m.username, admin: !!m.admin, joinedAt: m.joined_at }));
  return { id: row.id, name: row.name, createdBy: row.created_by, members };
}

export function groupIdsOf(userId: number): number[] {
  return (db.prepare('SELECT group_id FROM chat_group_members WHERE user_id = ?').all(userId) as { group_id: number }[]).map((r) => r.group_id);
}

export function groupMembership(groupId: number, userId: number): { admin: boolean; historyFrom: number } | null {
  const row = db.prepare('SELECT admin, history_from FROM chat_group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as
    | { admin: number; history_from: number }
    | undefined;
  return row ? { admin: !!row.admin, historyFrom: row.history_from } : null;
}

/** Creates a group with its creator as administrator; returns its id. */
export function createGroup(name: string, creatorId: number, memberIds: number[]): number {
  return inTransaction(() => {
    const now = Date.now();
    const id = Number(db.prepare('INSERT INTO chat_groups (name, created_by, created_at) VALUES (?, ?, ?)').run(name, creatorId, now).lastInsertRowid);
    const history = latestMessageId();
    const insert = db.prepare('INSERT INTO chat_group_members (group_id, user_id, admin, joined_at, history_from, read_up_to) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run(id, creatorId, 1, now, history, history);
    for (const memberId of memberIds) if (memberId !== creatorId) insert.run(id, memberId, 0, now, history, history);
    return id;
  });
}

export function addGroupMembers(groupId: number, userIds: number[]) {
  const now = Date.now();
  const history = latestMessageId();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO chat_group_members (group_id, user_id, admin, joined_at, history_from, read_up_to) VALUES (?, ?, 0, ?, ?, ?)',
  );
  inTransaction(() => {
    for (const userId of userIds) insert.run(groupId, userId, now, history, history);
  });
}

/** Removes a member; when no administrator is left, the longest-standing member becomes one. */
export function removeGroupMember(groupId: number, userId: number) {
  inTransaction(() => {
    db.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    const hasAdmin = db.prepare('SELECT 1 FROM chat_group_members WHERE group_id = ? AND admin = 1').get(groupId);
    if (!hasAdmin) {
      db.prepare(
        `UPDATE chat_group_members SET admin = 1 WHERE group_id = ? AND user_id = (
           SELECT user_id FROM chat_group_members WHERE group_id = ? ORDER BY joined_at, user_id LIMIT 1)`,
      ).run(groupId, groupId);
    }
  });
}

export function setGroupAdmin(groupId: number, userId: number) {
  db.prepare('UPDATE chat_group_members SET admin = 1 WHERE group_id = ? AND user_id = ?').run(groupId, userId);
}

export function renameGroup(groupId: number, name: string) {
  db.prepare('UPDATE chat_groups SET name = ? WHERE id = ?').run(name, groupId);
}

const GROUP_VISIBLE = `m.group_id = ? AND m.id > ? AND ${NOT_HIDDEN}`;

/** What a member sees of a group: messages since they joined, minus those they hid. */
export function listGroupThread(groupId: number, userId: number, limit = 80): StoredMessage[] {
  const membership = groupMembership(groupId, userId);
  if (!membership) return [];
  const rows = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE ${GROUP_VISIBLE} ORDER BY m.id DESC LIMIT ?`)
    .all(groupId, membership.historyFrom, userId, limit) as unknown as MessageRow[];
  rows.reverse();
  return withDetails(rows.map(rowToMessage), rows);
}

export function lastGroupMessage(groupId: number, userId: number): StoredMessage | null {
  const membership = groupMembership(groupId, userId);
  if (!membership) return null;
  const row = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE ${GROUP_VISIBLE} ORDER BY m.id DESC LIMIT 1`)
    .get(groupId, membership.historyFrom, userId) as MessageRow | undefined;
  return row ? withDetails([rowToMessage(row)], [row])[0] : null;
}

export function groupUnreadCount(groupId: number, userId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages m JOIN chat_group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?
       WHERE m.group_id = ? AND m.id > gm.read_up_to AND m.id > gm.history_from AND m.sender_id <> ? AND m.kind <> 'system'`,
    )
    .get(userId, groupId, userId) as { n: number };
  return row.n;
}

/** Newest message id every member has read: a sender's message up to it is read by all. */
export function groupReadFloor(groupId: number): number {
  return (db.prepare('SELECT COALESCE(MIN(read_up_to), 0) AS n FROM chat_group_members WHERE group_id = ?').get(groupId) as { n: number }).n;
}

/** Marks the whole group read for a member; returns the read floor before and after. */
export function markGroupRead(groupId: number, userId: number): { before: number; after: number } {
  const before = groupReadFloor(groupId);
  const latest = (db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE group_id = ?').get(groupId) as { id: number }).id;
  db.prepare('UPDATE chat_group_members SET read_up_to = MAX(read_up_to, ?) WHERE group_id = ? AND user_id = ?').run(latest, groupId, userId);
  return { before, after: groupReadFloor(groupId) };
}

/* ---------- Administration ---------- */

export interface Admin {
  id: number;
  email: string;
  createdAt: number;
  lastLoginAt: number | null;
}

const ADMIN_COLUMNS = 'id, email, created_at AS createdAt, last_login_at AS lastLoginAt';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60_000;

export function createAdmin(email: string, passwordHash: string): Admin {
  const result = db.prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, passwordHash, Date.now());
  return getAdmin(Number(result.lastInsertRowid))!;
}

export function getAdmin(id: number): Admin | null {
  return (db.prepare(`SELECT ${ADMIN_COLUMNS} FROM admins WHERE id = ?`).get(id) as Admin | undefined) ?? null;
}

export function findAdminForLogin(email: string): (Admin & { passwordHash: string }) | null {
  const row = db.prepare(`SELECT ${ADMIN_COLUMNS}, password_hash AS passwordHash FROM admins WHERE email = ?`).get(email) as
    | (Admin & { passwordHash: string })
    | undefined;
  return row ?? null;
}

export function listAdmins(): Admin[] {
  return db.prepare(`SELECT ${ADMIN_COLUMNS} FROM admins ORDER BY id`).all() as unknown as Admin[];
}

export function countAdmins(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM admins').get() as { n: number }).n;
}

export function deleteAdmin(id: number): boolean {
  return db.prepare('DELETE FROM admins WHERE id = ?').run(id).changes > 0;
}

export function setAdminPassword(id: number, passwordHash: string) {
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(id);
}

export function createAdminSession(token: string, adminId: number) {
  db.prepare('DELETE FROM admin_sessions WHERE created_at <= ?').run(Date.now() - ADMIN_SESSION_TTL_MS);
  db.prepare('INSERT INTO admin_sessions (token, admin_id, created_at) VALUES (?, ?, ?)').run(tokenHash(token), adminId, Date.now());
  db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').run(Date.now(), adminId);
}

export function adminSessionId(token: string): number | null {
  const row = db
    .prepare('SELECT admin_id FROM admin_sessions WHERE token = ? AND created_at > ?')
    .get(tokenHash(token), Date.now() - ADMIN_SESSION_TTL_MS) as { admin_id: number } | undefined;
  return row?.admin_id ?? null;
}

export function deleteAdminSession(token: string) {
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(tokenHash(token));
}

export interface AdminLogLine {
  id: number;
  admin: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  createdAt: number;
}

export function logAdminAction(adminId: number, action: string, target: string | null, details?: Record<string, unknown>): number {
  const result = db
    .prepare('INSERT INTO admin_log (admin_id, action, target, details, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(adminId, action, target, details ? JSON.stringify(details) : null, Date.now());
  return Number(result.lastInsertRowid);
}

export function adminLog(options: { target?: string; limit?: number } = {}): AdminLogLine[] {
  const rows = db
    .prepare(
      `SELECT l.id, a.email AS admin, l.action, l.target, l.details, l.created_at AS createdAt
       FROM admin_log l LEFT JOIN admins a ON a.id = l.admin_id
       ${options.target ? 'WHERE l.target = ?' : ''}
       ORDER BY l.id DESC LIMIT ?`,
    )
    .all(...(options.target ? [options.target] : []), options.limit ?? 100) as unknown as (Omit<AdminLogLine, 'details'> & {
    details: string | null;
  })[];
  return rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}

export function getSetting<T>(key: string): T | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function saveSetting(key: string, value: unknown) {
  db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run(key, JSON.stringify(value), Date.now());
}

/** Credits or debits a player on an admin's decision; the ledger line points to the admin log entry. */
export function adjustCoins(userId: number, currency: Currency, delta: number, logId: number) {
  inTransaction(() => moveCoins(userId, currency, delta, 'admin', `log:${logId}`));
}

export interface PlayerSummary {
  id: number;
  username: string;
  fullName: string | null;
  createdAt: number;
  xp: number;
  wins: number;
  games: number;
  coins: number;
  premiumCoins: number;
  bannedAt: number | null;
  banReason: string | null;
}

const PLAYER_COLUMNS = `id, username, full_name AS fullName, created_at AS createdAt, xp, wins,
  COALESCE(json_extract(profile, '$.stats.games'), 0) AS games,
  COALESCE(json_extract(profile, '$.coins'), 0) AS coins,
  premium_coins AS premiumCoins, banned_at AS bannedAt, ban_reason AS banReason`;

export function searchPlayers(options: { query?: string; banned?: boolean; offset?: number; limit?: number }): {
  players: PlayerSummary[];
  total: number;
} {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.query) {
    where.push("(username LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\')");
    const pattern = `%${options.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(pattern, pattern);
  }
  if (options.banned) where.push('banned_at IS NOT NULL');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM users ${clause}`).get(...params) as { n: number }).n;
  const players = db
    .prepare(`SELECT ${PLAYER_COLUMNS} FROM users ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, options.limit ?? 50, options.offset ?? 0) as unknown as PlayerSummary[];
  return { players, total };
}

export function playerSummary(id: number): PlayerSummary | null {
  return (db.prepare(`SELECT ${PLAYER_COLUMNS} FROM users WHERE id = ?`).get(id) as PlayerSummary | undefined) ?? null;
}

export function playerExtra(id: number) {
  const one = (sql: string, ...params: number[]) => (db.prepare(sql).get(...params) as { n: number }).n;
  return {
    friends: one('SELECT COUNT(*) AS n FROM friendships WHERE user_a = ? OR user_b = ?', id, id),
    messages: one('SELECT COUNT(*) AS n FROM chat_messages WHERE sender_id = ?', id),
    sessions: one('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', id),
    reportsAgainst: one('SELECT COUNT(*) AS n FROM chat_reports r JOIN chat_messages m ON m.id = r.message_id WHERE m.sender_id = ?', id),
  };
}

export interface AdminLedgerLine extends LedgerLine {
  ref: string | null;
}

export function fullLedgerOf(userId: number, limit = 200): AdminLedgerLine[] {
  return db
    .prepare(
      'SELECT id, currency, delta, reason, ref, created_at AS createdAt FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(userId, limit) as unknown as AdminLedgerLine[];
}

/** Replaces a player's password and ends all their sessions. */
export function setUserPassword(userId: number, passwordHash: string) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Suspends an account (all its sessions end) or lifts the suspension with `reason` null. */
export function setBanned(userId: number, reason: string | null): boolean {
  if (reason === null) return db.prepare('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?').run(userId).changes > 0;
  const done = db.prepare('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?').run(Date.now(), reason, userId).changes > 0;
  if (done) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return done;
}

export function isBanned(userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE id = ? AND banned_at IS NOT NULL').get(userId);
}

export interface PotSummary {
  id: string;
  tableId: string;
  currency: Currency;
  stake: number;
  players: { id: number; username: string | null }[];
  status: 'open' | 'settled' | 'refunded';
  winner: string | null;
  /** True for a pot nobody won (the only device quit the game). */
  forfeited: boolean;
  fee: number;
  createdAt: number;
  closedAt: number | null;
}

export function listPots(options: { status?: string; currency?: string; userId?: number; offset?: number; limit?: number }): {
  pots: PotSummary[];
  total: number;
} {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.status === 'forfeited') where.push("p.status = 'settled' AND p.winner_id IS NULL");
  else if (options.status) {
    where.push('p.status = ?');
    params.push(options.status);
  }
  if (options.currency) {
    where.push('p.currency = ?');
    params.push(options.currency);
  }
  if (options.userId) {
    where.push('EXISTS (SELECT 1 FROM json_each(p.players) j WHERE j.value = ?)');
    params.push(options.userId);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM stake_pots p ${clause}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT p.*, w.username AS winner,
         (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger c WHERE c.user_id IS NULL AND c.reason = 'commission' AND c.ref = p.id) AS fee
       FROM stake_pots p LEFT JOIN users w ON w.id = p.winner_id ${clause}
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, options.limit ?? 50, options.offset ?? 0) as {
    id: string;
    table_id: string;
    currency: Currency;
    stake: number;
    players: string;
    status: PotSummary['status'];
    winner_id: number | null;
    winner: string | null;
    fee: number;
    created_at: number;
    closed_at: number | null;
  }[];
  const ids = [...new Set(rows.flatMap((r) => JSON.parse(r.players) as number[]))];
  const names = new Map<number, string>();
  if (ids.length) {
    const found = db.prepare(`SELECT id, username FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as {
      id: number;
      username: string;
    }[];
    for (const u of found) names.set(u.id, u.username);
  }
  const pots = rows.map((r) => ({
    id: r.id,
    tableId: r.table_id,
    currency: r.currency,
    stake: r.stake,
    players: (JSON.parse(r.players) as number[]).map((id) => ({ id, username: names.get(id) ?? null })),
    status: r.status,
    winner: r.winner,
    forfeited: r.status === 'settled' && r.winner_id === null,
    fee: r.fee,
    createdAt: r.created_at,
    closedAt: r.closed_at,
  }));
  return { pots, total };
}

export function platformStats() {
  const one = (sql: string, ...params: number[]) => (db.prepare(sql).get(...params) as { n: number | null }).n ?? 0;
  const now = Date.now();
  const day = 24 * 60 * 60_000;
  const potRows = db.prepare('SELECT status, currency, COUNT(*) AS n, SUM(stake * json_array_length(players)) AS volume FROM stake_pots GROUP BY status, currency').all() as {
    status: string;
    currency: Currency;
    n: number;
    volume: number;
  }[];
  const forfeited = one("SELECT COUNT(*) AS n FROM stake_pots WHERE status = 'settled' AND winner_id IS NULL");
  const sum = (filter: (r: (typeof potRows)[number]) => boolean, key: 'n' | 'volume') =>
    potRows.filter(filter).reduce((total, r) => total + r[key], 0);
  return {
    players: {
      total: one('SELECT COUNT(*) AS n FROM users'),
      today: one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - day),
      week: one('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * day),
      banned: one('SELECT COUNT(*) AS n FROM users WHERE banned_at IS NOT NULL'),
    },
    games: {
      /** Games finished by signed-in players, counted once per player. */
      playerGames: one("SELECT SUM(COALESCE(json_extract(profile, '$.stats.games'), 0)) AS n FROM users"),
      staked: sum(() => true, 'n'),
      open: sum((r) => r.status === 'open', 'n'),
      settled: sum((r) => r.status === 'settled', 'n') - forfeited,
      refunded: sum((r) => r.status === 'refunded', 'n'),
      forfeited,
    },
    volume: {
      free: sum((r) => r.currency === 'free' && r.status !== 'refunded', 'volume'),
      premium: sum((r) => r.currency === 'premium' && r.status !== 'refunded', 'volume'),
    },
    commissions: platformRevenue(),
    commissionsToday: {
      free: one("SELECT SUM(delta) AS n FROM coin_ledger WHERE user_id IS NULL AND reason = 'commission' AND currency = 'free' AND created_at > ?", now - day),
      premium: one(
        "SELECT SUM(delta) AS n FROM coin_ledger WHERE user_id IS NULL AND reason = 'commission' AND currency = 'premium' AND created_at > ?",
        now - day,
      ),
    },
    messages: {
      total: one('SELECT COUNT(*) AS n FROM chat_messages'),
      today: one('SELECT COUNT(*) AS n FROM chat_messages WHERE created_at > ?', now - day),
    },
    openReports: one('SELECT COUNT(DISTINCT message_id) AS n FROM chat_reports WHERE resolved_at IS NULL'),
    pendingWithdrawals: pendingWithdrawalCount(),
  };
}

/** Commission earned per day over the last `days` days, oldest first. */
export function commissionsByDay(days = 14): { day: string; free: number; premium: number }[] {
  const since = Date.now() - days * 24 * 60 * 60_000;
  const rows = db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day, currency, SUM(delta) AS total FROM coin_ledger
       WHERE user_id IS NULL AND reason = 'commission' AND created_at > ? GROUP BY day, currency`,
    )
    .all(since) as { day: string; currency: Currency; total: number }[];
  const result: { day: string; free: number; premium: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60_000).toISOString().slice(0, 10);
    result.push({
      day,
      free: rows.find((r) => r.day === day && r.currency === 'free')?.total ?? 0,
      premium: rows.find((r) => r.day === day && r.currency === 'premium')?.total ?? 0,
    });
  }
  return result;
}

export type ReportResult = 'created' | 'duplicate';

export function reportMessage(messageId: number, reporterId: number, reason: string): ReportResult {
  const done = db
    .prepare('INSERT OR IGNORE INTO chat_reports (message_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)')
    .run(messageId, reporterId, reason, Date.now());
  return done.changes > 0 ? 'created' : 'duplicate';
}

export interface ReportSummary {
  messageId: number;
  message: StoredMessage;
  reports: { reporter: string; reason: string; createdAt: number }[];
  resolvedAt: number | null;
  resolution: string | null;
}

export function listReports(options: { resolved: boolean; limit?: number }): ReportSummary[] {
  const ids = db
    .prepare(
      `SELECT message_id, MAX(id) AS last FROM chat_reports WHERE resolved_at IS ${options.resolved ? 'NOT ' : ''}NULL
       GROUP BY message_id ORDER BY last DESC LIMIT ?`,
    )
    .all(options.limit ?? 100) as { message_id: number }[];
  return ids.flatMap(({ message_id }) => {
    const report = reportOf(message_id);
    return report ? [report] : [];
  });
}

export function reportOf(messageId: number): ReportSummary | null {
  const message = getMessage(messageId);
  if (!message) return null;
  const rows = db
    .prepare(
      `SELECT u.username AS reporter, r.reason, r.created_at AS createdAt, r.resolved_at AS resolvedAt, r.resolution
       FROM chat_reports r JOIN users u ON u.id = r.reporter_id WHERE r.message_id = ? ORDER BY r.id`,
    )
    .all(messageId) as { reporter: string; reason: string; createdAt: number; resolvedAt: number | null; resolution: string | null }[];
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return {
    messageId,
    message,
    reports: rows.map(({ reporter, reason, createdAt }) => ({ reporter, reason, createdAt })),
    resolvedAt: last.resolvedAt,
    resolution: last.resolution,
  };
}

export function resolveReports(messageId: number, resolution: string): boolean {
  return (
    db.prepare('UPDATE chat_reports SET resolved_at = ?, resolution = ? WHERE message_id = ? AND resolved_at IS NULL').run(Date.now(), resolution, messageId)
      .changes > 0
  );
}

/** Messages around `messageId` in its conversation, for a moderator to judge it in context. */
export function messageContext(messageId: number, around = 15): StoredMessage[] {
  const message = getMessage(messageId);
  if (!message) return [];
  const [where, args] =
    message.groupId !== null
      ? ['m.group_id = ?', [message.groupId]]
      : [
          '((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)) AND m.group_id IS NULL',
          [message.senderId, message.recipientId, message.recipientId, message.senderId],
        ];
  const before = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE ${where} AND m.id <= ? ORDER BY m.id DESC LIMIT ?`)
    .all(...args, messageId, around + 1) as unknown as MessageRow[];
  const after = db
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM} WHERE ${where} AND m.id > ? ORDER BY m.id LIMIT ?`)
    .all(...args, messageId, around) as unknown as MessageRow[];
  const rows = [...before.reverse(), ...after];
  return withDetails(rows.map(rowToMessage), rows);
}
