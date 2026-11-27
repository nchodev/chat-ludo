'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import type { Currency } from '@ludo/engine';
import { useAdultGate } from '@/components/AdultNotice';
import { AppBar } from '@/components/AppBar';
import { CoinAmount, CoinIcon, GemIcon } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { DepositReturn, DepositSheet, PaymentsList, WithdrawSheet, type PaymentsView } from '@/components/WavePayments';
import { api } from '@/lib/api';
import { getSessionToken, useProfile } from '@/lib/profile';

interface LedgerLine {
  id: number;
  currency: Currency;
  delta: number;
  reason: string;
  createdAt: number;
}

type IconComponent = ComponentType<{ size?: number; className?: string }>;

const REASONS: Record<string, { label: string; icon: IconComponent }> = {
  stake: { label: 'Mise sur une partie', icon: Icon.Dice },
  prize: { label: 'Cagnotte gagnée', icon: Icon.Trophy },
  refund: { label: 'Mise remboursée', icon: Icon.Undo },
  forfeit: { label: 'Mise perdue (abandon)', icon: Icon.Block },
  admin: { label: 'Ajustement du support', icon: Icon.Shield },
  daily: { label: 'Bonus du jour', icon: Icon.Gift },
  shop: { label: 'Achat en boutique', icon: Icon.Cart },
  game: { label: 'Partie : gains, défis et niveau', icon: Icon.Medal },
  tutorial: { label: 'Tutoriel terminé', icon: Icon.School },
  quest: { label: 'Défi de la semaine', icon: Icon.Calendar },
  referral: { label: 'Parrainage', icon: Icon.PersonAdd },
  referral_deposit: { label: 'Bonus parrainage : 1er dépôt d’un ami', icon: Icon.Gift },
  referral_welcome: { label: 'Bonus de bienvenue : 1er dépôt', icon: Icon.Gift },
  tournament: { label: 'Tournoi', icon: Icon.Crown },
  deposit: { label: 'Dépôt Mobile Money', icon: Icon.Add },
  withdrawal: { label: 'Retrait Mobile Money', icon: Icon.Forward },
  withdrawal_refund: { label: 'Retrait refusé, remboursé', icon: Icon.Undo },
};

const PAGE = 30;
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function dayLabel(ms: number) {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Aujourd’hui';
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  const label = longDay.format(date);
  return label[0].toUpperCase() + label.slice(1);
}

type Filter = 'all' | Currency;

