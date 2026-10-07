'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@ludo/engine';

export type LudoClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: LudoClientSocket | null = null;

export function serverUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export function getSocket(): LudoClientSocket {
  if (!socket) socket = io(serverUrl(), { transports: ['websocket', 'polling'] });
  return socket;
}

const NAME_KEY = 'ludo:name';

export function getStoredName(): string {
  return typeof window === 'undefined' ? '' : (localStorage.getItem(NAME_KEY) ?? '');
}

export function storeName(name: string) {
  localStorage.setItem(NAME_KEY, name);
}

export function getRoomToken(code: string): string | undefined {
  return localStorage.getItem(`ludo:token:${code}`) ?? undefined;
}

export function storeRoomToken(code: string, token: string) {
  localStorage.setItem(`ludo:token:${code}`, token);
}
