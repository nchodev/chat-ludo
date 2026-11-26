'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';
import { Badge, Dialog, ErrorBox, Loading } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { fmt } from '@/lib/format';

interface ProviderSettings {
  depositsOpen: boolean;
  withdrawalsOpen: boolean;
  deposit: { min: number; max: number };
  withdrawal: { min: number; perDay: number };
}

interface SettingsView {
  bounds: { min: number; max: number };
  providers: { id: string; name: string; configured: boolean; settings: ProviderSettings }[];
}

interface Draft {
  depositsOpen: boolean;
  withdrawalsOpen: boolean;
  depositMin: string;
  depositMax: string;
  withdrawalMin: string;
  perDay: string;
}

const toDraft = (s: ProviderSettings): Draft => ({
  depositsOpen: s.depositsOpen,
  withdrawalsOpen: s.withdrawalsOpen,
  depositMin: String(s.deposit.min),
  depositMax: String(s.deposit.max),
  withdrawalMin: String(s.withdrawal.min),
  perDay: String(s.withdrawal.perDay),
});

const fromDraft = (d: Draft): ProviderSettings => ({
  depositsOpen: d.depositsOpen,
  withdrawalsOpen: d.withdrawalsOpen,
  deposit: { min: Number(d.depositMin), max: Number(d.depositMax) },
  withdrawal: { min: Number(d.withdrawalMin), perDay: Number(d.perDay) },
});

const fcfa = (n: number) => `${fmt(n)} F`;

function problemOf(d: Draft, bounds: SettingsView['bounds']): string | null {
  const values: [string, string][] = [
    ['Dépôt minimum', d.depositMin],
    ['Dépôt maximum', d.depositMax],
    ['Retrait minimum', d.withdrawalMin],
    ['Retraits par 24 h', d.perDay],
  ];
  for (const [label, value] of values) {
    const n = Number(value);
    if (!value || n < bounds.min || n > bounds.max) return `${label} : entre ${fcfa(bounds.min)} et ${fcfa(bounds.max)}.`;
  }
  if (Number(d.depositMin) > Number(d.depositMax)) return 'Le dépôt minimum dépasse le dépôt maximum.';
  if (Number(d.withdrawalMin) > Number(d.perDay)) return 'Le retrait minimum dépasse le plafond par 24 h.';
  return null;
}

export function PaymentSettings() {
  const { data, error, loading, reload } = useAdminData<SettingsView>('/admin/payments/settings');
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-4">
      {data.providers.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} bounds={data.bounds} onSaved={reload} />
      ))}
    </div>
  );
}

function ProviderCard({ provider, bounds, onSaved }: { provider: SettingsView['providers'][number]; bounds: SettingsView['bounds']; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => toDraft(provider.settings));
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(toDraft(provider.settings)), [provider.settings]);

  const dirty = JSON.stringify(toDraft(provider.settings)) !== JSON.stringify(draft);
  const problem = problemOf(draft, bounds);
  const next = fromDraft(draft);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 7);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await adminApi('/admin/payments/settings', { provider: provider.id, settings: next });
      setConfirm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[16px] font-medium">
          {provider.name}
          {provider.configured ? <Badge tone="accent">clés configurées</Badge> : <Badge tone="warn">clés manquantes sur le serveur</Badge>}
        </h2>
        <div className="flex gap-2">
          {dirty && (
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(provider.settings))}>
              Annuler les changements
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!dirty || !!problem} onClick={() => setConfirm(true)}>
            <Icon.Check size={18} />
            {saved ? 'Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </div>
      {!provider.configured && (
        <p className="mt-2 text-[13.5px] text-muted">
          Tant que les clés {provider.name} ne sont pas définies sur le serveur, les dépôts restent fermés quel que soit ce réglage.
        </p>
      )}
      {problem && dirty && (
        <div className="mt-4">
          <ErrorBox>{problem}</ErrorBox>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4">
          <Switch label="Dépôts" hint={draft.depositsOpen ? 'Les joueurs peuvent recharger' : 'Bouton Déposer désactivé'} on={draft.depositsOpen} onChange={(v) => set({ depositsOpen: v })} />
          <div className="grid grid-cols-2 gap-3">
            <AmountInput label="Minimum" value={draft.depositMin} onChange={(v) => set({ depositMin: digits(v) })} />
            <AmountInput label="Maximum" value={draft.depositMax} onChange={(v) => set({ depositMax: digits(v) })} />
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4">
          <Switch
            label="Retraits"
            hint={draft.withdrawalsOpen ? 'Les joueurs peuvent demander un retrait' : 'Bouton Retirer désactivé'}
            on={draft.withdrawalsOpen}
            onChange={(v) => set({ withdrawalsOpen: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <AmountInput label="Minimum" value={draft.withdrawalMin} onChange={(v) => set({ withdrawalMin: digits(v) })} />
            <AmountInput label="Plafond par 24 h" value={draft.perDay} onChange={(v) => set({ perDay: digits(v) })} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        1 F = 1 pièce Premium. Montants entre {fcfa(bounds.min)} et {fcfa(bounds.max)}. Les retraits déjà demandés ne sont pas concernés.
      </p>

      <Dialog open={confirm} title={`Appliquer les réglages ${provider.name} ?`} onClose={() => setConfirm(false)}>
        <div className="flex flex-col gap-3 text-[14px]">
          <p>
            Dépôts : <span className="font-medium">{next.depositsOpen ? 'ouverts' : 'fermés'}</span>, de {fcfa(next.deposit.min)} à {fcfa(next.deposit.max)}
          </p>
          <p>
            Retraits : <span className="font-medium">{next.withdrawalsOpen ? 'ouverts' : 'fermés'}</span>, à partir de {fcfa(next.withdrawal.min)}, au plus{' '}
            {fcfa(next.withdrawal.perDay)} par 24 h
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
      </Dialog>
    </section>
  );
}

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? 'Fermer' : 'Ouvrir'} les ${label.toLowerCase()}`}
        onClick={() => onChange(!on)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-white/15'}`}
      >
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  );
}

function AmountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="label">{label}</span>
      <span className="relative block">
        <input className="field pr-9 tabular-nums" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">F</span>
      </span>
    </label>
  );
}
