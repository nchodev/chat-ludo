'use client';

import { useState } from 'react';
import type { FairDice } from '@ludo/engine';
import { Icon } from './Icons';
import { Sheet } from './Sheet';
import { verifyFairDice, type FairCheck } from '@/lib/fair';
import { useLang } from '@/lib/i18n';

/** Link under a finished online game that proves on this device the dice weren't rigged. */
export function FairDiceCheck({ fair }: { fair: FairDice }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<FairCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useLang();

  const verify = async () => {
    setBusy(true);
    try {
      setCheck(await verifyFairDice(fair));
    } catch {
      setCheck({ ok: false, reason: t('Vérification impossible sur cet appareil.', 'Verification is not possible on this device.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[#8696a0] hover:text-[#e9edef]"
      >
        <Icon.Shield size={16} />
        {t('Dés vérifiables', 'Verifiable dice')}
      </button>
      <Sheet open={open} title={t('Dés vérifiables', 'Verifiable dice')} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4 pb-1 text-[14px]">
          <p className="text-[#8696a0]">
            {t(
              'Avant le premier lancer, le serveur a fixé une graine secrète et publié son empreinte. Chaque dé en découle. Maintenant que la partie est finie, la graine est révélée : ton téléphone peut recalculer tous les lancers.',
              'Before the first roll, the server picked a secret seed and published its fingerprint. Every die comes from it. Now that the game is over, the seed is revealed: your phone can recompute every roll.',
            )}
          </p>
          <Field label={t('Empreinte annoncée (SHA-256)', 'Announced fingerprint (SHA-256)')} value={fair.commit} />
          <Field label={t('Graine révélée', 'Revealed seed')} value={fair.seed ?? t('Révélée à la fin de la partie', 'Revealed at the end of the game')} />
          <p className="text-[13px] text-[#8696a0]">
            {t(`${fair.rolls.length} lancer${fair.rolls.length > 1 ? 's' : ''} :`, `${fair.rolls.length} roll${fair.rolls.length > 1 ? 's' : ''}:`)} {fair.rolls.join(' ')}
          </p>
          {check && (
            <p
              className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 font-medium ${
                check.ok ? 'bg-[#00a884]/15 text-[#25d366]' : 'bg-[#f15c6d]/15 text-[#f15c6d]'
              }`}
            >
              {check.ok ? <Icon.Check size={18} /> : <Icon.Block size={18} />}
              {check.ok ? t(`Vérifié : les ${check.rolls} lancers correspondent à la graine.`, `Verified: all ${check.rolls} rolls match the seed.`) : check.reason}
            </p>
          )}
          <button
            type="button"
            onClick={verify}
            disabled={busy || !fair.seed}
            className="h-12 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-50"
          >
            {t('Vérifier sur mon téléphone', 'Verify on my phone')}
          </button>
        </div>
      </Sheet>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-[#00a884]">{label}</p>
      <p className="rounded-xl bg-[#0b141a]/60 px-3 py-2 font-mono text-[11.5px] break-all text-[#d1d7db]">{value}</p>
    </div>
  );
}
