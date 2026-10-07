'use client';

import Link from 'next/link';
import { levelInfo } from '@ludo/engine';
import { useProfile } from '@/lib/profile';

/** Name and level of the player, linking to their profile. */
export function ProfileChip() {
  const { profile, session, ready } = useProfile();
  const { level } = levelInfo(profile.xp);
  const name = session?.username ?? 'Invité';
  return (
    <Link
      href="/profil"
      className="inline-flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1 text-sm transition active:scale-95"
    >
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-indigo-600 font-bold">
        {session ? name[0].toUpperCase() : '👤'}
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-sky-400 text-[9px] font-bold text-slate-900 ring-2 ring-[#1a1b3a]">
          {ready ? level : ''}
        </span>
      </span>
      <span className="truncate font-semibold">{ready ? name : ''}</span>
    </Link>
  );
}
