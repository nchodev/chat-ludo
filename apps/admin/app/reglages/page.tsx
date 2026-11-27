'use client';

import {
  MAX_TABLES_PER_CURRENCY,
  MAX_WALLET_CAP,
  MAX_WINNER_SHARE,
  MIN_WALLET_CAP,
  MIN_WINNER_SHARE,
  potSplit,
  validateStakeConfig,
  type StakeConfig,
} from '@ludo/engine';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';
import { Amount, Dialog, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { CURRENCY_NAME, fmt, type Currency } from '@/lib/format';

interface Draft {
  premiumEnabled: boolean;
  walletCap: string;
  winnerPercent: string;
  tables: Record<Currency, string[]>;
}

function toDraft(config: StakeConfig): Draft {
  return {
    premiumEnabled: config.premiumEnabled,
    walletCap: String(config.premiumWalletCap),
    winnerPercent: String(Math.round(config.winnerShare * 100)),
    tables: {
      free: config.tables.filter((t) => t.currency === 'free').map((t) => String(t.stake)),
      premium: config.tables.filter((t) => t.currency === 'premium').map((t) => String(t.stake)),
    },
  };
}

function fromDraft(draft: Draft) {
  return {
    premiumEnabled: draft.premiumEnabled,
    premiumWalletCap: Number(draft.walletCap),
    winnerShare: Number(draft.winnerPercent) / 100,
    tables: (['free', 'premium'] as const).flatMap((currency) =>
      draft.tables[currency].map((stake) => ({
        currency,
        stake: Number(stake),
      })),
    ),
  };
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useAdminData<StakeConfig>('/admin/settings');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(toDraft(data));
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data || !draft) return null;

  const candidate = fromDraft(draft);
  const valid = validateStakeConfig(candidate);
  const problem = typeof valid === 'string' ? valid : null;
  const dirty = JSON.stringify(toDraft(data)) !== JSON.stringify(draft);
  const share = Number(draft.winnerPercent) / 100;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await adminApi('/admin/settings', candidate);
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

  const setTable = (currency: Currency, index: number, value: string) =>
    setDraft({
      ...draft,
      tables: {
        ...draft.tables,
        [currency]: draft.tables[currency].map((v, i) => (i === index ? value.replace(/\D/g, '') : v)),
      },
    });
  const removeTable = (currency: Currency, index: number) =>
    setDraft({
      ...draft,
      tables: {
        ...draft.tables,
        [currency]: draft.tables[currency].filter((_, i) => i !== index),
      },
    });
  const addTable = (currency: Currency) => {
    const last = Number(draft.tables[currency].at(-1) ?? 0);
    setDraft({
      ...draft,
      tables: {
        ...draft.tables,
        [currency]: [...draft.tables[currency], String(last ? last * 2 : 100)],
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Réglages des mises"
        subtitle="Tables proposées en partie rapide et dans les salons, et part de la cagnotte versée au gagnant"
        actions={
          <>
            {dirty && (
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(data))}>
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

      <section className="card mb-4 flex items-center justify-between gap-4 p-5">
        <span>
          <h2 className="flex items-center gap-2 text-[16px] font-medium">
            <Icon.Gem size={20} className="text-info" />
            Mode Premium
          </h2>
          <span className="mt-1 block text-[13.5px] text-muted">
            {draft.premiumEnabled
              ? 'Activé : tables Premium, mises Premium en salon et achat de pièces avec Wave.'
              : 'Désactivé partout : aucune table ni mise Premium, aucun achat. Les joueurs peuvent toujours retirer leur solde ; les parties en cours se terminent normalement.'}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.premiumEnabled}
          aria-label={`${draft.premiumEnabled ? 'Désactiver' : 'Activer'} le mode Premium`}
          onClick={() => setDraft({ ...draft, premiumEnabled: !draft.premiumEnabled })}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${draft.premiumEnabled ? 'bg-accent' : 'bg-white/15'}`}
        >
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${draft.premiumEnabled ? 'left-7' : 'left-1'}`} />
        </button>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="text-[16px] font-medium">Plafond du portefeuille Premium</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          Solde Premium maximum par joueur. Les dépôts s’arrêtent au plafond (dépôts en attente compris). Un joueur qui le dépasse grâce à ses gains garde ses
          pièces et continue de jouer en Premium ; il ne peut simplement plus déposer tant qu’il est au-dessus.
        </p>
        <label className="mt-4 flex items-center gap-2">
          <input
            className="field w-40"
            inputMode="numeric"
            value={draft.walletCap}
            onChange={(e) =>
              setDraft({
                ...draft,
                walletCap: e.target.value.replace(/\D/g, '').slice(0, 7),
              })
            }
            aria-label="Plafond du portefeuille Premium"
          />
          <span className="text-muted">pièces (1 pièce = 1 F CFA)</span>
        </label>
        <p className="mt-2 text-[12.5px] text-muted">
          Entre {fmt(MIN_WALLET_CAP)} et {fmt(MAX_WALLET_CAP)}.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-[16px] font-medium">Part du gagnant</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          Le reste de la cagnotte est la commission de la plateforme. Les parties déjà lancées gardent leur pourcentage.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <input
            type="range"
            min={MIN_WINNER_SHARE * 100}
            max={MAX_WINNER_SHARE * 100}
            step={1}
            value={Number(draft.winnerPercent) || 0}
            onChange={(e) => setDraft({ ...draft, winnerPercent: e.target.value })}
            className="w-64 accent-[#00a884]"
            aria-label="Part du gagnant"
          />
          <label className="flex items-center gap-2">
            <input
              className="field w-20 text-center"
              inputMode="numeric"
              value={draft.winnerPercent}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  winnerPercent: e.target.value.replace(/\D/g, '').slice(0, 3),
                })
              }
            />
            <span className="text-muted">%</span>
          </label>
          <span className="text-[13.5px] text-muted">Commission : {Math.max(0, 100 - (Number(draft.winnerPercent) || 0))} %</span>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(['free', 'premium'] as const).map((currency) => (
          <section key={currency} className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[16px] font-medium">
                {currency === 'free' ? <Icon.Coin size={20} className="text-warn" /> : <Icon.Gem size={20} className="text-info" />}
                Tables {CURRENCY_NAME[currency]}
              </h2>
              <button
                type="button"
                className="btn btn-ghost h-9"
                disabled={draft.tables[currency].length >= MAX_TABLES_PER_CURRENCY}
                onClick={() => addTable(currency)}
              >
                <Icon.Add size={18} />
                Ajouter
              </button>
            </div>
            <table className="table mt-3">
              <thead>
                <tr>
                  <th>Mise par joueur</th>
                  <th className="text-right">Gain à 2</th>
                  <th className="text-right">Gain à 4</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.tables[currency].map((stake, i) => {
                  const n = Number(stake);
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className="field h-9 w-32"
                          inputMode="numeric"
                          value={stake}
                          onChange={(e) => setTable(currency, i, e.target.value)}
                          aria-label="Mise"
                        />
                      </td>
                      <td className="text-right">{n > 0 && share > 0 ? <Amount value={potSplit(n, 2, share).prize} currency={currency} /> : '—'}</td>
                      <td className="text-right">{n > 0 && share > 0 ? <Amount value={potSplit(n, 4, share).prize} currency={currency} /> : '—'}</td>
                      <td className="w-12">
                        <button
                          type="button"
                          className="grid size-9 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                          onClick={() => removeTable(currency, i)}
                          aria-label="Retirer la table"
                        >
                          <Icon.Delete size={19} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {currency === 'premium' && !draft.premiumEnabled && (
              <p className="pt-3 text-[13.5px] text-warn">Mode Premium désactivé : ces tables sont conservées mais ne sont proposées à personne.</p>
            )}
            {draft.tables[currency].length === 0 && (
              <p className="pt-3 text-[13.5px] text-muted">Aucune table : les parties {CURRENCY_NAME[currency]} ne seront plus proposées.</p>
            )}
          </section>
        ))}
      </div>

      <Dialog open={confirm} title="Appliquer les nouveaux réglages ?" onClose={() => setConfirm(false)}>
        {typeof valid !== 'string' && (
          <div className="flex flex-col gap-3 text-[14px]">
            <p className="text-muted">Les joueurs verront les nouvelles tables à leur prochaine visite. Les parties en cours ne changent pas.</p>
            {valid.premiumEnabled !== data.premiumEnabled && (
              <p className={valid.premiumEnabled ? '' : 'text-warn'}>
                Mode Premium : <span className="font-medium">{valid.premiumEnabled ? 'activé' : 'désactivé'}</span>
                {!valid.premiumEnabled && ' (les recherches de partie Premium en cours sont annulées)'}
              </p>
            )}
            {valid.premiumWalletCap !== data.premiumWalletCap && (
              <p>
                Plafond du portefeuille Premium : {fmt(data.premiumWalletCap)} → <span className="font-medium">{fmt(valid.premiumWalletCap)}</span>
              </p>
            )}
            <p>
              Gagnant : <span className="font-medium">{Math.round(valid.winnerShare * 100)} %</span> de la cagnotte
            </p>
            <p>
              Tables :{' '}
              {valid.tables.map((t) => (
                <span key={t.id} className="mr-2 inline-block">
                  <Amount value={t.stake} currency={t.currency} />
                </span>
              ))}
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
      <p className="mt-4 text-[12.5px] text-muted">
        Mise maximale par table : {fmt(1_000_000)} · {MAX_TABLES_PER_CURRENCY} tables au plus par monnaie.
      </p>
    </>
  );
}
