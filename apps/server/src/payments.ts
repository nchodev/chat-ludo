import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ADULT_REQUIRED, PREMIUM_CLOSED, stakeConfig } from '@ludo/engine';
import * as db from './db';

/**
 * Deposits go through Wave Checkout: a pending deposit is recorded first, and Premium coins are
 * only credited once Wave confirms the payment, on the signed webhook or when the session is read
 * back from Wave's API. Withdrawals are paid by hand from the Wave business account, then
 * confirmed (or refused and refunded) in the admin panel.
 *
 * WAVE_API_KEY             Checkout API key (server only).
 * WAVE_SIGNING_SECRET      Request signing secret of that key, when signing is enabled on it.
 * WAVE_WEBHOOK_SECRET      Webhook secret, with the "Signing secret" strategy.
 * WEB_URL                  Public https address of the website, where Wave sends the player back.
 */
const WAVE_API = 'https://api.wave.com';
const WAVE_TIMEOUT_MS = 15_000;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** Wave checkout sessions expire after 30 minutes; a deposit still pending later is read back from Wave. */
const DEPOSIT_STALE_MS = 35 * 60_000;
const MAX_PENDING_DEPOSITS = 3;

export const PAYMENT_PROVIDERS = { wave: 'Wave' } as const;
export type PaymentProvider = keyof typeof PAYMENT_PROVIDERS;

/** Set by the admins for each payment method. 1 Premium coin = 1 F CFA; the platform pays the fees. */
export interface ProviderSettings {
  depositsOpen: boolean;
  withdrawalsOpen: boolean;
  deposit: { min: number; max: number };
  withdrawal: { min: number; perDay: number };
}

/** Any amount set by the admins stays within these bounds (F CFA). */
export const PAYMENT_AMOUNT_BOUNDS = { min: 100, max: 2_000_000 } as const;

const PAYMENT_SETTINGS = 'payment_providers';

const DEFAULT_PROVIDER_SETTINGS: Record<PaymentProvider, ProviderSettings> = {
  wave: {
    depositsOpen: true,
    withdrawalsOpen: true,
    deposit: { min: 300, max: 500_000 },
    withdrawal: { min: 1_000, perDay: 200_000 },
  },
};

let providerSettings: Record<PaymentProvider, ProviderSettings> = structuredClone(DEFAULT_PROVIDER_SETTINGS);

export const isPaymentProvider = (value: unknown): value is PaymentProvider =>
  typeof value === 'string' && Object.hasOwn(PAYMENT_PROVIDERS, value);

/** Checks settings sent by an admin; returns the clean settings or a French error message. */
export function validateProviderSettings(raw: unknown): ProviderSettings | string {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const part = (key: string) => (input[key] && typeof input[key] === 'object' ? input[key] : {}) as Record<string, unknown>;
  const { min: lowest, max: highest } = PAYMENT_AMOUNT_BOUNDS;
  const amount = (value: unknown, label: string): number | string => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(n) || n < lowest || n > highest) {
      return `${label} : un nombre entier entre ${lowest.toLocaleString('fr-FR')} et ${highest.toLocaleString('fr-FR')} F.`;
    }
    return n;
  };
  if (typeof input.depositsOpen !== 'boolean' || typeof input.withdrawalsOpen !== 'boolean') return 'Ouverture des dépôts et retraits invalide.';
  const depositMin = amount(part('deposit').min, 'Dépôt minimum');
  const depositMax = amount(part('deposit').max, 'Dépôt maximum');
  const withdrawalMin = amount(part('withdrawal').min, 'Retrait minimum');
  const perDay = amount(part('withdrawal').perDay, 'Retraits par 24 h');
  for (const value of [depositMin, depositMax, withdrawalMin, perDay]) if (typeof value === 'string') return value;
  if ((depositMin as number) > (depositMax as number)) return 'Le dépôt minimum dépasse le dépôt maximum.';
  if ((withdrawalMin as number) > (perDay as number)) return 'Le retrait minimum dépasse le plafond par 24 h.';
  return {
    depositsOpen: input.depositsOpen,
    withdrawalsOpen: input.withdrawalsOpen,
    deposit: { min: depositMin as number, max: depositMax as number },
    withdrawal: { min: withdrawalMin as number, perDay: perDay as number },
  };
}

