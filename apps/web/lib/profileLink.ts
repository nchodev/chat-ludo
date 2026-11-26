'use client';

import { api } from './api';
import { getSessionToken } from './profile';

const USERNAME_RE = /^[\p{L}\p{N}_-]{3,16}$/u;

export type Relation = 'none' | 'self' | 'friend' | 'outgoing' | 'incoming';

export interface PublicPlayer {
  username: string;
  level: number;
  rank: number;
  games: number;
  wins: number;
  /** Null when the viewer is not signed in. */
  relation: Relation | null;
}

/** Link to a player's public card, the one encoded in their QR code. */
export function profileLink(username: string) {
  return `${window.location.origin}/u/${encodeURIComponent(username)}`;
}

/**
 * Username behind a scanned code: a LuChat profile link (from any address the app was
 * served on, the link outlives a domain change) or a bare username.
 */
export function usernameFromCode(text: string): string | null {
  const value = text.trim();
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const match = /^\/u\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return null;
    const name = decodeURIComponent(match[1]);
    return USERNAME_RE.test(name) ? name : null;
  } catch {
    return USERNAME_RE.test(value) ? value : null;
  }
}

const ROOM_CODE_RE = /^[A-Z0-9]{5}$/;

/** Page a scanned LuChat code leads to: a player's card or a game room invitation. */
export function appPathFromCode(text: string): string | null {
  const username = usernameFromCode(text);
  if (username) return `/u/${encodeURIComponent(username)}`;
  try {
    const url = new URL(text.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const room = /^\/(online|dames\/salon|awale\/salon)\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
    const code = room?.[2].toUpperCase();
    return room && code && ROOM_CODE_RE.test(code) ? `/${room[1]}/${code}` : null;
  } catch {
    return null;
  }
}

export function fetchPublicPlayer(username: string) {
  return api<PublicPlayer>(`/players/profile?username=${encodeURIComponent(username)}`, { token: getSessionToken() });
}
