'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CoinBadge } from '@/components/Coins';
import { HowToPlay } from '@/components/HowToPlay';
import { Sheet } from '@/components/Sheet';
import { COLOR_DARK, COLOR_HEX } from '@/lib/board';

const LOGO_COLORS = ['red', 'green', 'blue', 'yellow'] as const;

function Logo() {
  return (
    <div className="float relative mx-auto size-32">
      <div className="grid size-full rotate-45 grid-cols-2 gap-1.5 overflow-hidden rounded-[28px] p-1.5 shadow-2xl shadow-black/50 ring-4 ring-white/20">
        {LOGO_COLORS.map((c) => (
          <span
            key={c}
            className="grid place-items-center rounded-[14px]"
            style={{ background: `linear-gradient(145deg, ${COLOR_HEX[c]}, ${COLOR_DARK[c]})` }}
          >
            <span className="size-5 -rotate-45 rounded-full border-[3px] border-white/90 bg-white/30 shadow" />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [help, setHelp] = useState(false);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-10 px-6 py-10">
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4">
        <CoinBadge />
      </div>
      <div className="text-center">
        <Logo />
        <h1 className="mt-8 text-6xl font-bold tracking-tight">
          {'LUDO'.split('').map((l, i) => (
            <span key={i} style={{ color: COLOR_HEX[LOGO_COLORS[i]] }} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
              {l}
            </span>
          ))}
        </h1>
        <p className="mt-2 text-white/70">Lance les dés, capture tes amis, rentre au centre !</p>
      </div>

      <nav className="flex flex-col gap-3">
        <Link href="/local" className="group card flex items-center gap-4 p-4 transition active:scale-[0.98]">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-3xl shadow-lg">
            🎲
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">Jouer sur cet écran</span>
            <span className="block text-sm text-white/60">Entre amis et/ou contre l’ordinateur</span>
          </span>
          <span className="text-2xl text-white/40 transition group-hover:translate-x-1">›</span>
        </Link>
        <Link href="/online" className="group card flex items-center gap-4 p-4 transition active:scale-[0.98]">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 text-3xl shadow-lg">
            🌍
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">Jouer en ligne</span>
            <span className="block text-sm text-white/60">Salon privé avec un code à partager</span>
          </span>
          <span className="text-2xl text-white/40 transition group-hover:translate-x-1">›</span>
        </Link>
        <Link href="/boutique" className="group card flex items-center gap-4 p-4 transition active:scale-[0.98]">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-3xl shadow-lg">
            🛍️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">Boutique</span>
            <span className="block text-sm text-white/60">Dépense tes pièces : plateaux, pions et dés</span>
          </span>
          <span className="text-2xl text-white/40 transition group-hover:translate-x-1">›</span>
        </Link>
        <button type="button" onClick={() => setHelp(true)} className="btn btn-ghost mt-2">
          📖 Comment jouer ?
        </button>
      </nav>

      <Sheet open={help} title="Comment jouer" onClose={() => setHelp(false)}>
        <HowToPlay />
      </Sheet>
    </main>
  );
}
