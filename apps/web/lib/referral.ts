'use client';

import { REFERRAL_CODE } from '@ludo/engine';

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
