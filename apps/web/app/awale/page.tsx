'use client';

import Link from 'next/link';
import { useState, type ComponentType, type SVGProps } from 'react';
import { BackButton } from '@/components/BackButton';
import { CoinBadge } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { useLang } from '@/lib/i18n';
import { AwaleLogo, AwaleWordmark } from '@/components/awale/AwaleLogo';
import { AwaleRules } from '@/components/awale/AwaleRules';

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const MODES: { href: string; icon: IconComponent; color: string; title: [string, string]; subtitle: [string, string] }[] = [
  {
    href: '/awale/rapide',
    icon: Icon.Bolt,
    color: 'bg-amber-500',
    title: ['Partie rapide', 'Quick match'],
    subtitle: ['Un adversaire en ligne, avec ou sans mise', 'An online opponent, with or without a stake'],
  },
  {
    href: '/awale/local',
    icon: Icon.Robot,
    color: 'bg-emerald-600',
    title: ['Sur cet écran', 'On this screen'],
    subtitle: ['Contre l’ordinateur ou à deux sur le même téléphone', 'Against the computer or two players on the same phone'],
  },
  { href: '/awale/salon', icon: Icon.Lock, color: 'bg-sky-600', title: ['Salon privé', 'Private room'], subtitle: ['Défie un ami avec un code', 'Challenge a friend with a code'] },
];

const FACTS: { icon: IconComponent; label: [string, string] }[] = [
  { icon: Icon.Groups, label: ['2 joueurs', '2 players'] },
  { icon: Icon.Timer, label: ['5 min chacun en ligne', '5 min each online'] },
  { icon: Icon.Target, label: ['25 graines pour gagner', '25 seeds to win'] },
];

export default function AwalePage() {
  const [rules, setRules] = useState(false);
  const { t } = useLang();

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-10 bg-[#1f2c33] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-2">
          <BackButton href="/?tab=games" label={t('Retour aux jeux', 'Back to games')} text={t('Jeux', 'Games')} />
          <h1 className="flex-1 truncate text-[1.25rem] font-medium">Awalé</h1>
          <CoinBadge />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-4 pb-10">
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-orange-700/45 via-amber-900/35 to-emerald-900/30 py-6">
          <span className="flex items-center gap-5">
            <AwaleLogo size={64} />
            <AwaleWordmark className="text-5xl" />
          </span>
          <ul className="flex flex-wrap justify-center gap-1.5 px-4">
            {FACTS.map(({ icon: FactIcon, label }) => (
              <li key={label[0]} className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[12.5px] text-[#f3e6cf]">
                <FactIcon size={15} />
                {t(...label)}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-[#00a884] uppercase">{t('Jouer', 'Play')}</h2>
          <div className="flex flex-col gap-2.5">
            {MODES.map(({ href, icon: ModeIcon, color, title, subtitle }) => (
              <Link key={href} href={href} className="flex items-center gap-4 rounded-2xl bg-[#1f2c33] p-3.5 transition active:scale-[0.98]">
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg ${color}`}>
                  <ModeIcon size={26} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{t(...title)}</span>
                  <span className="block text-[13px] text-[#8696a0]">{t(...subtitle)}</span>
                </span>
                <Icon.ChevronRight size={24} className="text-[#8696a0]" />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-[#00a884] uppercase">Plus</h2>
          <div className="overflow-hidden rounded-2xl bg-[#1f2c33]">
            <button type="button" onClick={() => setRules(true)} className="flex w-full items-center gap-4 px-4 text-left transition active:bg-white/5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
                <Icon.Book size={22} />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{t('Règles du jeu', 'Game rules')}</span>
                  <span className="block text-[13px] text-[#8696a0]">{t('Awalé (abapa), en 6 points', 'Awalé (abapa), in 6 points')}</span>
                </span>
                <Icon.ChevronRight size={22} className="text-[#8696a0]" />
              </span>
            </button>
          </div>
        </section>
      </main>

      <Sheet open={rules} title={t('Règles de l’awalé', 'Awalé rules')} onClose={() => setRules(false)}>
        <AwaleRules />
      </Sheet>
    </div>
  );
}
