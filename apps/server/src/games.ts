import { ALL_GAMES_ON, GAME_NAMES, sanitizeGameAvailability, type GameAvailability, type GameId } from '@ludo/engine';
import { getSetting, saveSetting } from './db';

const GAMES_SETTING = 'games';
let availability: GameAvailability = { ...ALL_GAMES_ON };

/** Loads which games the admins switched off. */
export function loadGameSettings() {
  availability = sanitizeGameAvailability(getSetting(GAMES_SETTING));
}

export function gameAvailability(): GameAvailability {
  return { ...availability };
}

export function setGameEnabled(game: GameId, enabled: boolean) {
  availability = { ...availability, [game]: enabled };
  saveSetting(GAMES_SETTING, availability);
}

/** Message given to players trying to start a game that is switched off, or null if it is on. */
export function gameClosedReason(game: GameId): string | null {
  return availability[game] ? null : `${GAME_NAMES[game]} : ce jeu est momentanément indisponible.`;
}