export default function WalletPage() {
  const { session, ready, profile, premiumCoins } = useProfile();
  const { gate, notice } = useAdultGate();
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [payments, setPayments] = useState<PaymentsView | null>(null);
  const [sheet, setSheet] = useState<'deposit' | 'withdraw' | null>(null);
  const [returned, setReturned] = useState<{ reference: string; failed: boolean } | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      setPayments(await api<PaymentsView>('/payments', { token: getSessionToken() }));
    } catch {
      setPayments(null);
    }
  }, []);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    setError(null);
    try {
      const { ledger } = await api<{ ledger: LedgerLine[] }>(`/wallet${before ? `?before=${before}` : ''}`, { token: getSessionToken() });
      setLines((prev) => (before ? [...prev, ...ledger] : ledger));
      setMore(ledger.length === PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historique indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && session) {
      void load();
      void loadPayments();
    } else if (ready) setLoading(false);
  }, [ready, session, load, loadPayments]);

  // Wave sends the player back here with the deposit's reference.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('depot');
    if (!reference) return;
    setReturned({ reference, failed: params.has('echec') });
    window.history.replaceState(null, '', '/portefeuille');
  }, []);

  const onDepositSettled = useCallback(() => {
    void load();
    void loadPayments();
  }, [load, loadPayments]);

  const shown = lines.filter((l) => filter === 'all' || l.currency === filter);
  const groups: { day: string; items: LedgerLine[] }[] = [];
  for (const line of shown) {
    const day = dayLabel(line.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(line);
    else groups.push({ day, items: [line] });
  }

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title="Portefeuille" subtitle="Historique de tes pièces" backHref="/?tab=profile" backText="Profil" backLabel="Retour au profil" />

      <main className="mx-auto flex max-w-lg flex-col gap-4 pt-4 pb-16">
        <section className="mx-4 grid grid-cols-2 gap-3">
          <div className="rounded-[24px] bg-gradient-to-br from-amber-500/25 to-orange-600/10 p-4">
            <span className="flex items-center gap-1.5 text-[12.5px] text-[#d1d7db]">
              <CoinIcon size={16} />
              Pièces Free
            </span>
            <CoinAmount value={profile.coins} size={22} className="mt-2 text-[24px]" />
            <p className="mt-1 text-[11.5px] text-[#aebac1]">Gagnées en jouant</p>
          </div>
          <div className="rounded-[24px] bg-gradient-to-br from-violet-600/30 to-indigo-700/10 p-4">
            <span className="flex items-center gap-1.5 text-[12.5px] text-[#d1d7db]">
              <GemIcon size={16} />
              Pièces Premium
            </span>
            <CoinAmount value={premiumCoins} premium size={22} className="mt-2 text-[24px]" />
            <p className="mt-1 text-[11.5px] text-[#aebac1]">
              {payments && payments.bonus.locked > 0
                ? `dont ${Math.min(payments.bonus.locked, premiumCoins).toLocaleString('fr-FR')} de bonus à miser`
                : 'Achetées'}
            </p>
          </div>
        </section>

        {session && payments && (
          <section className="mx-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => gate(() => setSheet('deposit'))}
              disabled={!payments.depositsEnabled}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#1dc3f0] text-[14.5px] font-bold text-[#0b141a] disabled:opacity-50"
            >
              <Icon.Add size={20} />
              Déposer
            </button>
            <button
              type="button"
              onClick={() => setSheet('withdraw')}
              disabled={!payments.withdrawalsEnabled}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[14.5px] font-semibold text-[#e9edef] active:bg-white/5 disabled:opacity-50"
            >
              <Icon.Forward size={20} />
              Retirer
            </button>
            {(!payments.depositsEnabled || !payments.withdrawalsEnabled) && (
              <p className="col-span-2 text-center text-[12px] text-[#8696a0]">
                {!payments.premiumEnabled
                  ? `Le mode Premium est momentanément désactivé : plus d’achat de pièces ni de mise Premium.${payments.withdrawalsEnabled ? ' Tu peux toujours retirer ton solde.' : ''}`
                  : !payments.depositsEnabled && !payments.withdrawalsEnabled
                  ? 'Les dépôts et retraits Wave sont momentanément fermés.'
                  : !payments.depositsEnabled
                    ? 'Les dépôts Wave sont momentanément fermés.'
                    : 'Les retraits Wave sont momentanément fermés.'}
              </p>
            )}
          </section>
        )}

        {session && returned && <DepositReturn reference={returned.reference} failed={returned.failed} onSettled={onDepositSettled} />}

        {payments && (
          <>
            {notice}
            <DepositSheet open={sheet === 'deposit'} onClose={() => setSheet(null)} view={payments} />
            <WithdrawSheet
              open={sheet === 'withdraw'}
              onClose={() => setSheet(null)}
              view={payments}
              balance={premiumCoins}
              onDone={() => {
                setSheet(null);
                void load();
                void loadPayments();
              }}
            />
          </>
        )}

        {session && payments && <PaymentsList payments={payments.payments} />}

        {!ready || (loading && lines.length === 0) ? (
          <div className="mx-4 flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#1f2c33]" />
            ))}
          </div>
        ) : !session ? (
          <section className="mx-4 flex flex-col items-center gap-3 rounded-[28px] bg-[#1f2c33] p-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
              <Icon.Lock size={28} />
            </span>
            <p className="text-[15px] font-medium">Crée un compte pour suivre tes pièces</p>
            <p className="text-[13px] text-[#8696a0]">L’historique des gains, mises et achats est lié à ton compte.</p>
            <Link href="/compte" className="mt-1 h-11 rounded-full bg-[#00a884] px-6 text-[14.5px] leading-[44px] font-semibold text-[#0b141a]">
              Se connecter
            </Link>
          </section>
        ) : (
          <>
            <div className="mx-4 grid grid-cols-3 gap-1 rounded-full bg-[#1f2c33] p-1">
              {(
                [
                  ['all', 'Tout'],
                  ['free', 'Free'],
                  ['premium', 'Premium'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                  className={`h-9 rounded-full text-[13.5px] font-semibold transition ${filter === id ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#aebac1]'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {groups.length === 0 ? (
              <p className="mx-4 rounded-[24px] bg-[#1f2c33] px-4 py-8 text-center text-[14px] text-[#8696a0]">
                Aucun mouvement pour l’instant. Joue une partie ou récupère ton bonus du jour.
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.day}>
                  <h2 className="px-5 pb-1.5 text-[13px] font-medium text-[#00a884]">{group.day}</h2>
                  <ul className="mx-4 divide-y divide-white/[0.06] overflow-hidden rounded-[24px] bg-[#1f2c33]">
                    {group.items.map((line) => {
                      const reason = REASONS[line.reason] ?? { label: line.reason, icon: Icon.Info };
                      const ReasonIcon = reason.icon;
                      const premium = line.currency === 'premium';
                      const gain = line.delta > 0;
                      return (
                        <li key={line.id} className="flex items-center gap-3 px-4 py-3">
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-full ${
                              gain ? 'bg-[#25d366]/12 text-[#25d366]' : 'bg-white/[0.06] text-[#aebac1]'
                            }`}
                          >
                            <ReasonIcon size={20} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px]">{reason.label}</span>
                            <span className="block text-[12px] text-[#8696a0]">
                              {time.format(line.createdAt)} · {premium ? 'Premium' : 'Free'}
                            </span>
                          </span>
                          <span
                            className={`flex shrink-0 items-center gap-1 text-[15px] font-bold tabular-nums ${
                              gain ? 'text-[#25d366]' : line.delta < 0 ? 'text-[#e9edef]' : 'text-[#8696a0]'
                            }`}
                          >
                            {gain ? '+' : ''}
                            {line.delta.toLocaleString('fr-FR')}
                            {premium ? <GemIcon size={15} /> : <CoinIcon size={15} />}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}

            {more && (
              <button
                type="button"
                onClick={() => void load(lines[lines.length - 1]?.id)}
                disabled={loading}
                className="mx-4 h-11 rounded-full border border-[#2a3942] text-[14px] font-semibold text-[#00a884] active:bg-white/5 disabled:opacity-60"
              >
                {loading ? 'Chargement…' : 'Voir plus'}
              </button>
            )}
            {error && <p className="mx-4 text-center text-[13px] text-[#f15c6d]">{error}</p>}
          </>
        )}
      </main>
    </div>
  );
}
