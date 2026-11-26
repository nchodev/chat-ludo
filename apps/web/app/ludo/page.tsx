'use client';

import Link from 'next/link';
import { useState, type ComponentType, type SVGProps } from 'react';
import { BackButton } from '@/components/BackButton';
import { CoinBadge } from '@/components/Coins';
import { DailyCard } from '@/components/DailyCard';
import { HowToPlay } from '@/components/HowToPlay';
import { Icon } from '@/components/Icons';
import { LudoLogo, LudoWordmark } from '@/components/LudoLogo';
import { Sheet } from '@/components/Sheet';
import { useProfile } from '@/lib/profile';

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const MODES: { href: string; icon: IconComponent; color: string; title: string; subtitle: string }[] = [
  { href: '/rapide', icon: Icon.Bolt, color: 'bg-amber-500', title: 'Partie rapide', subtitle: 'Tables Free et Premium, le gagnant empoche la cagnotte' },
  { href: '/local', icon: Icon.Dice, color: 'bg-emerald-600', title: 'Sur cet écran', subtitle: 'Entre amis et/ou contre l’ordinateur' },
  { href: '/online', icon: Icon.Lock, color: 'bg-sky-600', title: 'Salon privé', subtitle: 'Invite tes amis avec un code' },
];

function Row({
  icon: RowIcon,
  title,
  subtitle,
  first,
}: {
  icon: IconComponent;
  title: string;
  subtitle?: string;
  first?: boolean;
}) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
        <RowIcon size={22} />
      </span>
      <span className={`flex min-w-0 flex-1 items-center gap-2 py-3.5 ${first ? '' : 'border-t border-white/[0.06]'}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-[#e9edef]">{title}</span>
          {subtitle && <span className="block text-[13px] text-[#8696a0]">{subtitle}</span>}
        </span>
        <Icon.ChevronRight size={22} className="text-[#8696a0]" />
      </span>
    </>
  );
}

const rowClass = 'flex w-full items-center gap-4 px-4 text-left transition active:bg-white/5';

export default function LudoPage() {
  const { profile, ready } = useProfile();
  const [rules, setRules] = useState(false);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-10 bg-[#1f2c33] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-2">
          <BackButton href="/?tab=games" label="Retour aux jeux" text="Jeux" />
          <h1 className="flex-1 truncate text-[1.25rem] font-medium">Ludo</h1>
          <CoinBadge />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-4 pb-10">
        <section className="flex items-center justify-center gap-6 rounded-3xl bg-gradient-to-br from-emerald-500/40 via-sky-600/25 to-fuchsia-600/30 py-7">
          <LudoLogo size={64} />
          <LudoWordmark className="text-5xl" />
        </section>

        {ready && !profile.tutorialDone && (
          <Link
            href="/tutoriel"
            className="pop-in flex items-center gap-4 rounded-2xl bg-gradient-to-r from-fuchsia-600/80 to-indigo-600/80 p-4 transition active:scale-[0.98]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15">
              <Icon.School size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Nouveau ? Apprends en 2 minutes</span>
              <span className="block text-sm text-white/80">Tutoriel guidé · +50 pièces</span>
            </span>
            <Icon.ChevronRight size={24} />
          </Link>
        )}

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

        <DailyCard />

        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-[#00a884] uppercase">Plus</h2>
          <div className="overflow-hidden rounded-2xl bg-[#1f2c33]">
            <Link href="/classement" className={rowClass}>
              <Row icon={Icon.Trophy} title="Classement" subtitle="Les meilleurs joueurs" first />
            </Link>
            <Link href="/boutique" className={rowClass}>
              <Row icon={Icon.Cart} title="Boutique" subtitle="Pions, plateaux et dés" />
            </Link>
            <Link href="/?tab=profile" className={rowClass}>
              <Row icon={Icon.Medal} title="Badges et niveau" subtitle="Ta progression" />
            </Link>
            <button type="button" onClick={() => setRules(true)} className={rowClass}>
              <Row icon={Icon.Book} title="Règles du jeu" subtitle="Comment jouer au Ludo" />
            </button>
            {profile.tutorialDone && (
              <Link href="/tutoriel" className={rowClass}>
                <Row icon={Icon.School} title="Revoir le tutoriel" />
              </Link>
            )}
          </div>
        </section>
      </main>

      <Sheet open={rules} title="Comment jouer" onClose={() => setRules(false)}>
        <HowToPlay />
      </Sheet>
    </div>
  );
}
