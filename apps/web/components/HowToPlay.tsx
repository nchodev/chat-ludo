'use client';

import type { Rules } from '@ludo/engine';
import { rulesSummary } from '@/lib/labels';

const STEPS = [
  ['🎲', 'Lance le dé', 'Touche le dé quand c’est ton tour.'],
  ['🚀', 'Sors tes pions', 'Il faut un 6 pour sortir un pion de ta base (ou un 1, selon la variante).'],
  ['👆', 'Avance', 'Touche un pion qui clignote, ou la case en pointillés où il arrivera.'],
  ['💥', 'Capture', 'Arrive sur un pion adverse pour le renvoyer dans sa base.'],
  ['⭐', 'Abrite-toi', 'Sur les étoiles et cases de départ, personne ne peut te capturer.'],
  ['🏠', 'Rentre au centre', 'Fais le tour du plateau puis remonte ton couloir coloré. Le premier avec tous ses pions au centre gagne !'],
] as const;

export function HowToPlay({ rules }: { rules?: Rules }) {
  const active = rules ? rulesSummary(rules) : [];

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {STEPS.map(([icon, title, text]) => (
          <li key={title} className="flex gap-3 rounded-2xl bg-white/5 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xl">{icon}</span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm text-white/70">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-white/70">Faire un 6 permet de rejouer.</p>
      {active.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Règles de cette partie</h3>
          <ul className="flex flex-wrap gap-2">
            {active.map((r) => (
              <li key={r} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
