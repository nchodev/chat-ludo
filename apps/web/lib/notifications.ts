'use client';

import { useSyncExternalStore } from 'react';
import type { AppNotification, NotificationsView } from '@ludo/engine';
import { api } from './api';
import { getSessionToken } from './profile';

/**
 * The bell's unread count, kept up to date by the socket (see ChatNotifier), and the latest
 * notification received, so an open notification list can show it at once.
 */
interface State {
  unread: number;
  latest: AppNotification | null;
}

let state: State = { unread: 0, latest: null };
const listeners = new Set<() => void>();
const EMPTY: State = state;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function useNotifications(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => EMPTY,
  );
}

/** Reads the unread count from the server, e.g. once signed in or back online. */
export async function refreshUnread() {
  const token = getSessionToken();
  if (!token) return set({ unread: 0, latest: null });
  try {
    const view = await api<NotificationsView>('/notifications', { token });
    set({ unread: view.unread });
  } catch {
    // Offline: the count comes back with the next refresh.
  }
}

export function receiveNotification(notification: AppNotification) {
  set({ unread: state.unread + 1, latest: notification });
}

export async function loadNotifications(before?: number): Promise<NotificationsView> {
  return api<NotificationsView>(`/notifications${before ? `?before=${before}` : ''}`, { token: getSessionToken() });
}

/** The player opened the bell: everything is seen. */
export async function markAllSeen() {
  set({ unread: 0 });
  await api('/notifications/seen', { token: getSessionToken(), body: {} }).catch(() => {});
}

export function clearNotifications() {
  set({ unread: 0, latest: null });
}
