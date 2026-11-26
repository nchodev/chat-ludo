'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'ludo-admin:token';
const LOGOUT_EVENT = 'ludo-admin:logout';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function serverUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

/** Called when the session ends (expired, or signed out from another tab action). */
export function onLogout(listener: () => void) {
  window.addEventListener(LOGOUT_EVENT, listener);
  return () => window.removeEventListener(LOGOUT_EVENT, listener);
}

/** Calls the game server's admin API; throws ApiError with a readable French message. */
export async function adminApi<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  const token = getToken();
  try {
    res = await fetch(`${serverUrl()}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/admin/login') {
    setToken(null);
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Erreur inattendue.');
  return data as T;
}

/** Loads `path` (null to wait), optionally refreshing it every `refreshMs`. */
export function useAdminData<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef(path);
  current.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const result = await adminApi<T>(path);
      if (current.current !== path) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (current.current === path) setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!refreshMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);

  return { data, error, loading, reload };
}
