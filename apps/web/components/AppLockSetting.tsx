'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';
import { LOCK_DELAYS, appLockSupported, disableAppLock, enableAppLock, setAppLockDelay, useAppLock } from '@/lib/appLock';
import { useLang } from '@/lib/i18n';

/** Profile card: turns the fingerprint lock on or off, and sets how soon it locks again. */
export function AppLockSetting({ username }: { username: string }) {
  const { enabled, delayMs } = useAppLock();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();

  useEffect(() => {
    void appLockSupported().then(setSupported);
  }, []);

  if (supported === null) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    if (enabled) {
      setError(await disableAppLock());
    } else {
      try {
        await enableAppLock(username, delayMs);
      } catch (err) {
        setError(
          err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
            ? t('Activation annulée.', 'Activation cancelled.')
            : t('Impossible d’enregistrer l’empreinte sur ce téléphone.', 'Could not register a fingerprint on this phone.'),
        );
      }
    }
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-[#1f2c33] p-4">
      <div className="flex items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
          <Icon.Fingerprint size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">{t('Verrouillage par empreinte', 'Fingerprint lock')}</span>
          <span className="block text-[13px] text-[#8696a0]">
            {!supported
              ? t('Pas de capteur d’empreinte disponible sur ce téléphone ou ce navigateur.', 'No fingerprint sensor available on this phone or browser.')
              : enabled
                ? t('Ton empreinte est demandée pour ouvrir LuChat.', 'Your fingerprint is needed to open LuChat.')
                : t('Demande ton empreinte pour ouvrir LuChat.', 'Ask for your fingerprint to open LuChat.')}
          </span>
        </span>
        {supported && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? t('Désactiver le verrouillage par empreinte', 'Turn off fingerprint lock') : t('Activer le verrouillage par empreinte', 'Turn on fingerprint lock')}
            disabled={busy}
            onClick={() => void toggle()}
            className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-60 ${enabled ? 'bg-[#00a884]' : 'bg-white/15'}`}
          >
            <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`} />
          </button>
        )}
      </div>
      {supported && enabled && (
        <label className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[14px]">
          <span>{t('Verrouiller', 'Lock')}</span>
          <select
            value={delayMs}
            onChange={(e) => setAppLockDelay(Number(e.target.value))}
            className="rounded-xl bg-[#0b141a]/60 px-3 py-2 text-[14px] text-[#e9edef]"
          >
            {LOCK_DELAYS.map((d) => (
              <option key={d.ms} value={d.ms}>
                {t(d.label[0], d.label[1])}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-[13px] text-[#f15c6d]">{error}</p>}
    </section>
  );
}
