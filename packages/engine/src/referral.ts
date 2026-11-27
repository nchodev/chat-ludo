/**
 * Inviting friends, as set by the admins on the admin panel's Parrainage page.
 *
 * Free bonus: once an invited account has played `free.gamesNeeded` online games against real
 * players, the inviter gets `free.referrerCoins` and the friend `free.newcomerCoins` Free coins.
 * An inviter is rewarded for `free.maxRewarded` friends at most.
 *
 * First-deposit bonus: on an invited friend's first Wave deposit, whatever its amount (within the
 * deposit limits), the inviter and the friend each get `deposit.percent` % of it in Premium coins,
 * at most `deposit.maxBonus` each. Both bonuses are locked: they can be staked right away, but only
 * withdrawn once their owner has staked `deposit.wagerMultiplier` times their amount in Premium
 * games that went to the end. An inviter is paid for `deposit.maxRewarded` friends at most;
 * friends always get their own bonus.
 */
export interface ReferralSettings {
  free: {
    gamesNeeded: number;
    referrerCoins: number;
    newcomerCoins: number;
    maxRewarded: number;
  };
  deposit: {
    enabled: boolean;
    percent: number;
    maxBonus: number;
    wagerMultiplier: number;
    maxRewarded: number;
  };
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  free: { gamesNeeded: 3, referrerCoins: 500, newcomerCoins: 200, maxRewarded: 20 },
  deposit: { enabled: true, percent: 10, maxBonus: 1_000, wagerMultiplier: 1, maxRewarded: 100 },
};

/** Inclusive bounds of every number an admin can set. */
export const REFERRAL_BOUNDS = {
  free: {
    gamesNeeded: { min: 1, max: 50 },
    referrerCoins: { min: 0, max: 100_000 },
    newcomerCoins: { min: 0, max: 100_000 },
    maxRewarded: { min: 0, max: 10_000 },
  },
  deposit: {
    percent: { min: 1, max: 100 },
    maxBonus: { min: 1, max: 100_000 },
    wagerMultiplier: { min: 1, max: 20 },
    maxRewarded: { min: 0, max: 10_000 },
  },
} as const;

const LABELS = {
  free: {
    gamesNeeded: 'Parties à jouer',
    referrerCoins: 'Pièces Free du parrain',
    newcomerCoins: 'Pièces Free du filleul',
    maxRewarded: 'Filleuls récompensés (Free)',
  },
  deposit: {
    percent: 'Pourcentage du premier dépôt',
    maxBonus: 'Plafond par bonus',
    wagerMultiplier: 'Nombre de mises avant retrait',
    maxRewarded: 'Filleuls payés (dépôt)',
  },
} as const;

/** Checks settings sent by an admin; returns the clean settings or a French error message. */
export function validateReferralSettings(raw: unknown): ReferralSettings | string {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const part = (key: 'free' | 'deposit') => (input[key] && typeof input[key] === 'object' ? input[key] : {}) as Record<string, unknown>;
  const number = <G extends 'free' | 'deposit'>(group: G, key: keyof (typeof REFERRAL_BOUNDS)[G] & keyof (typeof LABELS)[G]): number | string => {
    const value = part(group)[key as string];
    const n = typeof value === 'number' ? value : Number(value);
    const { min, max } = REFERRAL_BOUNDS[group][key] as { min: number; max: number };
    const label = LABELS[group][key] as string;
    if (value === '' || value === null || !Number.isInteger(n) || n < min || n > max) {
      return `${label} : un nombre entier entre ${min.toLocaleString('fr-FR')} et ${max.toLocaleString('fr-FR')}.`;
    }
    return n;
  };
  if (typeof part('deposit').enabled !== 'boolean') return 'Activation du bonus au premier dépôt invalide.';
  const values = {
    gamesNeeded: number('free', 'gamesNeeded'),
    referrerCoins: number('free', 'referrerCoins'),
    newcomerCoins: number('free', 'newcomerCoins'),
    freeMax: number('free', 'maxRewarded'),
    percent: number('deposit', 'percent'),
    maxBonus: number('deposit', 'maxBonus'),
    wagerMultiplier: number('deposit', 'wagerMultiplier'),
    depositMax: number('deposit', 'maxRewarded'),
  };
  for (const value of Object.values(values)) if (typeof value === 'string') return value;
  const v = values as Record<keyof typeof values, number>;
  return {
    free: { gamesNeeded: v.gamesNeeded, referrerCoins: v.referrerCoins, newcomerCoins: v.newcomerCoins, maxRewarded: v.freeMax },
    deposit: {
      enabled: part('deposit').enabled as boolean,
      percent: v.percent,
      maxBonus: v.maxBonus,
      wagerMultiplier: v.wagerMultiplier,
      maxRewarded: v.depositMax,
    },
  };
}

/** The bonus each of them gets for a first deposit of `amount` F CFA: `maxBonus` at most. */
export function referralDepositBonus(amount: number, percent: number, maxBonus: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(maxBonus, Math.floor((amount * percent) / 100));
}

/** What players see of the rules: the settings, plus the Wave deposit minimum (any first deposit counts). */
export type ReferralRules = ReferralSettings & { minDeposit: number };

export interface ReferralView {
  /** Invited friends, newest first. */
  invited: {
    username: string;
    games: number;
    rewarded: boolean;
    joinedAt: number;
    /** Premium bonus paid for this friend's first deposit; null while they haven't made one. */
    depositBonus: number | null;
  }[];
  /** Free coins earned so far from invitations. */
  earned: number;
  /** Premium coins earned so far from invited friends' first deposits. */
  premiumEarned: number;
  rules: ReferralRules;
  /** Who invited this player, if anyone, and whether the welcome bonus was paid. */
  invitedBy: {
    username: string;
    games: number;
    rewarded: boolean;
    /** Premium welcome bonus received on the first deposit; null before it. */
    welcomeBonus: number | null;
  } | null;
}

/** Same rule as usernames: what can follow `?ref=` in an invitation link. */
export const REFERRAL_CODE = /^[\p{L}\p{N}_-]{3,16}$/u;
