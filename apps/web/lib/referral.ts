'use client';

import { useEffect, useState } from 'react';
import { REFERRAL_CODE, type ReferralRules } from '@ludo/engine';
import { api } from './api';

const REF_KEY = 'luchat:ref';

/** Remembers who invited this device (`?ref=pseudo` in the link it was opened with). */
export function captureReferral() {
  const ref = new URLSearchParams(window.location.search).get('ref')?.trim();
  if (ref && REFERRAL_CODE.test(ref)) localStorage.setItem(REF_KEY, ref);
}

export function storedReferrer(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(REF_KEY);
}

export function clearReferrer() {
  localStorage.removeItem(REF_KEY);
}

export function referralLink(username: string): string {
  return `${window.location.origin}/?ref=${encodeURIComponent(username)}`;
}

let rulesCache: { rules: ReferralRules; at: number } | null = null;
let rulesRequest: Promise<ReferralRules> | null = null;
const RULES_TTL_MS = 5 * 60_000;

/** The referral rules set by the admins; null until loaded (or when the server can't be reached). */
export function useReferralRules(): ReferralRules | null {
  const [rules, setRules] = useState<ReferralRules | null>(() => rulesCache?.rules ?? null);
  useEffect(() => {
    if (rulesCache && Date.now() - rulesCache.at < RULES_TTL_MS) return;
    rulesRequest ??= api<ReferralRules>('/referral/rules')
      .then((loaded) => {
        rulesCache = { rules: loaded, at: Date.now() };
        return loaded;
      })
      .finally(() => {
        rulesRequest = null;
      });
    let alive = true;
    rulesRequest.then((loaded) => alive && setRules(loaded)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return rules;
}
