'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_STAKE_CONFIG, setStakeConfig, stakeConfig, subscribeStakeConfig, validateStakeConfig } from '@ludo/engine';
import { api } from './api';

/** Tables can change from the admin panel: fetched again at most this often. */
const REFRESH_MS = 60_000;
let fetchedAt = 0;
let pending: Promise<void> | null = null;

function refreshStakeConfig() {
  if (pending || Date.now() - fetchedAt < REFRESH_MS) return;
  pending = api<unknown>('/stakes')
    .then((raw) => {
      const config = validateStakeConfig(raw);
      if (typeof config !== 'string') setStakeConfig(config);
      fetchedAt = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      pending = null;
    });
}

/** Stake tables and winner's share currently offered by the server. */
export function useStakeConfig() {
  const config = useSyncExternalStore(subscribeStakeConfig, stakeConfig, () => DEFAULT_STAKE_CONFIG);
  useEffect(refreshStakeConfig, []);
  return config;
}
