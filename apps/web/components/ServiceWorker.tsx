'use client';

import { useEffect } from 'react';

/** Registers the offline service worker in production builds only, so it never caches dev assets. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
