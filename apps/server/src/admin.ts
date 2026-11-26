import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { GAME_NAMES, MAX_WINNER_SHARE, chatPreviewText, MIN_WINNER_SHARE, isGameId, setStakeConfig, stakeConfig, validateStakeConfig, type GameId, type StakeConfig } from '@ludo/engine';
import { gameAvailability, setGameEnabled } from './games';
import { HttpError, bearer, ip, limit, moderateMessage, registerRoutes, type Handler } from './api';
import * as db from './db';
import { EMAIL_RE, checkNewAdminPassword, checkNewPlayerPassword, dummyHash, hashPassword, verifyPassword } from './passwords';
import {
  PAYMENT_AMOUNT_BOUNDS,
  PAYMENT_PROVIDERS,
  isPaymentProvider,
  paymentSettings,
  setPaymentSettings,
  validateProviderSettings,
  waveConfigured,
  type PaymentProvider,
} from './payments';
import { RateLimiter, cleanText } from './security';

const MAX_PASSWORD = 128;
const MAX_ADJUSTMENT = 10_000_000;
const PAGE_SIZE = 50;
const STAKES_SETTING = 'stakes';

/** A live room as the admin panel sees it. */
export interface AdminRoom {
  code: string;
  game: GameId;
  kind: 'private' | 'quick' | 'shared';
  status: 'lobby' | 'playing' | 'over';
  players: { name: string; color: string; bot: boolean; userId: number | null; connected: boolean }[];
  spectators: number;
  stake: { currency: string; stake: number; pot: number; potId: string } | null;
  lastActivity: number;
}

/** What the admin routes need from the live server. */
export interface AdminRuntime {
  online(): { players: number; connections: number; searching: number };
  rooms(): AdminRoom[];
  /** Closes a room, refunding its pot; false if it doesn't exist. */
  closeRoom(code: string, reason: string): boolean;
  /** Ends every connection of a player (chat and games). */
  disconnectPlayer(userId: number, reason: string): void;
  isOnline(userId: number): boolean;
  /** Tells a player their balance changed by an admin. */
  notifyAdjustment(userId: number, currency: db.Currency, delta: number, note: string): void;
  /** Tells a player their withdrawal was paid on Wave, or refused and refunded. */
  notifyWithdrawal(userId: number, amount: number, paid: boolean, note: string): void;
  /** Games in progress and players searching, per game. */
  liveByGame(): Record<GameId, { playing: number; searching: number }>;
  /** A game was switched off: stops the searches for it (games in progress finish normally). */
  gameDisabled(game: GameId): void;
  premiumDisabled(): void;
}

const loginLimiter = new RateLimiter(8, 15 * 60_000);

function requireAdmin(req: IncomingMessage): db.Admin {
  const token = bearer(req);
  const id = token ? db.adminSessionId(token) : null;
  const admin = id ? db.getAdmin(id) : null;
  if (!admin) throw new HttpError(401, 'Session admin expirée. Reconnecte-toi.');
  return admin;
}

function query(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://localhost').searchParams;
}

