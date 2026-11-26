import { Icon } from '../Icons';

const RULES = [
  {
    icon: Icon.Groups,
    title: 'Le plateau',
    text: '100 cases, on joue sur les cases foncées. Chaque joueur a 20 pions. Les blancs commencent.',
  },
  {
    icon: Icon.ChevronUp,
    title: 'Déplacer un pion',
    text: 'Un pion avance d’une case en diagonale, vers l’adversaire uniquement.',
  },
  {
    icon: Icon.Target,
    title: 'Prendre',
    text: 'On prend en sautant par-dessus une pièce adverse vers la case libre juste derrière. Les pions prennent aussi en arrière. Après un saut, on continue si une autre prise est possible : c’est une rafle.',
  },
  {
    icon: Icon.Block,
    title: 'La prise est obligatoire',
    text: 'Si tu peux prendre, tu dois prendre. Et tu dois choisir la rafle qui prend le plus de pièces (une dame compte comme un pion).',
  },
  {
    icon: Icon.Crown,
    title: 'La dame',
    text: 'Un pion qui termine son coup sur la dernière rangée devient dame. Elle se déplace et prend sur toute la diagonale, en avant comme en arrière.',
  },
  {
    icon: Icon.Trophy,
    title: 'Gagner',
    text: 'Tu gagnes quand ton adversaire n’a plus de pièce ou plus aucun coup possible. Il peut aussi abandonner ou dépasser son temps en ligne.',
  },
  {
    icon: Icon.Handshake,
    title: 'Match nul',
    text: 'Par accord des deux joueurs, quand la même position revient trois fois, ou après 25 coups de dames de chaque côté sans prise.',
  },
];

export function DraughtsRules() {
  return (
    <ul className="flex flex-col gap-1 pb-2">
      {RULES.map(({ icon: RuleIcon, title, text }) => (
        <li key={title} className="flex gap-3.5 py-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-300">
            <RuleIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{title}</span>
            <span className="block text-[13.5px] leading-relaxed text-[#aebac1]">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
