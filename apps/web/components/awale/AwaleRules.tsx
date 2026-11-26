import { Icon } from '../Icons';

const RULES = [
  {
    icon: Icon.Groups,
    title: 'Le plateau',
    text: 'Deux rangées de 6 trous, 4 graines dans chaque trou au départ (48 en tout). Chaque joueur possède la rangée devant lui.',
  },
  {
    icon: Icon.Refresh,
    title: 'Semer',
    text: 'À ton tour, prends toutes les graines d’un de tes trous et sème-les une par une dans les trous suivants, dans le sens inverse des aiguilles d’une montre. Avec 12 graines ou plus, on saute le trou de départ.',
  },
  {
    icon: Icon.Target,
    title: 'Prendre',
    text: 'Si la dernière graine tombe chez l’adversaire et que ce trou contient alors 2 ou 3 graines, tu les prends. Tu prends aussi le trou précédent s’il a 2 ou 3 graines, et ainsi de suite, tant que tu restes chez l’adversaire.',
  },
  {
    icon: Icon.Block,
    title: 'Pas de grand chelem',
    text: 'Un coup qui prendrait toutes les graines de l’adversaire est joué, mais rien n’est pris.',
  },
  {
    icon: Icon.Handshake,
    title: 'Nourrir l’adversaire',
    text: 'Si ton adversaire n’a plus de graines, tu dois jouer un coup qui lui en donne. Si c’est impossible, la partie s’arrête et chacun garde les graines de son côté.',
  },
  {
    icon: Icon.Trophy,
    title: 'Gagner',
    text: 'Le premier qui prend 25 graines gagne. Si les graines tournent sans prise, la partie s’arrête et chacun garde celles de son côté. 24 partout : match nul.',
  },
];

export function AwaleRules() {
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
