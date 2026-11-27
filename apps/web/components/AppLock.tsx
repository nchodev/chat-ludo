'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import { unlockApp, useAppLock } from '@/lib/appLock';
import { logout } from '@/lib/profile';

/** Covers the whole app while it is locked, until the fingerprint is given. */
export function AppLock() {
  const { ready, locked } = useAppLock();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    setError(await unlockApp());
    setBusy(false);
  }, []);

  // Ask at once when the lock shows; some browsers want a tap first, then the button does it.
  useEffect(() => {
    if (!locked) {
      asked.current = false;
      return;
    }
    if (asked.current || document.visibilityState !== 'visible') return;
    asked.current = true;
    void unlock();
  }, [locked, unlock]);

  useEffect(() => {
    if (!locked) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !asked.current) {
        asked.current = true;
        void unlock();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [locked, unlock]);

  if (!ready || !locked) return null;

  return (
    <div
      id="app-lock"
      role="dialog"
      aria-modal="true"
      aria-label="LuChat est verrouillé"
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 bg-[#0b141a] px-8 text-center text-[#e9edef]"
    >
      <span className="grid size-16 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
        <Icon.Lock size={30} />
      </span>
      <div>
        <p className="text-[20px] font-semibold">LuChat est verrouillé</p>
        <p className="mt-1 text-[14px] text-[#8696a0]">Utilise ton empreinte pour ouvrir l’application.</p>
      </div>
      <button
        type="button"
        onClick={() => void unlock()}
        disabled={busy}
        className="grid size-20 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884] transition active:scale-95 disabled:opacity-60"
        aria-label="Déverrouiller avec l’empreinte"
      >
        <Icon.Fingerprint size={44} />
      </button>
      {error && <p className="text-[13.5px] text-[#f15c6d]">{error}</p>}
      <button type="button" onClick={() => void logout()} className="absolute bottom-8 text-[13.5px] font-medium text-[#8696a0] underline-offset-2 hover:underline">
        Empreinte perdue ? Se déconnecter
      </button>
    </div>
  );
}
