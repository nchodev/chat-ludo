'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { peekSocket, reconnectNow, subscribeSocketStatus } from './socket';

/**
 * - `offline`: the device has no network.
 * - `reconnecting`: the network is there but the game server can't be reached (only once the app uses it).
 */
export type Connectivity = 'online' | 'offline' | 'reconnecting';

function snapshot(): Connectivity {
  if (!navigator.onLine) return 'offline';
  const socket = peekSocket();
  return socket && socket.active && !socket.connected ? 'reconnecting' : 'online';
}

function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  const unsubscribe = subscribeSocketStatus(listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
    unsubscribe();
  };
}

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribe, snapshot, () => 'online');
}

/** Reconnects to the game server as soon as the network comes back or the app returns to the foreground. */
export function useReconnectOnResume() {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reconnectNow();
    };
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export const NOT_CONNECTED = 'Pas de connexion au serveur. Réessaie dans un instant.';
