'use client';

import { useState } from 'react';
import type { FairDice } from '@ludo/engine';
import { Icon } from './Icons';
import { Sheet } from './Sheet';
import { verifyFairDice, type FairCheck } from '@/lib/fair';

/** Link under a finished online game that proves on this device the dice weren't rigged. */
export function FairDiceCheck({ fair }: { fair: FairDice }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<FairCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    try {
      setCheck(await verifyFairDice(fair));
    } catch {
      setCheck({ ok: false, reason: 'Vérification impossible sur cet appareil.' });
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
        Dés vérifiables
      </button>
      <Sheet open={open} title="Dés vérifiables" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4 pb-1 text-[14px]">
          <p className="text-[#8696a0]">
            Avant le premier lancer, le serveur a fixé une graine secrète et publié son empreinte. Chaque dé en découle. Maintenant que la partie
            est finie, la graine est révélée : ton téléphone peut recalculer tous les lancers.
          </p>
          <Field label="Empreinte annoncée (SHA-256)" value={fair.commit} />
          <Field label="Graine révélée" value={fair.seed ?? 'Révélée à la fin de la partie'} />
          <p className="text-[13px] text-[#8696a0]">
            {fair.rolls.length} lancer{fair.rolls.length > 1 ? 's' : ''} : {fair.rolls.join(' ')}
          </p>
          {check && (
            <p
              className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 font-medium ${
                check.ok ? 'bg-[#00a884]/15 text-[#25d366]' : 'bg-[#f15c6d]/15 text-[#f15c6d]'
              }`}
            >
              {check.ok ? <Icon.Check size={18} /> : <Icon.Block size={18} />}
              {check.ok ? `Vérifié : les ${check.rolls} lancers correspondent à la graine.` : check.reason}
            </p>
          )}
          <button
            type="button"
            onClick={verify}
            disabled={busy || !fair.seed}
            className="h-12 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-50"
          >
            Vérifier sur mon téléphone
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
