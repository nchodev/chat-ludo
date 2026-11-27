'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERRAL_BOUNDS, referralDepositBonus, validateReferralSettings, type ReferralSettings } from '@ludo/engine';
import { Icon } from '@/components/Icons';
import { Amount, Badge, Dialog, Empty, ErrorBox, Loading, PageHeader, StatCard } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { ago, fmt } from '@/lib/format';

interface ReferralStats {
  invited: number;
  validated: number;
  depositors: number;
  depositedByInvited: number;
  cost: { free: number; premiumInviters: number; premiumWelcome: number };
  lockedPremium: number;
  topInviters: { id: number; username: string; invited: number; validated: number; depositors: number; freeEarned: number; premiumEarned: number }[];
  recent: {
    id: number;
    username: string;
    inviterId: number;
    inviter: string;
    joinedAt: number;
    games: number;
    validated: boolean;
    depositBonus: number | null;
    welcomeBonus: number | null;
  }[];
}

interface ReferralAdminView {
  settings: ReferralSettings;
  bounds: typeof REFERRAL_BOUNDS;
  minDeposit: number;
  walletCap: number;
  stats: ReferralStats;
}

/** Text fields, so a value can be emptied while typing. */
interface Draft {
  free: Record<keyof ReferralSettings['free'], string>;
  deposit: { enabled: boolean } & Record<Exclude<keyof ReferralSettings['deposit'], 'enabled'>, string>;
}

const toDraft = (s: ReferralSettings): Draft => ({
  free: {
    gamesNeeded: String(s.free.gamesNeeded),
    referrerCoins: String(s.free.referrerCoins),
    newcomerCoins: String(s.free.newcomerCoins),
    maxRewarded: String(s.free.maxRewarded),
  },
  deposit: {
    enabled: s.deposit.enabled,
    percent: String(s.deposit.percent),
    maxBonus: String(s.deposit.maxBonus),
    wagerMultiplier: String(s.deposit.wagerMultiplier),
    maxRewarded: String(s.deposit.maxRewarded),
  },
});

const fromDraft = (d: Draft) => ({
  free: {
    gamesNeeded: Number(d.free.gamesNeeded || NaN),
    referrerCoins: Number(d.free.referrerCoins || NaN),
    newcomerCoins: Number(d.free.newcomerCoins || NaN),
    maxRewarded: Number(d.free.maxRewarded || NaN),
  },
  deposit: {
    enabled: d.deposit.enabled,
    percent: Number(d.deposit.percent || NaN),
    maxBonus: Number(d.deposit.maxBonus || NaN),
    wagerMultiplier: Number(d.deposit.wagerMultiplier || NaN),
    maxRewarded: Number(d.deposit.maxRewarded || NaN),
  },
});

const fcfa = (n: number) => `${fmt(n)} F`;
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

