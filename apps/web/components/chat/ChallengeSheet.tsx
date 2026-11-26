'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ChatInvite } from '@ludo/engine';
import { GameLogo } from '../GameLogo';
import { Icon } from '../Icons';
import { Sheet } from '../Sheet';
import { challengeFriend } from '@/lib/chat';

const GAMES: { id: ChatInvite['game']; name: string; text: string }[] = [
  { id: 'ludo', name: 'Ludo', text: 'Le classique : dés, pions, captures.' },
  { id: 'dames', name: 'Dames', text: 'Plateau 10 × 10, prises obligatoires.' },
  { id: 'awale', name: 'Awalé', text: 'Sème les graines, prends-en 25.' },
];

/** Picks a game, creates its room and drops an invitation card into the conversation. */
export function ChallengeSheet({ open, friend, me, onClose }: { open: boolean; friend: string; me: string; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<ChatInvite['game'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const challenge = async (game: ChatInvite['game']) => {
    setBusy(game);
    setError(null);
    try {
      router.push(await challengeFriend(friend, game, me));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Défi impossible pour le moment.');
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} title={`Défier ${friend}`} onClose={onClose}>
      <div className="flex flex-col gap-2 pb-1">
        <p className="mb-1 text-[14px] text-[#8696a0]">
          Un salon est créé et {friend} reçoit une carte pour te rejoindre. Tu pourras régler les règles ou une mise dans le salon.
        </p>
        {GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            disabled={!!busy}
            onClick={() => challenge(game.id)}
            className="flex items-center gap-3 rounded-2xl bg-[#0b141a]/50 p-3 text-left transition active:scale-[0.99] disabled:opacity-60"
          >
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0b141a]/70">
              <GameLogo game={game.id} size={40} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">{game.name}</span>
              <span className="block text-[13px] text-[#8696a0]">{game.text}</span>
            </span>
            {busy === game.id ? (
              <span className="size-5 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
            ) : (
              <Icon.ChevronRight size={22} className="text-[#8696a0]" />
            )}
          </button>
        ))}
        {error && <p className="text-center text-[13px] text-[#f15c6d]">{error}</p>}
      </div>
    </Sheet>
  );
}
