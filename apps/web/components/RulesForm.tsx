'use client';

import type { Rules } from '@ludo/engine';

type BooleanRule = {
  [K in keyof Rules]: Rules[K] extends boolean ? K : never;
}[keyof Rules];

const TOGGLES: { key: BooleanRule; icon: string; label: string; hint: string }[] = [
  { key: 'threeSixesForfeit', icon: '🎲', label: 'Trois 6 = tour perdu', hint: 'Trois 6 d’affilée font passer le tour.' },
  { key: 'exactFinish', icon: '🎯', label: 'Arrivée exacte', hint: 'Il faut le chiffre exact pour atteindre le centre.' },
  { key: 'safeSquares', icon: '⭐', label: 'Cases sûres', hint: 'Les étoiles et cases de départ protègent des captures.' },
  { key: 'blocks', icon: '🧱', label: 'Blocages', hint: 'Deux pions de même couleur forment un mur infranchissable.' },
  { key: 'bonusOnCapture', icon: '💥', label: 'Bonus de capture', hint: 'Capturer un pion donne un tour supplémentaire.' },
  { key: 'bonusOnFinish', icon: '🏠', label: 'Bonus d’arrivée', hint: 'Amener un pion au centre donne un tour supplémentaire.' },
  {
    key: 'mustCaptureToEnterHome',
    icon: '⚔️',
    label: 'Capture obligatoire',
    hint: 'Il faut avoir capturé au moins une fois pour entrer dans son couloir.',
  },
  { key: 'teams', icon: '🤝', label: 'Équipes 2 contre 2', hint: 'Rouge + Jaune contre Vert + Bleu (4 joueurs).' },
];

interface RulesFormProps {
  rules: Rules;
  onChange?: (rules: Rules) => void;
  disabled?: boolean;
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-black/25 p-1">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`chip-toggle flex-1 disabled:active:scale-100 ${value === v ? 'bg-white text-slate-900 shadow' : 'text-white/80'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function RulesForm({ rules, onChange, disabled }: RulesFormProps) {
  const update = (patch: Partial<Rules>) => onChange?.({ ...rules, ...patch });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Sortir un pion de la base avec</span>
        <Segmented
          options={[
            ['six', 'Un 6'],
            ['oneOrSix', 'Un 1 ou un 6'],
          ]}
          value={rules.exitOn}
          onChange={(exitOn) => update({ exitOn })}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Pions par joueur</span>
        <Segmented
          options={[
            [1, '1'],
            [2, '2'],
            [3, '3'],
            [4, '4'],
          ]}
          value={rules.pawnsPerPlayer}
          onChange={(pawnsPerPlayer) => update({ pawnsPerPlayer })}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-2xl bg-white/[0.04]">
        {TOGGLES.map(({ key, icon, label, hint }) => (
          <label key={key} className={`flex items-center gap-3 px-3 py-3 ${disabled ? '' : 'cursor-pointer'}`}>
            <span className="text-xl">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-white/60">{hint}</span>
            </span>
            <input
              type="checkbox"
              checked={rules[key]}
              disabled={disabled}
              onChange={(e) => update({ [key]: e.target.checked })}
              className="peer sr-only"
            />
            <span className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-emerald-500 peer-disabled:opacity-60 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
          </label>
        ))}
      </div>
    </div>
  );
}
