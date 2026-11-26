'use client';

import type { ReactNode } from 'react';
import type { BotLevel, Rules } from '@ludo/engine';
import { RULES_PRESETS, matchPreset } from '@/lib/labels';
import { Icon } from './Icons';
import { RulesForm } from './RulesForm';

export const PRESET_ICON: Record<string, (p: { size?: number }) => ReactNode> = {
  classic: Icon.Dice,
  quick: Icon.Bolt,
  strategy: Icon.Psychology,
  teams: Icon.Groups,
};

export const BOT_LEVEL_HINT: Record<BotLevel, string> = {
  easy: 'Joue au hasard, idéal pour débuter',
  medium: 'Prudent, capture quand il peut',
  hard: 'Calcule ses coups, redoutable',
};

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center rounded-full text-[#aebac1] transition active:bg-white/10"
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-5 pt-5 pb-2 text-[13px] font-medium tracking-wide text-[#00a884]">{children}</h2>;
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  leading: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="grid size-11 shrink-0 place-items-center">{leading}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] text-[#e9edef]">{title}</span>
        {subtitle && <span className="block truncate text-[13.5px] text-[#8696a0]">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-[72px] w-full items-center gap-4 px-5 py-2 text-left transition active:bg-white/5">
      {content}
    </button>
  ) : (
    <div className="flex min-h-[72px] items-center gap-4 px-5 py-2">{content}</div>
  );
}

/** Round tinted icon used as the leading element of settings rows. */
export function RowIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="grid size-11 place-items-center rounded-full" style={{ background: `${color}26`, color }}>
      {children}
    </span>
  );
}

/** Preset shortcuts followed by every rule switch, for a rules sheet. */
export function RulesEditor({ rules, onChange }: { rules: Rules; onChange?: (rules: Rules) => void }) {
  const preset = matchPreset(rules);
  return (
    <>
      {onChange ? (
        <div className="mb-4 grid grid-cols-4 gap-2">
          {RULES_PRESETS.map((p) => {
            const PIcon = PRESET_ICON[p.id] ?? Icon.Tune;
            const active = preset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.rules)}
                className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[12px] font-medium transition active:scale-95 ${
                  active ? 'bg-[#00a884] text-[#0b141a]' : 'bg-white/[0.07] text-white/80'
                }`}
              >
                <PIcon size={22} />
                {p.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mb-3 text-sm text-white/60">Seul l’hôte peut modifier les règles.</p>
      )}
      <RulesForm rules={rules} onChange={onChange} disabled={!onChange} />
    </>
  );
}
