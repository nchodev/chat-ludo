'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { GemIcon } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { api } from '@/lib/api';
import { getSessionToken, refreshProfile } from '@/lib/profile';

export interface PaymentLine {
  reference: string;
  kind: 'deposit' | 'withdrawal';
  amount: number;
  status: 'pending' | 'succeeded' | 'failed';
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentsView {
  premiumEnabled: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  limits: {
    deposit: { min: number; max: number };
    withdrawal: { min: number; perDay: number };
  };
  /** Most Premium coins a player may hold. */
  walletCap: number;
  /** What can still be deposited before reaching the cap, pending deposits included. */
  depositRoom: number;
  /** The Wave number tied to the account, once a first deposit or withdrawal gave it. */
  phone: string | null;
  /** Referral bonus that can be staked but not withdrawn yet, and what is left to stake to free it. */
  bonus: { locked: number; wagerDue: number };
  payments: PaymentLine[];
}

const DEPOSIT_PRESETS = [1_000, 2_000, 5_000, 10_000, 25_000];
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} F`;
const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const displayPhone = (phone: string) => `${phone.slice(0, 4)} ${phone.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ')}`;

function WaveMark({ size = 20 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-[#1dc3f0] font-black text-[#0b141a]"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      W
    </span>
  );
}

function PhoneField({ view, value, onChange }: { view: PaymentsView; value: string; onChange: (v: string) => void }) {
  if (view.phone) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-[#0b141a] px-4 py-3">
        <WaveMark size={28} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-[#8696a0]">Ton numéro Wave</span>
          <span className="block text-[15px] font-semibold tabular-nums">{displayPhone(view.phone)}</span>
        </span>
        <Icon.Lock size={18} className="text-[#8696a0]" />
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-[#aebac1]">Ton numéro Wave (Côte d’Ivoire)</span>
      <span className="flex h-12 items-center gap-2 rounded-2xl bg-[#0b141a] px-4 focus-within:ring-2 focus-within:ring-[#00a884]">
        <span className="text-[15px] text-[#8696a0]">+225</span>
        <input
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="07 12 34 56 78"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[15px] tabular-nums outline-none placeholder:text-[#54656f]"
        />
      </span>
      <span className="text-[12px] leading-snug text-[#8696a0]">
        Ce numéro sera lié à ton compte : tes dépôts devront venir de ce compte Wave et tes retraits y seront envoyés.
      </span>
    </label>
  );
}

function AmountField({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min: number; max: number }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-[#aebac1]">Montant</span>
      <span className="flex h-12 items-center gap-2 rounded-2xl bg-[#0b141a] px-4 focus-within:ring-2 focus-within:ring-[#00a884]">
        <input
          inputMode="numeric"
          placeholder={String(min)}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 7))}
          className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tabular-nums outline-none placeholder:text-[#54656f]"
        />
        <span className="text-[15px] text-[#8696a0]">F CFA</span>
      </span>
      <span className="text-[12px] text-[#8696a0]">
        De {fcfa(min)} à {fcfa(max)} · 1 F = 1 pièce Premium
      </span>
    </label>
  );
}

export function DepositSheet({ open, onClose, view }: { open: boolean; onClose: () => void; view: PaymentsView }) {
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { min } = view.limits.deposit;
  const max = Math.min(view.limits.deposit.max, view.depositRoom);
  const full = max < min;
  const value = Number(amount);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/payments/deposit', {
        token: getSessionToken(),
        body: { amount: value, ...(view.phone ? {} : { phone }) },
      });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dépôt impossible.');
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="Déposer avec Wave" onClose={onClose}>
      {full ? (
        <div className="flex flex-col gap-4 pt-1">
          <p className="rounded-2xl bg-white/[0.06] px-4 py-3 text-[14px] leading-relaxed text-[#d1d7db]">
            Ton portefeuille Premium est plein : il est plafonné à <strong className="tabular-nums">{view.walletCap.toLocaleString('fr-FR')}</strong> pièces,
            dépôts en attente compris. Joue ou retire une partie de ton solde avant de recharger.
          </p>
          <button type="button" onClick={onClose} className="h-12 rounded-full bg-white/[0.08] text-[15px] font-semibold">
            Compris
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
          <AmountField value={amount} onChange={setAmount} min={min} max={max} />
          <div className="flex flex-wrap gap-2">
            {DEPOSIT_PRESETS.filter((p) => p >= min && p <= max).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(String(p))}
                className={`h-9 rounded-full px-3.5 text-[13.5px] font-semibold tabular-nums ${value === p ? 'bg-[#00a884] text-[#0b141a]' : 'bg-white/[0.07] text-[#d1d7db]'}`}
              >
                {fcfa(p)}
              </button>
            ))}
          </div>
          <PhoneField view={view} value={phone} onChange={setPhone} />
          {value >= min && (
            <p className="flex items-center justify-center gap-1.5 text-[14px] text-[#d1d7db]">
              Tu recevras <strong className="tabular-nums">{value.toLocaleString('fr-FR')}</strong>
              <GemIcon size={16} /> sans frais
            </p>
          )}
          {error && <p className="rounded-xl bg-[#f15c6d]/10 px-3 py-2.5 text-[13.5px] text-[#f15c6d]">{error}</p>}
          <button
            type="submit"
            disabled={busy || value < min || value > max || (!view.phone && !phone.trim())}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#1dc3f0] text-[15px] font-bold text-[#0b141a] disabled:opacity-50"
          >
            {busy ? 'Ouverture de Wave…' : 'Payer avec Wave'}
          </button>
          <p className="text-center text-[12px] leading-snug text-[#8696a0]">
            Tu vas être redirigé vers Wave pour confirmer le paiement. Tes pièces sont créditées dès que Wave le confirme.
          </p>
          <p className="-mt-2 text-center text-[12px] text-[#8696a0]">Solde Premium plafonné à {view.walletCap.toLocaleString('fr-FR')} pièces.</p>
        </form>
      )}
    </Sheet>
  );
}

