'use client';

import Link from 'next/link';
import { useState, type ComponentType, type SVGProps } from 'react';
import { BackButton } from '@/components/BackButton';
import { CoinBadge } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { DraughtsLogo, DraughtsWordmark } from '@/components/draughts/DraughtsLogo';
import { DraughtsRules } from '@/components/draughts/DraughtsRules';

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const MODES: { href: string; icon: IconComponent; color: string; title: string; subtitle: string }[] = [
  { href: '/dames/rapide', icon: Icon.Bolt, color: 'bg-amber-500', title: 'Partie rapide', subtitle: 'Un adversaire en ligne, avec ou sans mise' },
  { href: '/dames/local', icon: Icon.Robot, color: 'bg-emerald-600', title: 'Sur cet écran', subtitle: 'Contre l’ordinateur ou à deux sur le même téléphone' },
  { href: '/dames/salon', icon: Icon.Lock, color: 'bg-sky-600', title: 'Salon privé', subtitle: 'Défie un ami avec un code' },
];

const FACTS = [
  { icon: Icon.Groups, label: '2 joueurs' },
  { icon: Icon.Timer, label: '10 min chacun en ligne' },
  { icon: Icon.Crown, label: 'Dames volantes' },
];

export default function DamesPage() {
  const [rules, setRules] = useState(false);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-10 bg-[#1f2c33] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-2">
          <BackButton href="/?tab=games" label="Retour aux jeux" text="Jeux" />
          <h1 className="flex-1 truncate text-[1.25rem] font-medium">Dames</h1>
          <CoinBadge />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-4 pb-10">
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-amber-700/45 via-orange-900/30 to-stone-800/40 py-6">
          <span className="flex items-center gap-5">
            <DraughtsLogo size={64} />
            <DraughtsWordmark className="text-5xl" />
          </span>
          <ul className="flex flex-wrap justify-center gap-1.5 px-4">
            {FACTS.map(({ icon: FactIcon, label }) => (
              <li key={label} className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[12.5px] text-[#f3e6cf]">
                <FactIcon size={15} />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-[#00a884] uppercase">Jouer</h2>
          <div className="flex flex-col gap-2.5">
            {MODES.map(({ href, icon: ModeIcon, color, title, subtitle }) => (
              <Link key={href} href={href} className="flex items-center gap-4 rounded-2xl bg-[#1f2c33] p-3.5 transition active:scale-[0.98]">
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg ${color}`}>
                  <ModeIcon size={26} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{title}</span>
                  <span className="block text-[13px] text-[#8696a0]">{subtitle}</span>
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
                  <span className="block text-[15px] font-medium">Règles du jeu</span>
                  <span className="block text-[13px] text-[#8696a0]">Dames internationales, en 7 points</span>
                </span>
                <Icon.ChevronRight size={22} className="text-[#8696a0]" />
              </span>
            </button>
          </div>
        </section>
      </main>

      <Sheet open={rules} title="Règles des dames" onClose={() => setRules(false)}>
        <DraughtsRules />
      </Sheet>
    </div>
  );
}
