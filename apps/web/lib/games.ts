'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { ALL_GAMES_ON, sanitizeGameAvailability, type GameAvailability, type GameId } from '@ludo/engine';
import { api } from './api';
import { tr } from './i18n';

/**
 * Games offered in the app. Add an entry here (and its cover in `GameCover`) to list a new one.
 * Texts are getters, so they come in the current language each time they are read.
 */
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
    get short() {
      return tr('Lance le dé et ramène tes pions', 'Roll the die and bring your pawns home');
    },
    get tagline() {
      return tr(
        'Le classique des petits chevaux : lance le dé, sors tes pions et ramène-les à la maison.',
        'The classic race game: roll the die, get your pawns out and bring them home.',
      );
    },
    href: '/ludo',
    get players() {
      return tr('2 à 4 joueurs', '2 to 4 players');
    },
    get tags() {
      return tr(['En ligne', 'Sur cet écran', 'Contre l’ordi'], ['Online', 'On this screen', 'Against the computer']);
    },
  },
  {
    id: 'dames',
    get name() {
      return tr('Dames', 'Draughts');
    },
    get short() {
      return tr('100 cases, prise obligatoire', '100 squares, captures are mandatory');
    },
    get tagline() {
      return tr(
        'Les dames internationales sur 100 cases : prise obligatoire, rafles et dames volantes.',
        'International draughts on 100 squares: mandatory captures, multiple jumps and flying kings.',
      );
    },
    href: '/dames',
    get players() {
      return tr('2 joueurs', '2 players');
    },
    get tags() {
      return tr(['En ligne', 'Avec mise', 'Sur cet écran', 'Contre l’ordi'], ['Online', 'With stakes', 'On this screen', 'Against the computer']);
    },
  },
  {
    id: 'awale',
    name: 'Awalé',
    get short() {
      return tr('Sème et récolte les graines', 'Sow and harvest the seeds');
    },
    get tagline() {
      return tr(
        'Le jeu de semailles d’Afrique de l’Ouest : sème les graines, prends-en 25 avant ton adversaire.',
        'The sowing game of West Africa: sow the seeds and capture 25 before your opponent.',
      );
    },
    href: '/awale',
    get players() {
      return tr('2 joueurs', '2 players');
    },
    get tags() {
      return tr(['En ligne', 'Avec mise', 'Sur cet écran', 'Contre l’ordi'], ['Online', 'With stakes', 'On this screen', 'Against the computer']);
    },
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