/** Loads the payment settings saved by the admins; a provider never configured keeps its defaults. */
export function loadPaymentSettings() {
  const saved = db.getSetting<Record<string, unknown>>(PAYMENT_SETTINGS) ?? {};
  for (const provider of Object.keys(PAYMENT_PROVIDERS) as PaymentProvider[]) {
    if (!saved[provider]) continue;
    const valid = validateProviderSettings(saved[provider]);
    if (typeof valid === 'string') console.error(`Réglages de paiement ${provider} ignorés :`, valid);
    else providerSettings[provider] = valid;
  }
}

export function paymentSettings(provider: PaymentProvider): ProviderSettings {
  return structuredClone(providerSettings[provider]);
}

export function setPaymentSettings(provider: PaymentProvider, settings: ProviderSettings) {
  providerSettings = { ...providerSettings, [provider]: structuredClone(settings) };
  db.saveSetting(PAYMENT_SETTINGS, providerSettings);
}

export class PaymentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const webUrl = () => process.env.WEB_URL?.replace(/\/+$/, '') ?? '';

/** Wave keys are set: pending deposits can still be settled even while new ones are closed. */
export function waveConfigured(): boolean {
  return !!process.env.WAVE_API_KEY && !!process.env.WAVE_WEBHOOK_SECRET && webUrl().startsWith('https://');
}

/** Premium coins can't be bought while the Premium mode is off; withdrawals stay open. */
export function depositsEnabled(): boolean {
  return waveConfigured() && providerSettings.wave.depositsOpen && stakeConfig().premiumEnabled;
}

const hmacHex = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

async function waveRequest<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.WAVE_API_KEY}` };
  if (payload) headers['Content-Type'] = 'application/json';
  const signing = process.env.WAVE_SIGNING_SECRET;
  if (signing) {
    const timestamp = Math.floor(Date.now() / 1000);
    headers['Wave-Signature'] = `t=${timestamp},v1=${hmacHex(signing, `${timestamp}${payload}`)}`;
  }
  let res: Response;
  try {
    res = await fetch(`${WAVE_API}${path}`, { method, headers, body: payload || undefined, signal: AbortSignal.timeout(WAVE_TIMEOUT_MS) });
  } catch (err) {
    console.error('Wave injoignable', err);
    throw new PaymentError(502, 'Wave est injoignable pour le moment. Réessaie dans quelques minutes.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
  if (!res.ok) {
    console.error(`Wave ${method} ${path} : ${res.status}`, data.code, data.message);
    throw new PaymentError(502, 'Wave a refusé la demande. Réessaie dans quelques minutes.');
  }
  return data;
}

interface CheckoutSession {
  id: string;
  amount: string;
  currency: string;
  checkout_status: 'open' | 'complete' | 'expired';
  payment_status: 'processing' | 'cancelled' | 'succeeded';
  client_reference: string | null;
  transaction_id?: string;
  wave_launch_url: string;
}

const newReference = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;

/** Côte d'Ivoire mobile numbers: 10 digits starting with 01, 05 or 07, stored as +225XXXXXXXXXX. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/[\s.\-()]/g, '');
  if (digits.startsWith('00225')) digits = `+${digits.slice(2)}`;
  if (/^\d{10}$/.test(digits)) digits = `+225${digits}`;
  return /^\+225(01|05|07)\d{8}$/.test(digits) ? digits : null;
}

const displayPhone = (phone: string) => `${phone.slice(0, 4)} ${phone.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ')}`;

/** The account's Wave number; a first deposit or withdrawal ties the number given to the account for good. */
function resolvePhone(userId: number, raw: unknown): string {
  const tied = db.wavePhoneOf(userId);
  if (raw === undefined || raw === null || raw === '') {
    if (!tied) throw new PaymentError(400, 'Indique ton numéro Wave.');
    return tied;
  }
  const phone = normalizePhone(raw);
  if (!phone) throw new PaymentError(400, 'Numéro Wave invalide : 10 chiffres, par exemple 07 12 34 56 78.');
  const claim = db.claimWavePhone(userId, phone);
  if (claim === 'other_number') {
    throw new PaymentError(409, `Ton compte est lié au numéro Wave ${displayPhone(tied!)}. Pour le changer, contacte le support.`);
  }
  if (claim === 'used_elsewhere') throw new PaymentError(409, 'Ce numéro Wave est déjà lié à un autre compte.');
  return phone;
}

function amountIn(raw: unknown, min: number, max: number): number {
  const amount = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw new PaymentError(400, `Montant : entre ${min.toLocaleString('fr-FR')} et ${max.toLocaleString('fr-FR')} F.`);
  }
  return amount;
}