export default function ReferralAdminPage() {
  const { data, error, loading, reload } = useAdminData<ReferralAdminView>('/admin/referral');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(toDraft(data.settings));
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data || !draft) return null;

  const valid = validateReferralSettings(fromDraft(draft));
  const problem = typeof valid === 'string' ? valid : null;
  const dirty = JSON.stringify(toDraft(data.settings)) !== JSON.stringify(draft);
  const { bounds, stats } = data;
  const setFree = (key: keyof Draft['free'], value: string) => setDraft({ ...draft, free: { ...draft.free, [key]: digits(value) } });
  const setDeposit = (key: Exclude<keyof Draft['deposit'], 'enabled'>, value: string) =>
    setDraft({ ...draft, deposit: { ...draft.deposit, [key]: digits(value) } });

  const percent = Number(draft.deposit.percent) || 0;
  const maxBonus = Number(draft.deposit.maxBonus) || 0;
  const reachesCap = percent > 0 ? Math.ceil((maxBonus * 100) / percent) : 0;
  const premiumCost = stats.cost.premiumInviters + stats.cost.premiumWelcome;

  const save = async () => {
    if (typeof valid === 'string') return;
    setSaving(true);
    setSaveError(null);
    try {
      await adminApi('/admin/referral', { settings: valid });
      setConfirm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Parrainage"
        subtitle="Bonus versés aux parrains et à leurs filleuls, et suivi du programme"
        actions={
          <>
            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(data.settings))}>
                Annuler les changements
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={!dirty || !!problem} onClick={() => setConfirm(true)}>
              <Icon.Check size={18} />
              {saved ? 'Enregistré' : 'Enregistrer'}
            </button>
          </>
        }
      />

      {problem && dirty && (
        <div className="mb-4">
          <ErrorBox>{problem}</ErrorBox>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Icon.People size={22} />} label="Filleuls inscrits" value={fmt(stats.invited)} detail={`${fmt(stats.validated)} ont joué leurs parties`} />
        <StatCard
          icon={<Icon.Coin size={22} />}
          tone="info"
          label="Filleuls qui ont déposé"
          value={fmt(stats.depositors)}
          detail={`${fcfa(stats.depositedByInvited)} déposés au total`}
        />
        <StatCard
          icon={<Icon.Gem size={22} />}
          tone="warn"
          label="Coût Premium"
          value={fmt(premiumCost)}
          detail={`${fmt(stats.cost.premiumInviters)} parrains · ${fmt(stats.cost.premiumWelcome)} bienvenue`}
        />
        <StatCard
          icon={<Icon.Lock size={22} />}
          tone="danger"
          label="Bonus encore bloqués"
          value={fmt(stats.lockedPremium)}
          detail={`Coût Free : ${fmt(stats.cost.free)} pièces`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-4">
            <span>
              <h2 className="flex items-center gap-2 text-[16px] font-medium">
                <Icon.Gem size={20} className="text-info" />
                Bonus au premier dépôt
              </h2>
              <span className="mt-1 block text-[13.5px] text-muted">
                {draft.deposit.enabled
                  ? 'Parrain et filleul reçoivent chacun un pourcentage du premier dépôt Wave du filleul.'
                  : 'Désactivé : aucun bonus Premium n’est versé aux prochains premiers dépôts.'}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.deposit.enabled}
              aria-label={`${draft.deposit.enabled ? 'Désactiver' : 'Activer'} le bonus au premier dépôt`}
              onClick={() => setDraft({ ...draft, deposit: { ...draft.deposit, enabled: !draft.deposit.enabled } })}
              className={`relative h-8 w-14 shrink-0 rounded-full transition ${draft.deposit.enabled ? 'bg-accent' : 'bg-white/15'}`}
            >
              <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${draft.deposit.enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField label="Pourcentage" suffix="%" value={draft.deposit.percent} onChange={(v) => setDeposit('percent', v)} bounds={bounds.deposit.percent} />
            <NumberField
              label="Plafond par bonus"
              suffix="pièces"
              value={draft.deposit.maxBonus}
              onChange={(v) => setDeposit('maxBonus', v)}
              bounds={bounds.deposit.maxBonus}
            />
            <NumberField
              label="Mises avant retrait"
              suffix="×"
              value={draft.deposit.wagerMultiplier}
              onChange={(v) => setDeposit('wagerMultiplier', v)}
              bounds={bounds.deposit.wagerMultiplier}
            />
            <NumberField
              label="Filleuls payés par parrain"
              value={draft.deposit.maxRewarded}
              onChange={(v) => setDeposit('maxRewarded', v)}
              bounds={bounds.deposit.maxRewarded}
            />
          </div>
          <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-[13.5px]">
            <p className="font-medium">Exemples : parrain et filleul reçoivent chacun</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted tabular-nums">
              {[data.minDeposit, 1_000, 5_000, 10_000, 50_000]
                .filter((a, i, all) => all.indexOf(a) === i)
                .map((amount) => (
                  <li key={amount}>
                    {fcfa(amount)} → {problem ? '—' : fmt(referralDepositBonus(amount, percent, maxBonus))}
                  </li>
                ))}
            </ul>
            {!problem && (
              <p className="mt-2 text-[12.5px] text-muted">
                Plafond atteint dès {fcfa(reachesCap)} déposés. Le bonus doit être misé {Number(draft.deposit.wagerMultiplier) > 1 ? `${draft.deposit.wagerMultiplier} fois` : 'une fois'}{' '}
                en parties Premium avant de pouvoir être retiré.
              </p>
            )}
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Tout premier dépôt compte, dès {fcfa(data.minDeposit)} (le dépôt minimum Wave). Une seule fois par filleul. Un bonus ne fait jamais dépasser le
            plafond du portefeuille Premium ({fmt(data.walletCap)}). Le filleul reçoit son bonus même quand son parrain a atteint sa limite.
          </p>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[16px] font-medium">
            <Icon.Coin size={20} className="text-warn" />
            Bonus en pièces Free
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">Versé quand le filleul a joué assez de parties en ligne contre de vrais joueurs.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField label="Parties à jouer" value={draft.free.gamesNeeded} onChange={(v) => setFree('gamesNeeded', v)} bounds={bounds.free.gamesNeeded} />
            <NumberField
              label="Filleuls récompensés par parrain"
              value={draft.free.maxRewarded}
              onChange={(v) => setFree('maxRewarded', v)}
              bounds={bounds.free.maxRewarded}
            />
            <NumberField
              label="Pièces du parrain"
              suffix="Free"
              value={draft.free.referrerCoins}
              onChange={(v) => setFree('referrerCoins', v)}
              bounds={bounds.free.referrerCoins}
            />
            <NumberField
              label="Pièces du filleul"
              suffix="Free"
              value={draft.free.newcomerCoins}
              onChange={(v) => setFree('newcomerCoins', v)}
              bounds={bounds.free.newcomerCoins}
            />
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Mettez 0 pièce aux deux pour ne plus verser de bonus Free. Les filleuls qui ont déjà joué leurs parties ne sont pas concernés par un changement.
          </p>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="text-[16px] font-medium">Meilleurs parrains</h2>
        {stats.topInviters.length === 0 ? (
          <Empty icon={<Icon.People size={28} />}>Aucun filleul pour l’instant.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Parrain</th>
                  <th className="text-right">Filleuls</th>
                  <th className="text-right">Parties jouées</th>
                  <th className="text-right">Ont déposé</th>
                  <th className="text-right">Gagné</th>
                </tr>
              </thead>
              <tbody>
                {stats.topInviters.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/joueurs/${r.id}`} className="text-info hover:underline">
                        {r.username}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{fmt(r.invited)}</td>
                    <td className="text-right tabular-nums">{fmt(r.validated)}</td>
                    <td className="text-right tabular-nums">{fmt(r.depositors)}</td>
                    <td className="text-right">
                      <span className="inline-flex flex-wrap justify-end gap-x-3">
                        <Amount value={r.freeEarned} currency="free" />
                        <Amount value={r.premiumEarned} currency="premium" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-[16px] font-medium">Derniers filleuls</h2>
        {stats.recent.length === 0 ? (
          <Empty icon={<Icon.People size={28} />}>Aucun filleul pour l’instant.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Filleul</th>
                  <th>Parrain</th>
                  <th>Inscrit</th>
                  <th>Parties</th>
                  <th className="text-right">Premier dépôt (parrain / filleul)</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/joueurs/${r.id}`} className="text-info hover:underline">
                        {r.username}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/joueurs/${r.inviterId}`} className="text-info hover:underline">
                        {r.inviter}
                      </Link>
                    </td>
                    <td className="text-muted">{ago(r.joinedAt)}</td>
                    <td>{r.validated ? <Badge tone="accent">validé</Badge> : <span className="tabular-nums text-muted">{fmt(r.games)}</span>}</td>
                    <td className="text-right">
                      {r.depositBonus === null && r.welcomeBonus === null ? (
                        <span className="text-muted">pas encore</span>
                      ) : (
                        <span className="inline-flex gap-1.5 tabular-nums">
                          <Amount value={r.depositBonus ?? 0} currency="premium" /> / <Amount value={r.welcomeBonus ?? 0} currency="premium" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={confirm} title="Appliquer les réglages du parrainage ?" onClose={() => setConfirm(false)}>
        {typeof valid !== 'string' && (
          <div className="flex flex-col gap-3 text-[14px]">
            <p className="text-muted">Les changements s’appliquent aux prochains bonus. Ceux déjà versés ne changent pas.</p>
            <p>
              Premier dépôt :{' '}
              {valid.deposit.enabled ? (
                <span className="font-medium">
                  {valid.deposit.percent} % chacun, au plus {fmt(valid.deposit.maxBonus)} pièces, à miser {valid.deposit.wagerMultiplier} fois,{' '}
                  {fmt(valid.deposit.maxRewarded)} filleuls payés par parrain
                </span>
              ) : (
                <span className="font-medium text-warn">désactivé</span>
              )}
            </p>
            <p>
              Free :{' '}
              <span className="font-medium">
                {fmt(valid.free.referrerCoins)} pour le parrain et {fmt(valid.free.newcomerCoins)} pour le filleul après {valid.free.gamesNeeded} parties,{' '}
                {fmt(valid.free.maxRewarded)} filleuls récompensés par parrain
              </span>
            </p>
            {saveError && <ErrorBox>{saveError}</ErrorBox>}
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                Appliquer
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
  bounds,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  bounds: { min: number; max: number };
  suffix?: string;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <span className="relative block">
        <input className={`field tabular-nums ${suffix ? 'pr-16' : ''}`} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">{suffix}</span>}
      </span>
      <span className="mt-1 block text-[11.5px] text-muted">
        {fmt(bounds.min)} à {fmt(bounds.max)}
      </span>
    </label>
  );
}
