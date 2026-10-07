'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { CoinBadge } from '@/components/Coins';
import { DailyCard } from '@/components/DailyCard';
import { HowToPlay } from '@/components/HowToPlay';
import { ProfileChip } from '@/components/ProfileChip';
import { Sheet } from '@/components/Sheet';
import { COLOR_DARK, COLOR_HEX } from '@/lib/board';
import { useProfile } from '@/lib/profile';

const LOGO_COLORS = ['red', 'green', 'blue', 'yellow'] as const;

function Logo() {
  return (
    <div className="float relative mx-auto size-24">
      <div className="grid size-full rotate-45 grid-cols-2 gap-1 overflow-hidden rounded-[22px] p-1 shadow-2xl shadow-black/50 ring-4 ring-white/20">
        {LOGO_COLORS.map((c) => (
          <span
            key={c}
            className="grid place-items-center rounded-[11px]"
            style={{ background: `linear-gradient(145deg, ${COLOR_HEX[c]}, ${COLOR_DARK[c]})` }}
          >
            <span className="size-4 -rotate-45 rounded-full border-[3px] border-white/90 bg-white/30 shadow" />
          </span>
        ))}
      </div>
    </div>
  );
}

function MenuLink({ href, icon, gradient, title, subtitle }: { href: string; icon: string; gradient: string; title: string; subtitle: string }) {
  return (
    <Link href={href} className="group card flex items-center gap-4 p-3.5 transition active:scale-[0.98]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-2xl shadow-lg ${gradient}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-white/60">{subtitle}</span>
      </span>
      <span className="text-2xl text-white/40 transition group-hover:translate-x-1">›</span>
    </Link>
  );
}

function Tile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="card flex flex-col items-center gap-1 py-3 text-sm font-semibold transition active:scale-95">
      <span className="text-2xl">{icon}</span>
      {label}
    </Link>
  );
}

export default function HomePage() {
  const [help, setHelp] = useState(false);
  const { profile, ready } = useProfile();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <div className="flex items-center justify-between gap-2">
        <ProfileChip />
        <CoinBadge />
      </div>

      <div className="text-center">
        <Logo />
        <h1 className="mt-5 text-5xl font-bold tracking-tight">
          {'LUDO'.split('').map((l, i) => (
            <span key={i} style={{ color: COLOR_HEX[LOGO_COLORS[i]] }} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
              {l}
            </span>
          ))}
        </h1>
        <p className="mt-1 text-sm text-white/70">Lance les dés, capture tes amis, rentre au centre !</p>
      </div>

      {ready && !profile.tutorialDone && (
        <Link
          href="/tutoriel"
          className="pop-in flex items-center gap-3 rounded-3xl bg-gradient-to-r from-fuchsia-500/80 to-indigo-500/80 p-4 shadow-lg transition active:scale-[0.98]"
        >
          <span className="text-3xl">🎓</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Nouveau ? Apprends en 2 minutes</span>
            <span className="block text-sm text-white/80">Tutoriel guidé · +50 pièces</span>
          </span>
          <span className="text-2xl">›</span>
        </Link>
      )}

      <nav className="flex flex-col gap-2.5">
        <MenuLink
          href="/rapide"
          icon="⚡"
          gradient="from-amber-300 to-orange-500"
          title="Partie rapide"
          subtitle="Joue en ligne contre d’autres joueurs"
        />
        <MenuLink
          href="/local"
          icon="🎲"
          gradient="from-emerald-400 to-emerald-600"
          title="Jouer sur cet écran"
          subtitle="Entre amis et/ou contre l’ordinateur"
        />
        <MenuLink
          href="/online"
          icon="🔒"
          gradient="from-sky-400 to-indigo-600"
          title="Salon privé"
          subtitle="Invite tes amis avec un code"
        />
      </nav>

      <div className="grid grid-cols-3 gap-2.5">
        <Tile href="/boutique" icon="🛍️" label="Boutique" />
        <Tile href="/classement" icon="🏆" label="Classement" />
        <Tile href="/profil" icon="🏅" label="Badges" />
      </div>

      <DailyCard />

      <button type="button" onClick={() => setHelp(true)} className="btn btn-ghost">
        📖 Règles du jeu
      </button>

      <Sheet open={help} title="Comment jouer" onClose={() => setHelp(false)}>
        <HowToPlay />
      </Sheet>
    </main>
  );
}
