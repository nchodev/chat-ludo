'use client';

import { useSyncExternalStore } from 'react';
import type { SupportMessageView, SupportThreadView } from '@ludo/engine';
import { ApiError, api } from './api';
import { getSessionToken } from './profile';
import { getSocket, serverUrl } from './socket';

/**
 * The player's conversation with customer support: unread replies (for the badges), and the
 * messages arriving live so an open conversation shows them at once.
 */
interface State {
  unread: number;
  latest: SupportMessageView | null;
}

let state: State = { unread: 0, latest: null };
const EMPTY: State = state;
const listeners = new Set<() => void>();
/** The conversation is on screen: replies are read as they arrive. */
let viewing = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useSupport(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

export async function refreshSupportUnread() {
  const token = getSessionToken();
  if (!token) return set({ unread: 0, latest: null });
  try {
    const { unread } = await api<{ unread: number }>('/support/unread', { token });
    set({ unread: viewing ? 0 : unread });
  } catch {
    // Offline: counted again at the next connection.
  }
}

export function receiveSupport(message: SupportMessageView) {
  set({ latest: message, unread: message.fromStaff && !viewing ? state.unread + 1 : state.unread });
  if (message.fromStaff && viewing) void markSupportRead();
}

export function setViewingSupport(on: boolean) {
  viewing = on;
}

export function clearSupport() {
  set({ unread: 0, latest: null });
}

export function loadSupport(before?: number): Promise<SupportThreadView> {
  return api<SupportThreadView>(`/support${before ? `?before=${before}` : ''}`, { token: getSessionToken() });
}

export async function markSupportRead() {
  set({ unread: 0 });
  await api('/support/read', { token: getSessionToken(), body: {} }).catch(() => {});
}

/** Skips the echo of our own message on this connection: the page adds it from the reply. */
function socketId() {
  return getSocket().id ?? '';
}

export async function sendSupportText(text: string): Promise<SupportMessageView> {
  const { message } = await api<{ message: SupportMessageView }>('/support/send', {
    token: getSessionToken(),
    body: { text, socketId: socketId() },
  });
  return message;
}

export async function uploadSupport(
  file: Blob,
  info: { kind: 'image'; width: number; height: number; caption?: string } | { kind: 'voice'; durationMs: number },
): Promise<SupportMessageView> {
  const params = new URLSearchParams({ kind: info.kind, socketId: socketId() });
  if (info.kind === 'image') {
    params.set('width', String(info.width));
    params.set('height', String(info.height));
    if (info.caption) params.set('caption', info.caption);
  } else params.set('duration', String(Math.round(info.durationMs)));
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/api/support/upload?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': (file.type.split(';')[0] || (info.kind === 'image' ? 'image/jpeg' : 'audio/webm')),
        Authorization: `Bearer ${getSessionToken() ?? ''}`,
      },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifie ta connexion.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Envoi impossible.');
  return data.message as SupportMessageView;
}

const cache = new Map<number, Promise<string>>();

/** Object URL of a photo or voice note of the conversation, downloaded once per session. */
export function supportMediaUrl(id: number): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    url = fetch(`${serverUrl()}/api/support/media?id=${id}`, { headers: { Authorization: `Bearer ${getSessionToken() ?? ''}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Fichier indisponible.');
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    url.catch(() => cache.delete(id));
    cache.set(id, url);
  }
  return url;
}

/** The file just sent is already on screen: no need to download it back. */
export function rememberSupportMedia(id: number, localUrl: string) {
  cache.set(id, Promise.resolve(localUrl));
}
