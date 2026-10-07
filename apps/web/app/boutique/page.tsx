'use client';

import Link from 'next/link';
import { REWARDS } from '@ludo/engine';
import { AppearancePicker } from '@/components/AppearancePicker';
import { CoinAmount } from '@/components/Coins';

const EARNINGS: { label: string; coins: number; note?: string }[] = [
  { label: 'Victoire contre un ordi facile', coins: REWARDS.bot.easy },
  { label: 'Victoire contre un ordi moyen', coins: REWARDS.bot.medium },
  { label: 'Victoire contre un ordi difficile', coins: REWARDS.bot.hard },
  { label: 'Victoire contre un joueur en ligne', coins: REWARDS.onlineHuman },
  { label: 'Victoire contre un joueur sur cet écran', coins: REWARDS.localHuman },
  { label: 'Par pion capturé', coins: REWARDS.perCapture, note: `max ${REWARDS.maxCaptureBonus}` },
  { label: 'Aucun de tes pions capturé', coins: REWARDS.flawless },
];

export default function ShopPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Accueil">
          ←
        </Link>
        <h1 className="flex-1 text-2xl font-bold">Boutique</h1>
      </header>

      <section className="card p-4">
        <h2 className="font-bold">Gagner des pièces</h2>
        <p className="mt-1 text-sm text-white/60">
          Chaque victoire rapporte des pièces pour chaque adversaire battu, plus des bonus. Un adversaire qui abandonne
          rapporte la moitié.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {EARNINGS.map((e) => (
            <li key={e.label} className="flex items-center justify-between gap-3">
              <span className="text-white/80">{e.label}</span>
              <span className="flex shrink-0 items-center gap-1 font-semibold text-amber-200">
                +<CoinAmount value={e.coins} size={14} />
                {e.note && <span className="text-xs font-normal text-white/50">{e.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Plateaux, pions et dés</h2>
        <AppearancePicker />
      </section>
    </main>
  );
}
