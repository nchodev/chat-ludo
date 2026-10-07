'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ludo:wallet';
/** Only the most recent rewarded games are remembered, enough to avoid paying twice. */
const MAX_REWARDED = 50;

interface WalletData {
  coins: number;
  /** Shop items bought, e.g. "board:wood", "dice:gold" or "pawn:crown". */
  owned: string[];
  /** Ids of games already rewarded on this device. */
  rewarded: string[];
}

const EMPTY: WalletData = { coins: 0, owned: [], rewarded: [] };
const listeners = new Set<(data: WalletData) => void>();

function load(): WalletData {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      coins: Number.isFinite(data.coins) ? Math.max(0, Math.floor(data.coins)) : 0,
      owned: Array.isArray(data.owned) ? data.owned : [],
      rewarded: Array.isArray(data.rewarded) ? data.rewarded : [],
    };
  } catch {
    return EMPTY;
  }
}

function save(data: WalletData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  listeners.forEach((l) => l(data));
}

export type ShopItem = `${'board' | 'dice' | 'pawn'}:${string}`;

/** Credits a game's reward once; returns false if this game was already rewarded. */
export function claimReward(gameId: string, coins: number): boolean {
  const data = load();
  if (data.rewarded.includes(gameId)) return false;
  save({
    ...data,
    coins: data.coins + coins,
    rewarded: [...data.rewarded, gameId].slice(-MAX_REWARDED),
  });
  return true;
}

export function ownsItem(data: Pick<WalletData, 'owned'>, item: ShopItem, price: number): boolean {
  return price === 0 || data.owned.includes(item);
}

export interface Wallet {
  coins: number;
  /** False until the saved wallet has been read on the client. */
  ready: boolean;
  owns: (item: ShopItem, price: number) => boolean;
  /** Spends coins on an item; returns false if the player cannot afford it. */
  buy: (item: ShopItem, price: number) => boolean;
}

/** The player's coins and purchases, saved on this device and shared across components. */
export function useWallet(): Wallet {
  const [data, setData] = useState<WalletData>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setData(load());
    setReady(true);
    listeners.add(setData);
    return () => {
      listeners.delete(setData);
    };
  }, []);

  const owns = useCallback((item: ShopItem, price: number) => ownsItem(data, item, price), [data]);

  const buy = useCallback((item: ShopItem, price: number) => {
    const current = load();
    if (ownsItem(current, item, price)) return true;
    if (current.coins < price) return false;
    save({ ...current, coins: current.coins - price, owned: [...current.owned, item] });
    return true;
  }, []);

  return { coins: data.coins, ready, owns, buy };
}
