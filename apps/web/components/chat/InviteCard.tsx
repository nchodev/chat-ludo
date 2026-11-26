'use client';

import Link from 'next/link';
import { INVITE_GAME_NAME, parseChatInvite } from '@ludo/engine';
import { gameRoomPath } from '@/lib/games';
import { GameLogo } from '../GameLogo';
import { Icon } from '../Icons';

/** A challenge sent from the chat: the game, and a button to join (or reopen) the room. */
export function InviteCard({ body, mine, from }: { body: string; mine: boolean; from: string }) {
  const invite = parseChatInvite(body);
  if (!invite) return <span className="text-[#8696a0] italic">Invitation illisible</span>;
  const href = gameRoomPath(invite.game, invite.code);
  const name = INVITE_GAME_NAME[invite.game];
  return (
    <div className="flex w-[240px] max-w-full flex-col gap-2">
      <div className="flex items-center gap-3 rounded-md bg-black/20 p-2.5">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0b141a]/60">
          <GameLogo game={invite.game} size={40} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[12px] font-medium text-[#ffd279]">
            <Icon.Bolt size={14} />
            Défi
          </span>
          <span className="block text-[15px] font-medium text-[#e9edef]">Partie de {name}</span>
          <span className="block text-[12.5px] text-[#8696a0]">
            {mine ? 'Tu as lancé le défi' : `${from} te défie`} · salon {invite.code}
          </span>
        </span>
      </div>
      <Link
        href={href}
        className="flex h-10 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[14px] font-semibold text-[#0b141a] active:scale-[0.98]"
      >
        <Icon.Play size={18} />
        {mine ? 'Ouvrir le salon' : 'Relever le défi'}
      </Link>
    </div>
  );
}
