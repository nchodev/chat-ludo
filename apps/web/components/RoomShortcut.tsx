'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { forgetRoom, useActiveRooms, type ActiveRoom } from '@/lib/activeRoom';
import { gameRoomPath } from '@/lib/games';
import { useLang } from '@/lib/i18n';
import { getSessionToken, useProfile } from '@/lib/profile';
import { getDraughtsToken, getRoomToken, getSocket, getStoredName } from '@/lib/socket';
import { AwaleLogo } from './awale/AwaleLogo';
import { DraughtsLogo } from './draughts/DraughtsLogo';
import { LudoLogo } from './LudoLogo';

const NOT_FOUND = /introuvable|not found/i;

/** Whether the player is looking at this room's own screen (a two-player code works under any such game). */
function onRoomPage(pathname: string, { slot, code }: ActiveRoom) {
  const match = /^\/(?:(online)|(?:dames|awale)\/salon)\/([^/]+)/.exec(pathname);
  return !!match && (match[1] ? 'ludo' : 'duel') === slot && match[2].toUpperCase() === code;
}

/**
 * Floating button leading back to the room or the game the player stepped out of, with the number
 * of people in it. It also takes the player back into the room after a reload or a lost connection.
 */
export function RoomShortcut() {
  const rooms = useActiveRooms();
  const pathname = usePathname();
  const { session, ready } = useProfile();
  const { t } = useLang();
  const state = useRef({ rooms, pathname, username: session?.username });
  state.current = { rooms, pathname, username: session?.username };
  const hasRoom = rooms.length > 0;

  useEffect(() => {
    if (!ready || !hasRoom) return;
    const socket = getSocket();
    const rejoin = (room: ActiveRoom) => {
      // The room's own screen joins by itself.
      if (onRoomPage(state.current.pathname, room)) return;
      const token = room.slot === 'ludo' ? getRoomToken(room.code) : getDraughtsToken(room.code);
      if (!token) return forgetRoom(room.slot);
      const payload = { code: room.code, name: state.current.username ?? getStoredName(), token, auth: getSessionToken() };
      socket.emit(room.slot === 'ludo' ? 'room:join' : 'draughts:join', payload, (res) => {
        if (!res.ok && NOT_FOUND.test(res.error)) forgetRoom(room.slot);
      });
    };
    const rejoinAll = () => state.current.rooms.forEach(rejoin);
    const onLudoClosed = () => forgetRoom('ludo');
    const onDuelClosed = () => forgetRoom('duel');
    socket.on('connect', rejoinAll);
    socket.on('room:closed', onLudoClosed);
    socket.on('draughts:closed', onDuelClosed);
    // Already connected: only rooms not heard from since the app opened need joining.
    if (socket.connected) state.current.rooms.filter((r) => !r.live).forEach(rejoin);
    else socket.connect();
    return () => {
      socket.off('connect', rejoinAll);
      socket.off('room:closed', onLudoClosed);
      socket.off('draughts:closed', onDuelClosed);
    };
  }, [ready, hasRoom]);

  const shown = rooms.filter((r) => r.live && !(r.live.matched && r.live.status === 'over') && !onRoomPage(pathname, r));
  if (!shown.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-[41] mx-auto flex max-w-lg flex-col items-end gap-3 px-3">
      {shown.map((room) => {
        const { game, people, status, yourTurn } = room.live!;
        const DuelLogo = game === 'awale' ? AwaleLogo : DraughtsLogo;
        const label = yourTurn ? t('À toi !', 'Your turn!') : status === 'playing' ? t('En jeu', 'Playing') : t('Salon', 'Room');
        const count = t(`${people} personne${people > 1 ? 's' : ''}`, `${people} ${people > 1 ? 'people' : 'person'}`);
        return (
          <Link
            key={room.slot}
            href={gameRoomPath(game, room.code)}
            aria-label={t(`Revenir au salon ${room.code} : ${count}. ${label}`, `Back to room ${room.code}: ${count}. ${label}`)}
            className="pop-in pointer-events-auto flex flex-col items-center transition active:scale-95"
          >
            <span
              className={`relative grid size-14 place-items-center rounded-full bg-[#1f2c33] shadow-xl shadow-black/50 ring-2 ${
                yourTurn ? 'ring-[#ffbc38]' : 'ring-[#00a884]'
              }`}
            >
              {yourTurn && <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-[#ffbc38]" />}
              {game === 'ludo' ? <LudoLogo size={28} float={false} /> : <DuelLogo size={32} />}
              <span className="absolute -top-1 -right-1 grid h-6 min-w-6 place-items-center rounded-full bg-[#00a884] px-1 text-[13px] font-bold text-[#0b141a] ring-2 ring-[#0b141a]">
                {people}
              </span>
            </span>
            <span
              className={`-mt-2 rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold shadow ${
                yourTurn ? 'bg-[#ffbc38] text-[#0b141a]' : 'bg-[#e9edef] text-[#0b141a]'
              } relative`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
