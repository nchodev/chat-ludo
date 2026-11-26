'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { GAME_NAMES, type GameId } from '@ludo/engine';
import { useGameAvailability } from '@/lib/games';
import { Icon } from './Icons';

/**
 * Pages of a game switched off by the admins show a notice instead. Room pages stay reachable
 * (paths starting with `roomPrefix`), so games already in progress can finish.
 */
export function GameGate({ game, roomPrefix, children }: { game: GameId; roomPrefix?: string; children: ReactNode }) {
  const availability = useGameAvailability();
  const pathname = usePathname();
  if (availability[game] || (roomPrefix && pathname.startsWith(roomPrefix) && pathname.length > roomPrefix.length)) return children;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0b141a] px-6 text-center text-[#e9edef]">
      <span className="grid size-24 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
        <Icon.Block size={46} />
      </span>
      <h1 className="mt-5 text-[22px] font-semibold">{GAME_NAMES[game]} est indisponible</h1>
      <p className="mt-1.5 max-w-xs text-[14.5px] text-[#8696a0]">Ce jeu a été mis en pause par l’équipe LuChat. Il revient bientôt.</p>
      <Link
        href="/?tab=games"
        className="mt-8 flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] px-6 text-[15px] font-semibold text-[#0b141a]"
      >
        <Icon.Back size={20} />
        Retour aux jeux
      </Link>
    </main>
  );
}
