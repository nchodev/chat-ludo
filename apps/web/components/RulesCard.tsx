'use client';

import { useState } from 'react';
import type { Rules } from '@ludo/engine';
import { RulesForm } from './RulesForm';
import { Sheet } from './Sheet';
import { RULES_PRESETS, matchPreset, rulesSummary } from '@/lib/labels';

interface RulesCardProps {
  rules: Rules;
  onChange?: (rules: Rules) => void;
  readOnly?: boolean;
}

export function RulesCard({ rules, onChange, readOnly }: RulesCardProps) {
  const [open, setOpen] = useState(false);
  const preset = matchPreset(rules);

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Règles</h2>
        <button type="button" className="text-sm font-semibold text-emerald-300" onClick={() => setOpen(true)}>
          {readOnly ? 'Voir le détail' : 'Personnaliser ›'}
        </button>
      </div>

      {!readOnly && (
        <div className="grid grid-cols-4 gap-2">
          {RULES_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange?.(p.rules)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 text-xs font-semibold transition active:scale-95 ${
                preset?.id === p.id ? 'bg-white text-slate-900 shadow-lg' : 'bg-white/[0.06] text-white/80'
              }`}
            >
              <span className="text-xl">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {readOnly && preset && (
          <li className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-900">
            {preset.icon} {preset.label}
          </li>
        )}
        {!preset && <li className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-200">Personnalisées</li>}
        {rulesSummary(rules).map((r) => (
          <li key={r} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
            {r}
          </li>
        ))}
      </ul>

      <Sheet open={open} title="Règles et variantes" onClose={() => setOpen(false)}>
        <RulesForm rules={rules} onChange={onChange} disabled={readOnly} />
      </Sheet>
    </section>
  );
}
