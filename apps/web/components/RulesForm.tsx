'use client';

import type { ReactNode } from 'react';
import type { Rules } from '@ludo/engine';
import { Icon } from './Icons';
import { useLang } from '@/lib/i18n';

type BooleanRule = {
  [K in keyof Rules]: Rules[K] extends boolean ? K : never;
}[keyof Rules];

type Pair = [string, string];
const TOGGLES: { key: BooleanRule; icon: (p: { size?: number }) => ReactNode; label: Pair; hint: Pair }[] = [
  { key: 'threeSixesForfeit', icon: Icon.Dice, label: ['Trois 6 = tour perdu', 'Three 6s = turn lost'], hint: ['Trois 6 d’affilée font passer le tour.', 'Three 6s in a row skip your turn.'] },
  { key: 'exactFinish', icon: Icon.Target, label: ['Arrivée exacte', 'Exact finish'], hint: ['Il faut le chiffre exact pour atteindre le centre.', 'You need the exact number to reach the centre.'] },
  { key: 'safeSquares', icon: Icon.Star, label: ['Cases sûres', 'Safe squares'], hint: ['Les étoiles et cases de départ protègent des captures.', 'Stars and starting squares protect from captures.'] },
  { key: 'blocks', icon: Icon.Block, label: ['Blocages', 'Blocks'], hint: ['Deux pions de même couleur forment un mur infranchissable.', 'Two pawns of the same colour form a wall nobody can pass.'] },
  { key: 'bonusOnCapture', icon: Icon.Bolt, label: ['Bonus de capture', 'Capture bonus'], hint: ['Capturer un pion donne un tour supplémentaire.', 'Capturing a pawn gives an extra turn.'] },
  { key: 'bonusOnFinish', icon: Icon.Home, label: ['Bonus d’arrivée', 'Finish bonus'], hint: ['Amener un pion au centre donne un tour supplémentaire.', 'Bringing a pawn to the centre gives an extra turn.'] },
  {
    key: 'mustCaptureToEnterHome',
    icon: Icon.Shield,
    label: ['Capture obligatoire', 'Must capture'],
    hint: ['Il faut avoir capturé au moins une fois pour entrer dans son couloir.', 'You must have captured at least once to enter your lane.'],
  },
  { key: 'teams', icon: Icon.Groups, label: ['Équipes 2 contre 2', 'Teams 2 v 2'], hint: ['Rouge + Jaune contre Vert + Bleu (4 joueurs).', 'Red + Yellow vs Green + Blue (4 players).'] },
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
  const { t } = useLang();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{t('Sortir un pion de la base avec', 'Bring a pawn out of the base with')}</span>
        <Segmented
          options={[
            ['six', t('Un 6', 'A 6')],
            ['oneOrSix', t('Un 1 ou un 6', 'A 1 or a 6')],
          ]}
          value={rules.exitOn}
          onChange={(exitOn) => update({ exitOn })}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{t('Pions par joueur', 'Pawns per player')}</span>
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
        {TOGGLES.map(({ key, icon: RuleIcon, label, hint }) => (
          <label key={key} className={`flex items-center gap-3 px-3 py-3 ${disabled ? '' : 'cursor-pointer'}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white/80">
              <RuleIcon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t(...label)}</span>
              <span className="block text-xs text-white/60">{t(...hint)}</span>
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
