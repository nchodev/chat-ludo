'use client';

import { serverUrl } from './socket';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the game server's JSON API; throws ApiError with a readable French message. */
export async function api<T>(path: string, { token, body }: { token?: string | null; body?: unknown } = {}): Promise<T> {
  let res: Response;
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
    throw new ApiError(0, 'Serveur injoignable. Vérifie ta connexion.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Erreur inattendue.');
  return data as T;
}
