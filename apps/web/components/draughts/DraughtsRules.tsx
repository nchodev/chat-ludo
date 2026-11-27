'use client';

import { Icon } from '../Icons';
import { useLang } from '@/lib/i18n';

const RULES: { icon: (p: { size?: number }) => React.ReactNode; title: [string, string]; text: [string, string] }[] = [
  {
    icon: Icon.Groups,
    title: ['Le plateau', 'The board'],
    text: [
      '100 cases, on joue sur les cases foncées. Chaque joueur a 20 pions. Les blancs commencent.',
      '100 squares, played on the dark squares. Each player has 20 men. White starts.',
    ],
  },
  {
    icon: Icon.ChevronUp,
    title: ['Déplacer un pion', 'Moving a man'],
    text: [
      'Un pion avance d’une case en diagonale, vers l’adversaire uniquement.',
      'A man moves one square diagonally, towards the opponent only.',
    ],
  },
  {
    icon: Icon.Target,
    title: ['Prendre', 'Capturing'],
    text: [
      'On prend en sautant par-dessus une pièce adverse vers la case libre juste derrière. Les pions prennent aussi en arrière. Après un saut, on continue si une autre prise est possible : c’est une rafle.',
      'You capture by jumping over an opposing piece onto the free square just behind it. Men also capture backwards. After a jump, you keep going if another capture is possible: that’s a multiple capture.',
    ],
  },
  {
    icon: Icon.Block,
    title: ['La prise est obligatoire', 'Capturing is mandatory'],
    text: [
      'Si tu peux prendre, tu dois prendre. Et tu dois choisir la rafle qui prend le plus de pièces (une dame compte comme un pion).',
      'If you can capture, you must. And you must pick the sequence that takes the most pieces (a king counts as a man).',
    ],
  },
  {
    icon: Icon.Crown,
    title: ['La dame', 'The king'],
    text: [
      'Un pion qui termine son coup sur la dernière rangée devient dame. Elle se déplace et prend sur toute la diagonale, en avant comme en arrière.',
      'A man that ends its move on the last row becomes a king. It moves and captures along the whole diagonal, forwards and backwards.',
    ],
  },
  {
    icon: Icon.Trophy,
    title: ['Gagner', 'Winning'],
    text: [
      'Tu gagnes quand ton adversaire n’a plus de pièce ou plus aucun coup possible. Il peut aussi abandonner ou dépasser son temps en ligne.',
      'You win when your opponent has no pieces or no moves left. Online, they can also resign or run out of time.',
    ],
  },
  {
    icon: Icon.Handshake,
    title: ['Match nul', 'Draw'],
    text: [
      'Par accord des deux joueurs, quand la même position revient trois fois, ou après 25 coups de dames de chaque côté sans prise.',
      'By agreement of both players, when the same position comes up three times, or after 25 king moves on each side without a capture.',
    ],
  },
];

export function DraughtsRules() {
  const { t } = useLang();
  return (
    <ul className="flex flex-col gap-1 pb-2">
      {RULES.map(({ icon: RuleIcon, title, text }) => (
        <li key={title[0]} className="flex gap-3.5 py-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-300">
            <RuleIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{t(...title)}</span>
            <span className="block text-[13.5px] leading-relaxed text-[#aebac1]">{t(...text)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
