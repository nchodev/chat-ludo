'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@ludo/engine';
import { trackDuelRoom, trackLudoRoom } from './activeRoom';

export type LudoClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: LudoClientSocket | null = null;

export function serverUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

const DEVICE_KEY = 'luchat:device';

/** Random id kept on this device; the server uses it to stop one person filling a staked table. */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getSocket(): LudoClientSocket {
  if (!socket) {
    socket = io(serverUrl(), { transports: ['websocket', 'polling'], auth: { device: deviceId() } });
    // Registered with the socket itself, so no room state is missed whatever screen is open.
    socket.on('room:state', trackLudoRoom);
    socket.on('draughts:state', trackDuelRoom);
    socket.on('connect', notifyStatus);
    socket.on('disconnect', notifyStatus);
    socket.on('connect_error', notifyStatus);
    socket.io.on('reconnect_attempt', notifyStatus);
    // getSocket() may run during a render; listeners must not update state then.
    queueMicrotask(notifyStatus);
  }
  return socket;
}

/** The socket if one was opened, without opening it. */
export function peekSocket(): LudoClientSocket | null {
  return socket;
}

const statusListeners = new Set<() => void>();

function notifyStatus() {
  for (const listener of statusListeners) listener();
}

/** Calls `listener` whenever the socket connects, drops or retries. */
export function subscribeSocketStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** Retries now instead of waiting for the reconnection backoff, e.g. when the network comes back. */
export function reconnectNow() {
  if (!socket || socket.connected || !socket.active) return;
  socket.disconnect();
  socket.connect();
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

export function getDraughtsToken(code: string): string | undefined {
  return localStorage.getItem(`luchat:dames:${code}`) ?? undefined;
}

export function storeDraughtsToken(code: string, token: string) {
  localStorage.setItem(`luchat:dames:${code}`, token);
}
