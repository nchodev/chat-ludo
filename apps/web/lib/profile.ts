'use client';

import { useSyncExternalStore } from 'react';
import {
  buyItem,
  claimLoginBonus,
  completeTutorial,
  gameResult,
  newProfile,
  normalizeProfile,
  recordGame,
  setAppearance,
  utcDay,
  type AppearanceChoice,
  type Color,
  type GameState,
  type OpponentKind,
  type Profile,
  type ProgressSummary,
  type ShopItem,
} from '@ludo/engine';
import { ApiError, api } from './api';

const GUEST_KEY = 'ludo:profile';
const SESSION_KEY = 'ludo:session';
const ACCOUNT_CACHE_KEY = 'ludo:account-cache';

export interface Session {
  token: string;
  username: string;
}

export interface ProfileState {
  /** False until the saved profile has been read on this device. */
  ready: boolean;
  profile: Profile;
  /** Signed-in account, or null for a guest whose progress stays on this device. */
  session: Session | null;
  rank: number | null;
}

interface AccountResponse {
  token?: string;
  username: string;
  profile: unknown;
  rank: number;
}

const INITIAL: ProfileState = { ready: false, profile: newProfile(), session: null, rank: null };
let state = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<ProfileState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** The guest profile, migrating coins and styles saved by earlier versions. */
function loadGuest(): Profile {
  const saved = readJson(GUEST_KEY);
  if (saved) return normalizeProfile(saved);
  const wallet = (readJson('ludo:wallet') ?? {}) as Record<string, unknown>;
  const appearance = readJson('ludo:appearance') ?? undefined;
  return normalizeProfile({ ...newProfile(), coins: wallet.coins, owned: wallet.owned, rewarded: wallet.rewarded, appearance });
}

function saveGuest(profile: Profile) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(profile));
  set({ profile });
}

function applyAccount(res: AccountResponse) {
  const profile = normalizeProfile(res.profile);
  const session = res.token ? { token: res.token, username: res.username } : state.session;
  if (!session) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(profile));
  set({ session, profile, rank: res.rank, ready: true });
}

function signOutLocally() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ACCOUNT_CACHE_KEY);
  set({ session: null, rank: null, profile: loadGuest(), ready: true });
}

let initialized = false;

function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const session = readJson(SESSION_KEY) as Session | null;
  if (session?.token) {
    const cached = readJson(ACCOUNT_CACHE_KEY);
    set({ session, profile: cached ? normalizeProfile(cached) : newProfile(), ready: !!cached });
    void refreshProfile();
  } else {
    set({ profile: loadGuest(), ready: true });
  }
}

/** Reloads the account from the server (e.g. after an online game credited it). */
export async function refreshProfile() {
  const token = state.session?.token;
  if (!token) return;
  try {
    applyAccount(await api<AccountResponse>('/me', { token }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) signOutLocally();
    else set({ ready: true });
  }
}

function subscribe(listener: () => void) {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProfile(): ProfileState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}

export function getSessionToken(): string | undefined {
  init();
  return state.session?.token;
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export async function register(username: string, password: string) {
  const res = await api<AccountResponse>('/register', { body: { username, password, guestProfile: loadGuest() } });
  // The guest's progress now lives in the account; start the device's guest profile afresh.
  localStorage.setItem(GUEST_KEY, JSON.stringify({ ...newProfile(), appearance: loadGuest().appearance }));
  applyAccount(res);
}

export async function login(username: string, password: string) {
  applyAccount(await api<AccountResponse>('/login', { body: { username, password } }));
}

export async function logout() {
  const token = state.session?.token;
  signOutLocally();
  if (token) await api('/logout', { token, body: {} }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Progress actions: computed locally for guests, by the server for accounts */
/* ------------------------------------------------------------------ */

export async function buy(item: ShopItem) {
  const token = state.session?.token;
  if (token) applyAccount(await api<AccountResponse>('/shop/buy', { token, body: { item } }));
  else saveGuest(buyItem(state.profile, item));
}

export async function chooseAppearance(patch: Partial<AppearanceChoice>) {
  const token = state.session?.token;
  const updated = setAppearance(state.profile, patch);
  if (!token) return saveGuest(updated);
  set({ profile: updated });
  applyAccount(await api<AccountResponse>('/appearance', { token, body: patch }));
}

export async function claimDailyBonus(): Promise<{ coins: number; streak: number }> {
  const token = state.session?.token;
  if (token) {
    const res = await api<AccountResponse & { coins: number; streak: number }>('/daily/login', { token, body: {} });
    applyAccount(res);
    return { coins: res.coins, streak: res.streak };
  }
  const { profile, coins, streak } = claimLoginBonus(state.profile, utcDay());
  saveGuest(profile);
  return { coins, streak };
}

export async function finishTutorial(): Promise<ProgressSummary | null> {
  const token = state.session?.token;
  if (token) {
    const res = await api<AccountResponse & { summary: ProgressSummary | null }>('/tutorial/complete', { token, body: {} });
    applyAccount(res);
    return res.summary;
  }
  const done = completeTutorial(state.profile);
  if (done) saveGuest(done.profile);
  return done?.summary ?? null;
}

/**
 * Counts a finished game for this device's player. Online games of signed-in players are
 * credited by the server instead, so this is only for local games and guests.
 */
export async function recordFinishedGame(input: {
  state: GameState;
  color: Color;
  opponents: Partial<Record<Color, OpponentKind>>;
  online: boolean;
}): Promise<ProgressSummary | null> {
  const opponentKind = (c: Color): OpponentKind => input.opponents[c] ?? { kind: 'human', online: input.online };
  const token = state.session?.token;
  if (token) {
    try {
      const res = await api<AccountResponse & { summary: ProgressSummary | null }>('/games/local', {
        token,
        body: {
          players: input.state.players,
          rules: input.state.rules,
          history: input.state.history,
          color: input.color,
          opponents: input.opponents,
        },
      });
      applyAccount(res);
      return res.summary;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 429 || err.status === 409)) return null;
      throw err;
    }
  }
  const result = gameResult(input.state, input.color, opponentKind, input.online);
  const recorded = result && recordGame(state.profile, result, utcDay());
  if (!recorded) return null;
  saveGuest(recorded.profile);
  return recorded.summary;
}
