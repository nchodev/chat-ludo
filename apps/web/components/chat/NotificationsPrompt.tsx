'use client';

import { useEffect, useState } from 'react';
import { getSessionToken } from '@/lib/profile';
import { enablePush, pushStatus, type PushStatus } from '@/lib/push';
import { Icon } from '../Icons';

const HIDE_KEY = 'ludo:push-prompt-hidden';
const HIDE_MS = 7 * 86_400_000;

/** Offers to turn on message notifications on this device until the player says yes or "later". */
export function NotificationsPrompt() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now()) return;
    pushStatus()
      .then(setStatus)
      .catch(() => setStatus('unsupported'));
  }, []);

  if (status !== 'off' && status !== 'denied') return null;

  const enable = async () => {
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await enablePush(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_MS));
    setStatus(null);
  };

  return (
    <div className="mb-3 flex gap-3 rounded-2xl bg-[#1f2c33] p-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
        <Icon.Bell size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-[#e9edef]">Notifications de messages</p>
        <p className="text-[13px] leading-snug text-[#8696a0]">
          {status === 'denied'
            ? 'Elles sont bloquées : autorise-les dans les réglages du navigateur pour ce site.'
            : 'Sois prévenu quand un ami t’écrit, même app fermée.'}
        </p>
        {error && <p className="mt-1 text-[12.5px] text-[#f15c6d]">{error}</p>}
        <div className="mt-2 flex justify-end gap-1">
          <button type="button" onClick={later} className="h-9 rounded-full px-4 text-[14px] font-medium text-[#8696a0] active:bg-white/5">
            Plus tard
          </button>
          {status === 'off' && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="h-9 rounded-full bg-[#00a884] px-4 text-[14px] font-medium text-[#0b141a] active:opacity-80 disabled:opacity-50"
            >
              {busy ? 'Activation…' : 'Activer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