export function WithdrawSheet({
  open,
  onClose,
  view,
  balance,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  view: PaymentsView;
  balance: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { min, perDay } = view.limits.withdrawal;
  const locked = Math.min(view.bonus.locked, balance);
  const withdrawable = balance - locked;
  const max = Math.min(withdrawable, perDay);
  const value = Number(amount);
  const pending = view.payments.some((p) => p.kind === 'withdrawal' && p.status === 'pending');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/payments/withdraw', {
        token: getSessionToken(),
        body: { amount: value, ...(view.phone ? {} : { phone }) },
      });
      setAmount('');
      void refreshProfile();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retrait impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="Retirer sur Wave" onClose={onClose}>
      {pending ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-[#ffbc38]/15 text-[#ffbc38]">
            <Icon.Hourglass size={28} />
          </span>
          <p className="text-[15px] font-medium">Un retrait est déjà en cours</p>
          <p className="text-[13px] text-[#8696a0]">Tu pourras en demander un autre dès qu’il aura été traité.</p>
        </div>
      ) : withdrawable < min ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-white/[0.06] text-[#aebac1]">
            <GemIcon size={28} />
          </span>
          <p className="text-[15px] font-medium">Solde retirable insuffisant</p>
          <p className="text-[13px] text-[#8696a0]">Il faut au moins {fcfa(min)} en pièces Premium retirables pour demander un retrait.</p>
          {locked > 0 && <BonusNotice locked={locked} wagerDue={view.bonus.wagerDue} />}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
          {locked > 0 && <BonusNotice locked={locked} wagerDue={view.bonus.wagerDue} />}
          <AmountField value={amount} onChange={setAmount} min={min} max={max} />
          <button type="button" onClick={() => setAmount(String(max))} className="-mt-2 self-start text-[13.5px] font-semibold text-[#00a884]">
            Tout retirer ({fcfa(max)})
          </button>
          <PhoneField view={view} value={phone} onChange={setPhone} />
          <p className="flex gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-3 text-[12.5px] leading-snug text-[#aebac1]">
            <Icon.Info size={18} className="mt-px shrink-0 text-[#8696a0]" />
            Tes pièces sont mises de côté tout de suite. L’équipe LuChat envoie l’argent sur ton compte Wave, en général sous 24 h. Si le retrait est refusé,
            tes pièces te sont rendues.
          </p>
          {error && <p className="rounded-xl bg-[#f15c6d]/10 px-3 py-2.5 text-[13.5px] text-[#f15c6d]">{error}</p>}
          <button
            type="submit"
            disabled={busy || value < min || value > max || (!view.phone && !phone.trim())}
            className="h-12 rounded-full bg-[#00a884] text-[15px] font-bold text-[#0b141a] disabled:opacity-50"
          >
            {busy ? 'Envoi…' : value >= min ? `Demander ${fcfa(value)}` : 'Demander le retrait'}
          </button>
        </form>
      )}
    </Sheet>
  );
}

