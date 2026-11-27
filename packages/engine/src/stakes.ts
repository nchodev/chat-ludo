/**
 * Quick-match tables where every player stakes coins and the winner takes most of the pot.
 * `free` tables use coins earned in the game; `premium` tables use purchased coins.
 */
export type Currency = 'free' | 'premium';

export interface StakeTable {
  id: string;
  currency: Currency;
  /** Coins each player puts in the pot. */
  stake: number;
}

/** Tables offered and the winner's share of the pot; the platform admins can change both. */
export interface StakeConfig {
  tables: StakeTable[];
  /** Share of the pot paid to the winner; the rest is the platform's commission. */
  winnerShare: number;
  /** Off: no Premium table, stake or deposit anywhere; balances can still be withdrawn. */
  premiumEnabled: boolean;
  /** Deposits stop once the Premium balance would pass it. Winnings may take a balance above it: that player keeps playing. */
  premiumWalletCap: number;
}

export const PREMIUM_CLOSED = 'Le mode Premium est momentanément désactivé.';
export const ADULT_REQUIRED = 'Le mode Premium est réservé aux joueurs de 18 ans ou plus : accepte d’abord l’attestation de majorité.';

/** Winner's share of the pot: 50 % to 100 % (commission 0 % to 50 %). */
export const MIN_WINNER_SHARE = 0.5;
export const MAX_WINNER_SHARE = 1;
export const MAX_STAKE = 1_000_000;
export const MAX_TABLES_PER_CURRENCY = 8;
export const MIN_WALLET_CAP = 1_000;
export const MAX_WALLET_CAP = 2_000_000;

export const DEFAULT_STAKE_CONFIG: StakeConfig = {
  winnerShare: 0.9,
  premiumEnabled: true,
  premiumWalletCap: 50_000,
  tables: [
    { id: 'free-50', currency: 'free', stake: 50 },
    { id: 'free-100', currency: 'free', stake: 100 },
    { id: 'free-250', currency: 'free', stake: 250 },
    { id: 'free-500', currency: 'free', stake: 500 },
    { id: 'premium-100', currency: 'premium', stake: 100 },
    { id: 'premium-500', currency: 'premium', stake: 500 },
    { id: 'premium-1000', currency: 'premium', stake: 1000 },
    { id: 'premium-5000', currency: 'premium', stake: 5000 },
  ],
};

let config: StakeConfig = DEFAULT_STAKE_CONFIG;
const listeners = new Set<() => void>();

export function stakeConfig(): StakeConfig {
  return config;
}

export function setStakeConfig(next: StakeConfig) {
  config = next;
  for (const listener of listeners) listener();
}

export function subscribeStakeConfig(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function tableId(currency: Currency, stake: number) {
  return `${currency}-${stake}`;
}

/** Checks an edited configuration; returns it cleaned (sorted, ids rebuilt) or an error message. */
export function validateStakeConfig(raw: unknown): StakeConfig | string {
  const input = raw as { tables?: unknown; winnerShare?: unknown; premiumEnabled?: unknown; premiumWalletCap?: unknown } | null;
  const share = Number(input?.winnerShare);
  if (!Number.isFinite(share) || share < MIN_WINNER_SHARE || share > MAX_WINNER_SHARE) {
    return `Le gagnant doit recevoir entre ${MIN_WINNER_SHARE * 100} % et ${MAX_WINNER_SHARE * 100} % de la cagnotte.`;
  }
  // Settings saved before the cap existed get the default one.
  const cap = input?.premiumWalletCap === undefined ? DEFAULT_STAKE_CONFIG.premiumWalletCap : Number(input.premiumWalletCap);
  if (!Number.isInteger(cap) || cap < MIN_WALLET_CAP || cap > MAX_WALLET_CAP) {
    return `Plafond du portefeuille Premium : un nombre entier entre ${MIN_WALLET_CAP.toLocaleString('fr-FR')} et ${MAX_WALLET_CAP.toLocaleString('fr-FR')}.`;
  }
  if (!Array.isArray(input?.tables)) return 'Tables invalides.';
  const tables: StakeTable[] = [];
  for (const t of input.tables as { currency?: unknown; stake?: unknown }[]) {
    const currency = t?.currency;
    const stake = Number(t?.stake);
    if (currency !== 'free' && currency !== 'premium') return 'Monnaie invalide.';
    if (!Number.isInteger(stake) || stake < 1 || stake > MAX_STAKE) return `Mise invalide : entre 1 et ${MAX_STAKE.toLocaleString('fr-FR')}.`;
    const id = tableId(currency, stake);
    if (tables.some((x) => x.id === id)) return `La table ${stake} ${currency === 'free' ? 'Free' : 'Premium'} existe deux fois.`;
    tables.push({ id, currency, stake });
  }
  for (const currency of ['free', 'premium'] as const) {
    if (tables.filter((t) => t.currency === currency).length > MAX_TABLES_PER_CURRENCY) {
      return `${MAX_TABLES_PER_CURRENCY} tables au maximum par monnaie.`;
    }
  }
  tables.sort((a, b) => (a.currency === b.currency ? a.stake - b.stake : a.currency === 'free' ? -1 : 1));
  return { tables, winnerShare: Math.round(share * 100) / 100, premiumEnabled: input.premiumEnabled !== false, premiumWalletCap: cap };
}

/** The tables players can pick right now: Premium ones are hidden while the mode is off. */
export function offeredTables(cfg: StakeConfig = config): StakeTable[] {
  return cfg.premiumEnabled ? cfg.tables : cfg.tables.filter((t) => t.currency !== 'premium');
}

/** Bounds of an amount typed by a player instead of one of the offered tables. */
export const MIN_CUSTOM_STAKE = 10;
export const MAX_CUSTOM_STAKE = 100_000;

/** Checks an amount typed by a player; returns an error message, or null when it can be staked. */
export function customStakeIssue(stake: number): string | null {
  if (!Number.isInteger(stake)) return 'Saisis un nombre entier de pièces.';
  if (stake < MIN_CUSTOM_STAKE) return `La mise minimale est de ${MIN_CUSTOM_STAKE} pièces.`;
  if (stake > MAX_CUSTOM_STAKE) return `La mise maximale est de ${MAX_CUSTOM_STAKE.toLocaleString('fr-FR')} pièces.`;
  return null;
}

/** An offered table, or a custom amount written the same way (`free-300`); undefined if invalid or Premium is off. */
export function stakeTable(id: unknown): StakeTable | undefined {
  const offered = offeredTables().find((t) => t.id === id);
  if (offered) return offered;
  const match = typeof id === 'string' ? /^(free|premium)-([1-9]\d{0,6})$/.exec(id) : null;
  if (!match || (match[1] === 'premium' && !config.premiumEnabled)) return undefined;
  const stake = Number(match[2]);
  if (customStakeIssue(stake)) return undefined;
  return { id: match[0], currency: match[1] as Currency, stake };
}

/** How a pot of `players` stakes is split; the winner's prize is rounded down. */
export function potSplit(stake: number, players: number, winnerShare = config.winnerShare): { pot: number; prize: number; fee: number } {
  const pot = stake * players;
  const prize = Math.floor(pot * winnerShare);
  return { pot, prize, fee: pot - prize };
}

/** What a staked game looks like to the players in it. */
export interface RoomStake {
  table: string;
  currency: Currency;
  stake: number;
  pot: number;
  prize: number;
  /** Set once the pot is paid out (or refunded, with a null winner). */
  payout: { winner: string | null; amount: number } | null;
}
