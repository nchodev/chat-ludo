import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAKE_CONFIG,
  MAX_CUSTOM_STAKE,
  MAX_WALLET_CAP,
  MIN_CUSTOM_STAKE,
  MIN_WALLET_CAP,
  customStakeIssue,
  offeredTables,
  setStakeConfig,
  stakeTable,
  validateStakeConfig,
} from './stakes';

describe('stakeTable', () => {
  it('finds an offered table', () => {
    expect(stakeTable('free-100')).toEqual({ id: 'free-100', currency: 'free', stake: 100 });
  });

  it('accepts an amount typed by a player', () => {
    expect(stakeTable('free-300')).toEqual({ id: 'free-300', currency: 'free', stake: 300 });
    expect(stakeTable(`premium-${MAX_CUSTOM_STAKE}`)?.stake).toBe(MAX_CUSTOM_STAKE);
  });

  it('rejects amounts out of bounds or badly written', () => {
    for (const id of [`free-${MIN_CUSTOM_STAKE - 1}`, `free-${MAX_CUSTOM_STAKE + 1}`, 'free-0300', 'free-1.5', 'gold-100', 'free-', 42, null]) {
      expect(stakeTable(id)).toBeUndefined();
    }
  });

  it('explains why a typed amount is refused', () => {
    expect(customStakeIssue(MIN_CUSTOM_STAKE)).toBeNull();
    expect(customStakeIssue(5)).toMatch(/minimale/);
    expect(customStakeIssue(MAX_CUSTOM_STAKE + 1)).toMatch(/maximale/);
    expect(customStakeIssue(12.5)).toMatch(/entier/);
  });
});

describe('winner share', () => {
  const base = { tables: [{ currency: 'free' as const, stake: 100 }] };

  it('accepts any share from 50 % to 100 %', () => {
    for (const share of [0.5, 0.75, 0.9, 0.95, 1]) {
      const saved = validateStakeConfig({ ...base, winnerShare: share });
      expect(typeof saved !== 'string' && saved.winnerShare).toBe(share);
    }
  });

  it('refuses a share below 50 % or above 100 %', () => {
    expect(validateStakeConfig({ ...base, winnerShare: 0.49 })).toMatch(/gagnant/);
    expect(validateStakeConfig({ ...base, winnerShare: 1.01 })).toMatch(/gagnant/);
  });
});

describe('Premium mode', () => {
  it('stays on for settings saved before the switch existed', () => {
    const saved = validateStakeConfig({ winnerShare: 0.9, tables: [{ currency: 'premium', stake: 100 }] });
    expect(typeof saved !== 'string' && saved.premiumEnabled).toBe(true);
  });

  it('refuses every Premium stake while off, and keeps Free ones', () => {
    setStakeConfig({ ...DEFAULT_STAKE_CONFIG, premiumEnabled: false });
    try {
      expect(stakeTable('premium-500')).toBeUndefined();
      expect(stakeTable('premium-300')).toBeUndefined();
      expect(stakeTable('free-100')?.currency).toBe('free');
      expect(offeredTables().every((t) => t.currency === 'free')).toBe(true);
    } finally {
      setStakeConfig(DEFAULT_STAKE_CONFIG);
    }
    expect(stakeTable('premium-500')?.currency).toBe('premium');
  });
});

describe('Premium wallet cap', () => {
  const base = { winnerShare: 0.9, tables: [] };

  it('defaults to 50 000 for settings saved before the cap existed', () => {
    const saved = validateStakeConfig(base);
    expect(typeof saved !== 'string' && saved.premiumWalletCap).toBe(50_000);
  });

  it('keeps a valid cap and refuses one out of bounds or not whole', () => {
    const saved = validateStakeConfig({ ...base, premiumWalletCap: 120_000 });
    expect(typeof saved !== 'string' && saved.premiumWalletCap).toBe(120_000);
    for (const cap of [MIN_WALLET_CAP - 1, MAX_WALLET_CAP + 1, 1500.5, 'abc']) {
      expect(validateStakeConfig({ ...base, premiumWalletCap: cap })).toMatch(/Plafond/);
    }
  });
});
