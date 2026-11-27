'use client';

import type { Rules } from '@ludo/engine';
import { rulesSummary } from '@/lib/labels';
import { useLang } from '@/lib/i18n';

export function HowToPlay({ rules }: { rules?: Rules }) {
  const { t } = useLang();
  const active = rules ? rulesSummary(rules) : [];
  const STEPS = [
    ['🎲', t('Lance le dé', 'Roll the die'), t('Touche le dé quand c’est ton tour.', 'Tap the die when it’s your turn.')],
    ['🚀', t('Sors tes pions', 'Get your pawns out'), t('Il faut un 6 pour sortir un pion de ta base (ou un 1, selon la variante).', 'You need a 6 to bring a pawn out of your base (or a 1, depending on the variant).')],
    ['👆', t('Avance', 'Move'), t('Touche un pion qui clignote, ou la case en pointillés où il arrivera.', 'Tap a blinking pawn, or the dotted square where it will land.')],
    ['💥', t('Capture', 'Capture'), t('Arrive sur un pion adverse pour le renvoyer dans sa base.', 'Land on an opponent’s pawn to send it back to its base.')],
    ['⭐', t('Abrite-toi', 'Take shelter'), t('Sur les étoiles et cases de départ, personne ne peut te capturer.', 'On stars and starting squares, nobody can capture you.')],
    ['🏠', t('Rentre au centre', 'Reach the centre'), t('Fais le tour du plateau puis remonte ton couloir coloré. Le premier avec tous ses pions au centre gagne !', 'Go around the board, then up your coloured lane. The first with all their pawns in the centre wins!')],
  ] as const;

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
      <p className="text-sm text-white/70">{t('Faire un 6 permet de rejouer.', 'Rolling a 6 gives you another turn.')}</p>
      {active.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">{t('Règles de cette partie', 'Rules of this game')}</h3>
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