/** Why part of the balance can't be withdrawn yet: a referral bonus still to be staked. */
function BonusNotice({ locked, wagerDue }: { locked: number; wagerDue: number }) {
  return (
    <p className="flex gap-2 rounded-2xl bg-[#ffbc38]/10 px-3.5 py-3 text-left text-[12.5px] leading-snug text-[#ffd279]">
      <Icon.Gift size={18} className="mt-px shrink-0" />
      <span>
        <strong className="tabular-nums">{locked.toLocaleString('fr-FR')}</strong> pièces de bonus sont bloquées. Mise encore{' '}
        <strong className="tabular-nums">{wagerDue.toLocaleString('fr-FR')}</strong> pièces Premium en parties pour pouvoir les retirer.
      </span>
    </p>
  );
}

const STATUS = {
  deposit: {
    pending: 'En attente de paiement',
    succeeded: 'Crédité',
    failed: 'Non abouti',
  },
  withdrawal: {
    pending: 'En cours de traitement',
    succeeded: 'Envoyé sur Wave',
    failed: 'Refusé, remboursé',
  },
} as const;

const STATUS_TONE = {
  pending: 'text-[#ffbc38]',
  succeeded: 'text-[#25d366]',
  failed: 'text-[#8696a0]',
} as const;

export function PaymentsList({ payments }: { payments: PaymentLine[] }) {
  if (payments.length === 0) return null;
  return (
    <section>
      <h2 className="px-5 pb-1.5 text-[13px] font-medium text-[#00a884]">Dépôts et retraits Wave</h2>
      <ul className="mx-4 divide-y divide-white/[0.06] overflow-hidden rounded-[24px] bg-[#1f2c33]">
        {payments.map((p) => (
          <li key={p.reference} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1dc3f0]/12 text-[#1dc3f0]">
              {p.kind === 'deposit' ? <Icon.Add size={20} /> : <Icon.Forward size={20} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px]">{p.kind === 'deposit' ? 'Dépôt' : 'Retrait'}</span>
              <span className="block truncate text-[12px] text-[#8696a0]">
                {shortDate.format(p.createdAt)} · <span className={STATUS_TONE[p.status]}>{STATUS[p.kind][p.status]}</span>
              </span>
              {p.note && p.kind === 'withdrawal' && p.status === 'failed' && <span className="block text-[12px] text-[#8696a0]">Motif : {p.note}</span>}
            </span>
            <span className="shrink-0 text-[15px] font-bold tabular-nums">{fcfa(p.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shown when Wave sends the player back: follows the deposit until Wave confirms it. */
export function DepositReturn({ reference, failed, onSettled }: { reference: string; failed: boolean; onSettled: () => void }) {
  const [state, setState] = useState<{
    status: PaymentLine['status'];
    amount: number;
  } | null>(null);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const check = async () => {
      try {
        const result = await api<{
          status: PaymentLine['status'];
          amount: number;
        }>('/payments/deposit/check', {
          token: getSessionToken(),
          body: { reference },
        });
        if (stop) return;
        setState(result);
        if (result.status !== 'pending') {
          void refreshProfile();
          onSettled();
          return;
        }
      } catch {
        if (stop) return;
      }
      if (++tries < 10) setTimeout(check, 3_000);
    };
    void check();
    return () => {
      stop = true;
    };
  }, [reference, onSettled]);

  const status = state?.status ?? 'pending';
  const tone =
    status === 'succeeded'
      ? 'bg-[#00a884]/15 text-[#25d366]'
      : status === 'failed' || failed
        ? 'bg-[#f15c6d]/10 text-[#f15c6d]'
        : 'bg-[#ffbc38]/10 text-[#ffbc38]';
  return (
    <p role="status" className={`mx-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[14px] ${tone}`}>
      {status === 'succeeded' ? <Icon.Check size={20} /> : status === 'failed' || failed ? <Icon.Info size={20} /> : <Icon.Hourglass size={20} />}
      <span>
        {status === 'succeeded'
          ? `Dépôt de ${fcfa(state!.amount)} crédité sur ton compte.`
          : status === 'failed'
            ? 'Le paiement Wave n’a pas abouti. Aucun montant n’a été prélevé.'
            : failed
              ? 'Le paiement Wave a été interrompu. Tu peux réessayer.'
              : 'Paiement reçu par Wave, confirmation en cours…'}
      </span>
    </p>
  );
}
