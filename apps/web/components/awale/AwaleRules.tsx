'use client';

import { Icon } from '../Icons';
import { useLang } from '@/lib/i18n';

const RULES: { icon: (p: { size?: number }) => React.ReactNode; title: [string, string]; text: [string, string] }[] = [
  {
    icon: Icon.Groups,
    title: ['Le plateau', 'The board'],
    text: [
      'Deux rangées de 6 trous, 4 graines dans chaque trou au départ (48 en tout). Chaque joueur possède la rangée devant lui.',
      'Two rows of 6 pits, 4 seeds in each pit at the start (48 in total). Each player owns the row in front of them.',
    ],
  },
  {
    icon: Icon.Refresh,
    title: ['Semer', 'Sowing'],
    text: [
      'À ton tour, prends toutes les graines d’un de tes trous et sème-les une par une dans les trous suivants, dans le sens inverse des aiguilles d’une montre. Avec 12 graines ou plus, on saute le trou de départ.',
      'On your turn, take all the seeds from one of your pits and sow them one by one into the next pits, anticlockwise. With 12 seeds or more, you skip the starting pit.',
    ],
  },
  {
    icon: Icon.Target,
    title: ['Prendre', 'Capturing'],
    text: [
      'Si la dernière graine tombe chez l’adversaire et que ce trou contient alors 2 ou 3 graines, tu les prends. Tu prends aussi le trou précédent s’il a 2 ou 3 graines, et ainsi de suite, tant que tu restes chez l’adversaire.',
      'If the last seed lands on the opponent’s side and that pit then holds 2 or 3 seeds, you take them. You also take the previous pit if it has 2 or 3 seeds, and so on, as long as you stay on the opponent’s side.',
    ],
  },
  {
    icon: Icon.Block,
    title: ['Pas de grand chelem', 'No grand slam'],
    text: [
      'Un coup qui prendrait toutes les graines de l’adversaire est joué, mais rien n’est pris.',
      'A move that would take all the opponent’s seeds is played, but nothing is captured.',
    ],
  },
  {
    icon: Icon.Handshake,
    title: ['Nourrir l’adversaire', 'Feeding the opponent'],
    text: [
      'Si ton adversaire n’a plus de graines, tu dois jouer un coup qui lui en donne. Si c’est impossible, la partie s’arrête et chacun garde les graines de son côté.',
      'If your opponent has no seeds left, you must play a move that gives them some. If that’s impossible, the game ends and each keeps the seeds on their side.',
    ],
  },
  {
    icon: Icon.Trophy,
    title: ['Gagner', 'Winning'],
    text: [
      'Le premier qui prend 25 graines gagne. Si les graines tournent sans prise, la partie s’arrête et chacun garde celles de son côté. 24 partout : match nul.',
      'The first to capture 25 seeds wins. If the seeds keep going round with no capture, the game ends and each keeps those on their side. 24 each: a draw.',
    ],
  },
];

export function AwaleRules() {
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
