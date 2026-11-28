'use client';

import { useSyncExternalStore } from 'react';
import type { DuelRoomView, GameId, RoomView } from '@ludo/engine';

/**
 * The online rooms this player is still in, even after going to another screen: at most one Ludo
 * room and one two-player room, like the server keeps per connection. Only the codes are saved;
 * the live details come from the room states the server sends.
 */
export type RoomSlot = 'ludo' | 'duel';

export interface ActiveRoom {
  slot: RoomSlot;
  code: string;
  /** Filled by the first state received since the app opened. */
  live: {
    game: GameId;
    /** People in the room, computer players left out. */
    people: number;
    status: 'lobby' | 'playing' | 'over';
    yourTurn: boolean;
    /** A finished quick match has nothing to come back to. */
    matched: boolean;
  } | null;
}

const KEY = 'luchat:active-rooms';
const NONE: ActiveRoom[] = [];

let rooms: ActiveRoom[] | null = null;
const listeners = new Set<() => void>();
/** Rooms left on this device: a state still on its way must not bring one back. */
const left = new Set<string>();

function load(): ActiveRoom[] {
  if (rooms) return rooms;
  rooms = [];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<RoomSlot, unknown>>;
    for (const slot of ['ludo', 'duel'] as const) {
      const code = saved[slot];
      if (typeof code === 'string') rooms.push({ slot, code, live: null });
    }
  } catch {
    /* storage blocked or damaged: no room to come back to */
  }
  return rooms;
}

function set(next: ActiveRoom[]) {
  rooms = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(next.map((r) => [r.slot, r.code]))));
  } catch {
    /* the shortcut just won't survive a reload */
  }
  listeners.forEach((l) => l());
}

function put(room: ActiveRoom) {
  if (left.has(room.code)) return;
  set([...load().filter((r) => r.slot !== room.slot), room].sort((a, b) => b.slot.localeCompare(a.slot)));
}

export function trackLudoRoom(view: RoomView) {
  const { game } = view;
  put({
    slot: 'ludo',
    code: view.code,
    live: {
      game: 'ludo',
      people: view.seats.filter((s) => s.kind === 'human').length + view.spectators.length,
      status: !game ? 'lobby' : game.phase === 'over' ? 'over' : 'playing',
      yourTurn: !!game && game.phase !== 'over' && !!view.you && game.players[game.current].color === view.you,
      matched: view.matched,
    },
  });
}

export function trackDuelRoom(view: DuelRoomView) {
  const { game } = view;
  put({
    slot: 'duel',
    code: view.code,
    live: {
      game: view.kind,
      people: view.players.length + view.spectators,
      status: !game ? 'lobby' : game.status === 'over' ? 'over' : 'playing',
      yourTurn: game?.status === 'playing' && game.turn === view.yourSide,
      matched: view.matched,
    },
  });
}

/** The player opens this room (again): its states count again. */
export function enterRoom(code: string) {
  left.delete(code);
}

/** The room of this slot was left or closed. */
export function forgetRoom(slot: RoomSlot) {
  const room = load().find((r) => r.slot === slot);
  if (!room) return;
  left.add(room.code);
  set(load().filter((r) => r !== room));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveRooms(): ActiveRoom[] {
  return useSyncExternalStore(subscribe, load, () => NONE);
}