function page(req: IncomingMessage) {
  const n = Number(query(req).get('page') ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function intField(value: unknown, name: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${name} invalide.`);
  return n;
}

function requiredReason(value: unknown): string {
  const reason = cleanText(value, 200);
  if (reason.length < 3) throw new HttpError(400, 'Indique un motif (3 caractères au moins).');
  return reason;
}

function existingPlayer(rawId: unknown): db.PlayerSummary {
  const player = db.playerSummary(intField(rawId, 'Joueur'));
  if (!player) throw new HttpError(404, 'Joueur introuvable.');
  return player;
}

function pendingWithdrawal(rawReference: unknown): db.Payment {
  const payment = typeof rawReference === 'string' ? db.getPayment(rawReference) : null;
  if (!payment || payment.kind !== 'withdrawal') throw new HttpError(404, 'Retrait introuvable.');
  if (payment.status !== 'pending') throw new HttpError(409, 'Ce retrait a déjà été traité.');
  return payment;
}

const PROVIDER_CONFIGURED: Record<PaymentProvider, () => boolean> = { wave: waveConfigured };

function paymentSettingsView() {
  return {
    bounds: PAYMENT_AMOUNT_BOUNDS,
    providers: (Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]).map((id) => ({
      id,
      name: PAYMENT_PROVIDERS[id],
      configured: PROVIDER_CONFIGURED[id](),
      settings: paymentSettings(id),
    })),
  };
}

function adminCredentials(body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'Email invalide.');
  if (!password || password.length > MAX_PASSWORD) throw new HttpError(400, 'Mot de passe invalide.');
  return { email, password };
}

/** Loads the stake tables saved by the admins, if any. */
export function loadStakeSettings() {
  const saved = db.getSetting<StakeConfig>(STAKES_SETTING);
  if (!saved) return;
  const share = Math.min(MAX_WINNER_SHARE, Math.max(MIN_WINNER_SHARE, Number(saved.winnerShare) || MIN_WINNER_SHARE));
  const valid = validateStakeConfig({ ...saved, winnerShare: share });
  if (typeof valid === 'string') console.error('Réglages de mise ignorés :', valid);
  else setStakeConfig(valid);
}

export function registerAdminRoutes(runtime: AdminRuntime) {
  const routes: Record<string, Handler> = {
    'POST /api/admin/login': async (req, body) => {
      limit(loginLimiter, ip(req));
      const { email, password } = adminCredentials(body);
      const admin = db.findAdminForLogin(email);
      const valid = await verifyPassword(password, admin?.passwordHash ?? (await dummyHash));
      if (!admin || !valid) throw new HttpError(401, 'Email ou mot de passe incorrect.');
      const token = randomBytes(32).toString('base64url');
      db.createAdminSession(token, admin.id);
      return { token, admin: db.getAdmin(admin.id) };
    },

    'POST /api/admin/logout': (req) => {
      const token = bearer(req);
      if (token) db.deleteAdminSession(token);
      return { ok: true };
    },

    'GET /api/admin/me': (req) => ({ admin: requireAdmin(req) }),

    'GET /api/admin/stats': (req) => {
      requireAdmin(req);
      const rooms = runtime.rooms();
      return {
        ...db.platformStats(),
        live: {
          ...runtime.online(),
          rooms: rooms.length,
          playing: rooms.filter((r) => r.status === 'playing').length,
          stakedPlaying: rooms.filter((r) => r.status === 'playing' && r.stake).length,
        },
        commissionsByDay: db.commissionsByDay(14),
      };
    },

    'GET /api/admin/players': (req) => {
      requireAdmin(req);
      const q = query(req);
      const result = db.searchPlayers({
        query: cleanText(q.get('q'), 30),
        banned: q.get('banned') === '1',
        offset: page(req) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      return {
        ...result,
        pageSize: PAGE_SIZE,
        players: result.players.map((p) => ({ ...p, online: runtime.isOnline(p.id) })),
      };
    },

    'GET /api/admin/player': (req) => {
      requireAdmin(req);
      const player = existingPlayer(query(req).get('id'));
      const user = db.getUser(player.id)!;
      return {
        player: { ...player, online: runtime.isOnline(player.id) },
        profile: user.profile,
        extra: db.playerExtra(player.id),
        ledger: db.fullLedgerOf(player.id, 200),
        wavePhone: db.wavePhoneOf(player.id),
        adult: db.adultConfirmation(player.id),
        payments: db.paymentsOf(player.id, 30),
        pots: db.listPots({ userId: player.id, limit: 30 }).pots,
        log: db.adminLog({ target: `user:${player.id}`, limit: 50 }),
      };
    },

    'POST /api/admin/coins': (req, body) => {
      const admin = requireAdmin(req);
      const player = existingPlayer(body.userId);
      const currency = body.currency;
      if (currency !== 'free' && currency !== 'premium') throw new HttpError(400, 'Monnaie invalide.');
      const delta = intField(body.delta, 'Montant');
      if (delta === 0 || Math.abs(delta) > MAX_ADJUSTMENT) {
        throw new HttpError(400, `Montant : entre 1 et ${MAX_ADJUSTMENT.toLocaleString('fr-FR')} (négatif pour retirer).`);
      }
      const reason = requiredReason(body.reason);
      const balance = currency === 'free' ? player.coins : player.premiumCoins;
      if (balance + delta < 0) throw new HttpError(400, `Solde insuffisant : le joueur a ${balance} pièces ${currency === 'free' ? 'Free' : 'Premium'}.`);
      const logId = db.logAdminAction(admin.id, delta > 0 ? 'coins.credit' : 'coins.debit', `user:${player.id}`, {
        username: player.username,
        currency,
        delta,
        reason,
      });
      db.adjustCoins(player.id, currency, delta, logId);
      runtime.notifyAdjustment(player.id, currency, delta, reason);
      return { wallet: db.getWallet(player.id) };
    },

    'POST /api/admin/ban': (req, body) => {
      const admin = requireAdmin(req);
      const player = existingPlayer(body.userId);
      const reason = requiredReason(body.reason);
      db.setBanned(player.id, reason);
      db.logAdminAction(admin.id, 'player.ban', `user:${player.id}`, { username: player.username, reason });
      runtime.disconnectPlayer(player.id, 'Ton compte a été suspendu.');
      return { ok: true };
    },

    'POST /api/admin/players/password': async (req, body) => {
      const admin = requireAdmin(req);
      const player = existingPlayer(body.userId);
      const password = typeof body.password === 'string' ? body.password : '';
      const invalid = checkNewPlayerPassword(password);
      if (invalid) throw new HttpError(400, invalid);
      const reason = requiredReason(body.reason);
      db.setUserPassword(player.id, await hashPassword(password));
      db.logAdminAction(admin.id, 'player.password', `user:${player.id}`, { username: player.username, reason });
      runtime.disconnectPlayer(player.id, 'Ton mot de passe a été changé. Reconnecte-toi.');
      return { ok: true };
    },

    'POST /api/admin/unban': (req, body) => {
      const admin = requireAdmin(req);
      const player = existingPlayer(body.userId);
      db.setBanned(player.id, null);
      db.logAdminAction(admin.id, 'player.unban', `user:${player.id}`, { username: player.username });
      return { ok: true };
    },

    'GET /api/admin/rooms': (req) => {
      requireAdmin(req);
      return { rooms: runtime.rooms() };
    },

    'POST /api/admin/rooms/close': (req, body) => {
      const admin = requireAdmin(req);
      const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
      const reason = requiredReason(body.reason);
      const room = runtime.rooms().find((r) => r.code === code);
      if (!room || !runtime.closeRoom(code, reason)) throw new HttpError(404, 'Salon introuvable (déjà fermé ?).');
      db.logAdminAction(admin.id, 'room.close', `room:${code}`, {
        reason,
        players: room.players.map((p) => p.name),
        refunded: room.stake ? { potId: room.stake.potId, currency: room.stake.currency, pot: room.stake.pot } : null,
      });
      return { ok: true };
    },

    'GET /api/admin/pots': (req) => {
      requireAdmin(req);
      const q = query(req);
      const status = q.get('status') ?? '';
      const currency = q.get('currency') ?? '';
      const result = db.listPots({
        status: ['open', 'settled', 'refunded', 'forfeited'].includes(status) ? status : undefined,
        currency: ['free', 'premium'].includes(currency) ? currency : undefined,
        offset: page(req) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      return { ...result, pageSize: PAGE_SIZE };
    },

    'GET /api/admin/pots/suspicious': (req) => {
      requireAdmin(req);
      return { pairs: db.suspiciousPairs() };
    },

    'GET /api/admin/pots/archive': (req) => {
      requireAdmin(req);
      const id = query(req).get('id') ?? '';
      if (!id || id.length > 64) throw new HttpError(400, 'Cagnotte invalide.');
      return { games: db.archivedGamesOfPot(id) };
    },

    'GET /api/admin/payments': (req) => {
      requireAdmin(req);
      const q = query(req);
      const kind = q.get('kind');
      const status = q.get('status');
      const result = db.listPayments({
        kind: kind === 'deposit' || kind === 'withdrawal' ? kind : undefined,
        status: status === 'pending' || status === 'succeeded' || status === 'failed' ? status : undefined,
        offset: page(req) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      return { ...result, pageSize: PAGE_SIZE };
    },

    /** The money was sent by hand from the Wave business account: records Wave's transaction id. */
    'POST /api/admin/payments/pay': (req, body) => {
      const admin = requireAdmin(req);
      const withdrawal = pendingWithdrawal(body.reference);
      const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
      if (!/^[\w.:-]{4,64}$/.test(transactionId)) throw new HttpError(400, 'Indique l’identifiant de la transaction Wave (lettres et chiffres).');
      if (!db.settleWithdrawal(withdrawal.reference, { paid: true, providerRef: transactionId }, admin.id)) {
        throw new HttpError(409, 'Ce retrait a déjà été traité.');
      }
      db.logAdminAction(admin.id, 'withdrawal.paid', `user:${withdrawal.userId}`, {
        reference: withdrawal.reference,
        amount: withdrawal.amount,
        phone: withdrawal.phone,
        transactionId,
      });
      runtime.notifyWithdrawal(withdrawal.userId, withdrawal.amount, true, '');
      return { ok: true };
    },

    'POST /api/admin/payments/refuse': (req, body) => {
      const admin = requireAdmin(req);
      const withdrawal = pendingWithdrawal(body.reference);
      const reason = requiredReason(body.reason);
      if (!db.settleWithdrawal(withdrawal.reference, { paid: false, note: reason }, admin.id)) {
        throw new HttpError(409, 'Ce retrait a déjà été traité.');
      }
      db.logAdminAction(admin.id, 'withdrawal.refused', `user:${withdrawal.userId}`, {
        reference: withdrawal.reference,
        amount: withdrawal.amount,
        phone: withdrawal.phone,
        reason,
      });
      runtime.notifyWithdrawal(withdrawal.userId, withdrawal.amount, false, reason);
      return { ok: true };
    },

    /** Unties the player's Wave number, so they can give a new one at their next deposit or withdrawal. */
    'POST /api/admin/payments/phone/reset': (req, body) => {
      const admin = requireAdmin(req);
      const player = existingPlayer(body.userId);
      const reason = requiredReason(body.reason);
      const phone = db.wavePhoneOf(player.id);
      if (!phone) throw new HttpError(400, 'Aucun numéro Wave n’est lié à ce compte.');
      db.clearWavePhone(player.id);
      db.logAdminAction(admin.id, 'wave_phone.reset', `user:${player.id}`, { username: player.username, phone, reason });
      return { ok: true };
    },

    'GET /api/admin/payments/settings': (req) => {
      requireAdmin(req);
      return paymentSettingsView();
    },

    'POST /api/admin/payments/settings': (req, body) => {
      const admin = requireAdmin(req);
      if (!isPaymentProvider(body.provider)) throw new HttpError(400, 'Méthode de paiement inconnue.');
      const next = validateProviderSettings(body.settings);
      if (typeof next === 'string') throw new HttpError(400, next);
      const before = paymentSettings(body.provider);
      setPaymentSettings(body.provider, next);
      db.logAdminAction(admin.id, 'settings.payments', `provider:${body.provider}`, {
        provider: PAYMENT_PROVIDERS[body.provider],
        before,
        after: next,
      });
      return paymentSettingsView();
    },

    'GET /api/admin/reports': (req) => {
      requireAdmin(req);
      return { reports: db.listReports({ resolved: query(req).get('resolved') === '1' }) };
    },

    'GET /api/admin/report': (req) => {
      requireAdmin(req);
      const id = intField(query(req).get('id'), 'Message');
      const report = db.reportOf(id);
      if (!report) throw new HttpError(404, 'Signalement introuvable.');
      const context = db.messageContext(id).map((m) => {
        const edits = db.messageEdits(m.id);
        return edits.length ? { ...m, edits } : m;
      });
      return { report, context };
    },

    /** A photo shown around a report: only within that report's context, never any private photo. */
    'GET /api/admin/report/image': (req) => {
      requireAdmin(req);
      const id = intField(query(req).get('report'), 'Signalement');
      const messageId = intField(query(req).get('id'), 'Message');
      if (!db.reportOf(id)) throw new HttpError(404, 'Signalement introuvable.');
      const message = db.messageContext(id).find((m) => m.id === messageId);
      const media = message?.kind === 'image' && !message.deleted ? db.getMedia(message.id) : null;
      if (!media) throw new HttpError(404, 'Photo introuvable.');
      return { src: `data:${media.mime};base64,${Buffer.from(media.data).toString('base64')}` };
    },

    'POST /api/admin/reports/resolve': (req, body) => {
      const admin = requireAdmin(req);
      const id = intField(body.messageId, 'Message');
      const report = db.reportOf(id);
      if (!report) throw new HttpError(404, 'Signalement introuvable.');
      const action = body.action;
      if (action !== 'dismiss' && action !== 'delete') throw new HttpError(400, 'Action inconnue.');
      if (action === 'delete') moderateMessage(id);
      db.resolveReports(id, action === 'delete' ? 'Message supprimé' : 'Classé sans suite');
      db.logAdminAction(admin.id, action === 'delete' ? 'report.delete' : 'report.dismiss', `user:${report.message.senderId}`, {
        messageId: id,
        sender: report.message.sender,
        body: chatPreviewText(report.message).slice(0, 200),
      });
      return { ok: true };
    },

    'GET /api/admin/settings': (req) => {
      requireAdmin(req);
      return stakeConfig();
    },

    'POST /api/admin/settings': (req, body) => {
      const admin = requireAdmin(req);
      const before = stakeConfig();
      const next = validateStakeConfig({
        ...body,
        premiumEnabled: typeof body.premiumEnabled === 'boolean' ? body.premiumEnabled : before.premiumEnabled,
        premiumWalletCap: body.premiumWalletCap ?? before.premiumWalletCap,
      });
      if (typeof next === 'string') throw new HttpError(400, next);
      db.saveSetting(STAKES_SETTING, next);
      setStakeConfig(next);
      if (before.premiumEnabled && !next.premiumEnabled) runtime.premiumDisabled();
      db.logAdminAction(admin.id, 'settings.stakes', 'settings', {
        winnerShare: [before.winnerShare, next.winnerShare],
        tables: [before.tables.map((t) => t.id), next.tables.map((t) => t.id)],
        premiumEnabled: [before.premiumEnabled, next.premiumEnabled],
        premiumWalletCap: [before.premiumWalletCap, next.premiumWalletCap],
      });
      return next;
    },

    'GET /api/games': () => gameAvailability(),

    'GET /api/admin/games': (req) => {
      requireAdmin(req);
      return { games: gameAvailability(), live: runtime.liveByGame() };
    },

    'POST /api/admin/games': (req, body) => {
      const admin = requireAdmin(req);
      if (!isGameId(body.game)) throw new HttpError(400, 'Jeu inconnu.');
      if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'État invalide.');
      if (gameAvailability()[body.game] === body.enabled) return { games: gameAvailability() };
      setGameEnabled(body.game, body.enabled);
      if (!body.enabled) runtime.gameDisabled(body.game);
      db.logAdminAction(admin.id, body.enabled ? 'game.enable' : 'game.disable', `game:${body.game}`, { game: GAME_NAMES[body.game] });
      return { games: gameAvailability() };
    },

    'GET /api/admin/log': (req) => {
      requireAdmin(req);
      return { log: db.adminLog({ limit: 200 }) };
    },

    'GET /api/admin/admins': (req) => {
      requireAdmin(req);
      return { admins: db.listAdmins() };
    },

    'POST /api/admin/admins': async (req, body) => {
      const admin = requireAdmin(req);
      const { email, password } = adminCredentials(body);
      const weak = checkNewAdminPassword(password);
      if (weak) throw new HttpError(400, weak);
      if (db.findAdminForLogin(email)) throw new HttpError(409, 'Un admin utilise déjà cet email.');
      const created = db.createAdmin(email, await hashPassword(password));
      db.logAdminAction(admin.id, 'admin.create', `admin:${created.id}`, { email });
      return { admin: created };
    },

    'POST /api/admin/admins/delete': (req, body) => {
      const admin = requireAdmin(req);
      const id = intField(body.id, 'Admin');
      if (id === admin.id) throw new HttpError(400, 'Tu ne peux pas supprimer ton propre compte.');
      const target = db.getAdmin(id);
      if (!target || !db.deleteAdmin(id)) throw new HttpError(404, 'Admin introuvable.');
      db.logAdminAction(admin.id, 'admin.delete', `admin:${id}`, { email: target.email });
      return { ok: true };
    },

    'POST /api/admin/password': async (req, body) => {
      const admin = requireAdmin(req);
      const current = typeof body.current === 'string' ? body.current : '';
      const next = typeof body.next === 'string' ? body.next : '';
      const stored = db.findAdminForLogin(admin.email)!;
      if (!(await verifyPassword(current, stored.passwordHash))) throw new HttpError(401, 'Mot de passe actuel incorrect.');
      const weak = checkNewAdminPassword(next);
      if (weak) throw new HttpError(400, weak);
      db.setAdminPassword(admin.id, await hashPassword(next));
      db.logAdminAction(admin.id, 'admin.password', `admin:${admin.id}`);
      const token = randomBytes(32).toString('base64url');
      db.createAdminSession(token, admin.id);
      return { token };
    },
  };
  registerRoutes(routes);
}
