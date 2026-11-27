'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent } from 'react';
import { GemIcon } from './Coins';
import { Icon } from './Icons';
import { Sheet } from './Sheet';
import { confirmAdult, useProfile } from '@/lib/profile';
import { useLang } from '@/lib/i18n';

const POINTS: [string, string][] = [
  [
    'Les pièces Premium s’achètent avec de l’argent réel (1 pièce = 1 F CFA) et se gagnent ou se perdent en jouant contre d’autres joueurs.',
    'Premium coins are bought with real money (1 coin = 1 CFA franc) and are won or lost playing against other players.',
  ],
  [
    'Les parties et achats Premium sont strictement réservés aux personnes âgées de 18 ans ou plus.',
    'Premium games and purchases are strictly for people aged 18 or over.',
  ],
  [
    'Joue de façon responsable : ne mise que ce que tu peux te permettre de perdre, et fais des pauses.',
    'Play responsibly: only stake what you can afford to lose, and take breaks.',
  ],
  [
    'Un compte utilisé par une personne mineure ou au nom d’une autre personne peut être suspendu.',
    'An account used by a minor or in someone else’s name may be suspended.',
  ],
];

/** Notice the player must accept, once per account, before buying or staking Premium coins. */
export function AdultNoticeSheet({ open, onClose, onAccepted }: { open: boolean; onClose: () => void; onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLang();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await confirmAdult();
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Enregistrement impossible.', 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title={t('Mode Premium : réservé aux majeurs', 'Premium mode: adults only')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-violet-600/35 to-indigo-700/15 px-4 py-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-black/25 text-[15px] font-black text-[#ffbc38]">18+</span>
          <p className="text-[13.5px] leading-snug text-[#d1d7db]">
            {t('Avant de jouer ou d’acheter avec des pièces', 'Before playing or buying with')}{' '}
            <span className="inline-flex align-[-2px]">
              <GemIcon size={14} />
            </span>{' '}
            {t('Premium, lis et accepte cette notice.', 'Premium coins, read and accept this notice.')}
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {POINTS.map(([fr, en]) => (
            <li key={fr} className="flex gap-2.5 text-[13.5px] leading-snug text-[#d1d7db]">
              <Icon.Info size={18} className="mt-px shrink-0 text-[#8696a0]" />
              {t(fr, en)}
            </li>
          ))}
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#0b141a] px-4 py-3">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#00a884]" />
          <span className="text-[14px] leading-snug">
            {t('J’atteste sur l’honneur avoir 18 ans ou plus et j’accepte les', 'I solemnly declare that I am 18 or over and I accept the')}{' '}
            <Link href="/conditions" target="_blank" className="font-semibold text-[#00a884]">
              {t('conditions d’utilisation', 'terms of use')}
            </Link>{' '}
            {t('du mode Premium.', 'of Premium mode.')}
          </span>
        </label>
        {error && <p className="rounded-xl bg-[#f15c6d]/10 px-3 py-2.5 text-[13.5px] text-[#f15c6d]">{error}</p>}
        <button type="submit" disabled={!checked || busy} className="h-12 rounded-full bg-[#00a884] text-[15px] font-bold text-[#0b141a] disabled:opacity-50">
          {busy ? t('Enregistrement…', 'Saving…') : t('Accepter et continuer', 'Accept and continue')}
        </button>
        <button type="button" onClick={onClose} className="-mt-1 h-10 text-[14px] font-semibold text-[#8696a0]">
          {t('Pas maintenant', 'Not now')}
        </button>
      </form>
    </Sheet>
  );
}

/** In a room staked with Premium coins: asks a player who hasn't accepted the notice yet to do it. */
export function AdultRequiredBanner({ className = '' }: { className?: string }) {
  const { gate, notice, needed } = useAdultGate();
  const { t } = useLang();
  if (!needed) return null;
  return (
    <div className={`flex items-start gap-3 rounded-2xl bg-violet-500/15 px-4 py-3 text-[13.5px] text-[#e9edef] ${className}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/25 text-[11px] font-black text-[#ffbc38]">18+</span>
      <span className="flex-1">
        {t('Cette partie se joue en pièces Premium, réservées aux joueurs majeurs.', 'This game is played with Premium coins, for adult players only.')}
        <button type="button" onClick={() => gate(() => {})} className="mt-1 block font-semibold text-[#00a884]">
          {t('Lire et accepter l’attestation', 'Read and accept the declaration')}
        </button>
      </span>
      {notice}
    </div>
  );
}

/**
 * Runs a Premium action at once if the account already certified being 18 or older, otherwise
 * shows the notice first and runs the action once it is accepted. Render `notice` in the page.
 */
export function useAdultGate() {
  const { session, adultConfirmed } = useProfile();
  const [pending, setPending] = useState<(() => void) | null>(null);

  const gate = useCallback(
    (action: () => void) => {
      if (!session || adultConfirmed) action();
      else setPending(() => action);
    },
    [session, adultConfirmed],
  );

  const notice = (
    <AdultNoticeSheet
      open={!!pending}
      onClose={() => setPending(null)}
      onAccepted={() => {
        const action = pending;
        setPending(null);
        action?.();
      }}
    />
  );

  return { gate, notice, needed: !!session && !adultConfirmed };
}
