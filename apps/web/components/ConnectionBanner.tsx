'use client';

import { useEffect, useState } from 'react';
import { useConnectivity, useReconnectOnResume } from '@/lib/connectivity';
import { useLang } from '@/lib/i18n';

/** A dropped game connection is only shown after this long, so quick reconnections go unnoticed. */
const RECONNECTING_GRACE_MS = 2000;
const RESTORED_SHOWN_MS = 2500;

type Shown = 'offline' | 'reconnecting' | 'restored' | null;

export function ConnectionBanner() {
  useReconnectOnResume();
  const status = useConnectivity();
  const { t } = useLang();
  const [shown, setShown] = useState<Shown>(null);

  useEffect(() => {
    if (status === 'offline') {
      setShown('offline');
      return;
    }
    if (status === 'reconnecting') {
      const timer = setTimeout(() => setShown('reconnecting'), shown === 'offline' ? 0 : RECONNECTING_GRACE_MS);
      return () => clearTimeout(timer);
    }
    if (shown === 'offline' || shown === 'reconnecting') setShown('restored');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (shown !== 'restored') return;
    const timer = setTimeout(() => setShown(null), RESTORED_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  const style = {
    offline: 'bg-[#3b4a54] text-[#e9edef]',
    reconnecting: 'bg-amber-400 text-slate-900',
    restored: 'bg-[#00a884] text-white',
  }[shown];
  const text = {
    offline: t('Pas de connexion internet. Les parties sur le même écran restent disponibles.', 'No internet connection. Games on this screen are still available.'),
    reconnecting: t('Connexion au serveur perdue, reconnexion…', 'Connection to the server lost, reconnecting…'),
    restored: t('Connexion rétablie', 'Connection restored'),
  }[shown];

  return (
    <div role="status" aria-live="polite" className={`fixed inset-x-0 top-0 z-[60] pt-[env(safe-area-inset-top)] text-center text-[13.5px] font-semibold ${style}`}>
      <p className="flex items-center justify-center gap-2 px-4 py-1.5">
        {shown === 'reconnecting' && <span className="size-3.5 animate-spin rounded-full border-2 border-slate-900/25 border-t-slate-900" />}
        {text}
      </p>
    </div>
  );
}
