'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { ALL_GAMES_ON, sanitizeGameAvailability, type GameAvailability, type GameId } from '@ludo/engine';
import { api } from './api';

/** Games offered in the app. Add an entry here (and its cover in `GameCover`) to list a new one. */
export interface GameEntry {
  id: GameId;
  name: string;
  tagline: string;
  /** One line for the compact catalog card. */
  short: string;
  /** Page of the game, with its modes. */
  href: string;
  players: string;
  tags: string[];
}

export const GAMES: GameEntry[] = [
  {
    id: 'ludo',
    name: 'Ludo',
    short: 'Lance le dé et ramène tes pions',
    tagline: 'Le classique des petits chevaux : lance le dé, sors tes pions et ramène-les à la maison.',
    href: '/ludo',
    players: '2 à 4 joueurs',
    tags: ['En ligne', 'Sur cet écran', 'Contre l’ordi'],
  },
  {
    id: 'dames',
    name: 'Dames',
    short: '100 cases, prise obligatoire',
    tagline: 'Les dames internationales sur 100 cases : prise obligatoire, rafles et dames volantes.',
    href: '/dames',
    players: '2 joueurs',
    tags: ['En ligne', 'Avec mise', 'Sur cet écran', 'Contre l’ordi'],
  },
  {
    id: 'awale',
    name: 'Awalé',
    short: 'Sème et récolte les graines',
    tagline: 'Le jeu de semailles d’Afrique de l’Ouest : sème les graines, prends-en 25 avant ton adversaire.',
    href: '/awale',
    players: '2 joueurs',
    tags: ['En ligne', 'Avec mise', 'Sur cet écran', 'Contre l’ordi'],
  },
];

/** Page of the online room `code` of `game`. */
export function gameRoomPath(game: GameId, code: string) {
  return game === 'ludo' ? `/online/${code}` : `/${game}/salon/${code}`;
}

/* The admins can switch a game off; the app asks the server again at most this often. */
const REFRESH_MS = 30_000;
let availability: GameAvailability = ALL_GAMES_ON;
let fetchedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function refreshAvailability() {
  if (pending || Date.now() - fetchedAt < REFRESH_MS) return;
  pending = api<unknown>('/games')
    .then((raw) => {
      availability = sanitizeGameAvailability(raw);
      fetchedAt = Date.now();
      listeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => {
      pending = null;
    });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Which games players can start right now (all of them until the server says otherwise). */
export function useGameAvailability(): GameAvailability {
  const value = useSyncExternalStore(subscribe, () => availability, () => ALL_GAMES_ON);
  useEffect(refreshAvailability, []);
  return value;
}