/** How much more the player may deposit before their Premium balance, with pending deposits, reaches the cap. */
function depositRoom(userId: number): number {
  const pending = db.pendingDepositsOf(userId).total;
  return Math.max(0, stakeConfig().premiumWalletCap - db.getWallet(userId).premium - pending);
}

/** What the wallet screen needs: limits, the tied Wave number and the latest payments. */
export function paymentsView(userId: number) {
  return {
    premiumEnabled: stakeConfig().premiumEnabled,
    depositsEnabled: depositsEnabled(),
    withdrawalsEnabled: providerSettings.wave.withdrawalsOpen,
    limits: { deposit: providerSettings.wave.deposit, withdrawal: providerSettings.wave.withdrawal },
    walletCap: stakeConfig().premiumWalletCap,
    depositRoom: depositRoom(userId),
    phone: db.wavePhoneOf(userId),
    payments: db.paymentsOf(userId, 10).map((p) => ({
      reference: p.reference,
      kind: p.kind,
      amount: p.amount,
      status: p.status,
      note: p.note,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
}

/** Opens a Wave checkout for a deposit; the player is sent to the returned Wave link to pay. */
export async function startDeposit(userId: number, rawAmount: unknown, rawPhone: unknown): Promise<{ reference: string; url: string }> {
  if (!waveConfigured()) throw new PaymentError(503, 'Les dépôts ne sont pas encore ouverts.');
  if (!stakeConfig().premiumEnabled) throw new PaymentError(503, PREMIUM_CLOSED);
  if (db.adultConfirmedAt(userId) === null) throw new PaymentError(403, ADULT_REQUIRED);
  if (!depositsEnabled()) throw new PaymentError(503, 'Les dépôts Wave sont momentanément fermés.');
  const { min, max } = providerSettings.wave.deposit;
  const amount = amountIn(rawAmount, min, max);
  if (db.pendingDepositsOf(userId).count >= MAX_PENDING_DEPOSITS) {
    throw new PaymentError(429, 'Tu as déjà des paiements Wave en attente. Termine-les ou attends 30 minutes.');
  }
  const room = depositRoom(userId);
  if (amount > room) {
    const cap = stakeConfig().premiumWalletCap.toLocaleString('fr-FR');
    throw new PaymentError(
      400,
      room < min
        ? `Ton portefeuille Premium est plein (plafond de ${cap} pièces, dépôts en attente compris). Joue ou retire avant de recharger.`
        : `Tu peux recharger au plus ${room.toLocaleString('fr-FR')} F : le portefeuille Premium est plafonné à ${cap} pièces.`,
    );
  }
  const phone = resolvePhone(userId, rawPhone);
  const reference = newReference('dep');
  db.openDeposit(reference, userId, amount, phone);
  const back = `${webUrl()}/portefeuille?depot=${reference}`;
  let session: CheckoutSession;
  try {
    session = await waveRequest<CheckoutSession>('POST', '/v1/checkout/sessions', {
      amount: String(amount),
      currency: 'XOF',
      client_reference: reference,
      // Only the Wave account tied to the player can pay: nobody pays in someone else's name.
      restrict_payer_mobile: phone,
      success_url: back,
      error_url: `${back}&echec=1`,
    });
  } catch (err) {
    db.failDeposit(reference, 'Paiement Wave non créé');
    throw err;
  }
  if (!session.id || !session.wave_launch_url?.startsWith('https://')) {
    db.failDeposit(reference, 'Réponse Wave invalide');
    throw new PaymentError(502, 'Wave a renvoyé une réponse inattendue. Réessaie dans quelques minutes.');
  }
  db.setPaymentProviderRef(reference, session.id);
  return { reference, url: session.wave_launch_url };
}

/** Applies a checkout session read from Wave (webhook or API) to the matching pending deposit. */
function applySession(session: CheckoutSession): boolean {
  const deposit = session.client_reference ? db.getPayment(session.client_reference) : null;
  if (!deposit || deposit.kind !== 'deposit' || deposit.status !== 'pending') return false;
  if (deposit.providerRef && deposit.providerRef !== session.id) return false;
  if (session.checkout_status === 'complete' && session.payment_status === 'succeeded') {
    if (session.currency !== 'XOF' || Number(session.amount) !== deposit.amount) {
      console.error(`Dépôt ${deposit.reference} : Wave annonce ${session.amount} ${session.currency}, attendu ${deposit.amount} XOF`);
      db.failDeposit(deposit.reference, `Montant Wave incohérent (${session.amount} ${session.currency}) : à vérifier`);
      return false;
    }
    return db.confirmDeposit(deposit.reference, session.transaction_id ?? session.id);
  }
  if (session.checkout_status === 'expired') return db.failDeposit(deposit.reference, 'Paiement Wave expiré');
  return false;
}

/** Reads a pending deposit back from Wave: covers a lost webhook or a player coming back early. */
async function syncDeposit(deposit: db.Payment) {
  if (deposit.status !== 'pending') return;
  if (!deposit.providerRef) {
    if (Date.now() - deposit.createdAt > DEPOSIT_STALE_MS) db.failDeposit(deposit.reference, 'Paiement Wave non créé');
    return;
  }
  applySession(await waveRequest<CheckoutSession>('GET', `/v1/checkout/sessions/${encodeURIComponent(deposit.providerRef)}`));
}

/** The player is back from Wave: where is their deposit? */
export async function checkDeposit(userId: number, rawReference: unknown) {
  const deposit = typeof rawReference === 'string' ? db.getPayment(rawReference) : null;
  if (!deposit || deposit.userId !== userId || deposit.kind !== 'deposit') throw new PaymentError(404, 'Paiement introuvable.');
  if (deposit.status === 'pending' && waveConfigured()) await syncDeposit(deposit).catch(() => {});
  const now = db.getPayment(deposit.reference)!;
  return { status: now.status, amount: now.amount };
}

/** Settles the deposits whose Wave session is over: credited if paid, closed otherwise. */
export async function settleStaleDeposits() {
  if (!waveConfigured()) return;
  for (const deposit of db.staleDeposits(Date.now() - DEPOSIT_STALE_MS)) {
    try {
      await syncDeposit(deposit);
    } catch (err) {
      console.error(`Dépôt ${deposit.reference} non vérifié`, err);
    }
  }
}

/** Takes the coins at once; an admin then sends the money by hand on Wave. */
export function requestWithdrawal(userId: number, rawAmount: unknown, rawPhone: unknown): { reference: string } {
  if (db.playerSummary(userId)?.bannedAt) throw new PaymentError(403, 'Ce compte est suspendu. Contacte le support.');
  if (!providerSettings.wave.withdrawalsOpen) throw new PaymentError(503, 'Les retraits Wave sont momentanément fermés.');
  const { min, perDay } = providerSettings.wave.withdrawal;
  const amount = amountIn(rawAmount, min, perDay);
  const phone = resolvePhone(userId, rawPhone);
  const reference = newReference('wd');
  const refused = db.requestWithdrawal(reference, userId, amount, phone, { perDay });
  if (refused) throw new PaymentError(400, refused);
  return { reference };
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_WEBHOOK_BYTES) throw new PaymentError(413, 'Requête trop volumineuse.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** `Wave-Signature: t=<seconds>,v1=<hex>[,v1=<hex>]`: HMAC-SHA256 of `<t><raw body>` with the webhook secret. */
function verifyWaveSignature(header: string, raw: Buffer, secret: string) {
  const parts = header.split(',').map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2) ?? '';
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const sentAt = Number(timestamp) * 1000;
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - sentAt) > MAX_CLOCK_SKEW_MS) throw new PaymentError(401, 'Horodatage invalide.');
  const expected = createHmac('sha256', secret).update(timestamp).update(raw).digest();
  const valid = signatures.some((s) => {
    const given = Buffer.from(/^[0-9a-f]{64}$/i.test(s) ? s : '', 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!valid) throw new PaymentError(401, 'Signature invalide.');
}

/** POST /api/payments/webhook: Wave's notifications. Any verified event gets a 200, so Wave stops retrying. */
export async function handlePaymentWebhook(req: IncomingMessage): Promise<{ ok: true; applied: boolean }> {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentError(503, 'Paiements non configurés.');
  const raw = await readRaw(req);
  verifyWaveSignature(String(req.headers['wave-signature'] ?? ''), raw, secret);
  let event: { id?: unknown; type?: unknown; data?: unknown };
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new PaymentError(400, 'JSON invalide.');
  }
  if (event.type !== 'checkout.session.completed' || !event.data || typeof event.data !== 'object') return { ok: true, applied: false };
  return { ok: true, applied: applySession(event.data as CheckoutSession) };
}
