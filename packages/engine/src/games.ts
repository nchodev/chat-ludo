/** Games of the platform; the admins can switch each one off. */
export type GameId = 'ludo' | 'dames' | 'awale';

export const GAME_IDS: GameId[] = ['ludo', 'dames', 'awale'];

export const GAME_NAMES: Record<GameId, string> = { ludo: 'Ludo', dames: 'Dames', awale: 'Awalé' };

/** Whether players can start new games of each game. */
export type GameAvailability = Record<GameId, boolean>;

export const ALL_GAMES_ON: GameAvailability = { ludo: true, dames: true, awale: true };

/** Keeps the known games from untrusted input; a missing game stays on. */
export function sanitizeGameAvailability(raw: unknown): GameAvailability {
  const result = { ...ALL_GAMES_ON };
  if (!raw || typeof raw !== 'object') return result;
  for (const id of GAME_IDS) {
    const value = (raw as Record<string, unknown>)[id];
    if (typeof value === 'boolean') result[id] = value;
  }
  return result;
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as string[]).includes(value);
}
