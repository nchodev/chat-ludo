import type { Color } from './constants';
import type { Side } from './draughts';
import type { GameState } from './game';
import type { GameId } from './games';

export interface Reaction {
  id: string;
  emoji: string;
  /** Short phrase; emoji-only reactions have none. */
  text?: string;
  /** The only game offering it, for what only makes sense there; every game otherwise. */
  game?: GameId;
}

/** Fixed list of reactions: players pick from it, there is no free text to moderate. */
export const REACTIONS: Reaction[] = [
  { id: 'laugh', emoji: '😂' },
  { id: 'cool', emoji: '😎' },
  { id: 'angry', emoji: '😡' },
  { id: 'cry', emoji: '😭' },
  { id: 'shock', emoji: '😱' },
  { id: 'think', emoji: '🤔' },
  { id: 'fire', emoji: '🔥' },
  { id: 'clap', emoji: '👏' },
  { id: 'pray', emoji: '🙏' },
  { id: 'sleep', emoji: '😴' },
  { id: 'party', emoji: '🎉' },
  { id: 'heart', emoji: '❤️' },
  { id: 'like', emoji: '👍' },
  { id: 'rofl', emoji: '🤣' },
  { id: 'sweat', emoji: '😅' },
  { id: 'wink', emoji: '😉' },
  { id: 'eyes', emoji: '👀' },
  { id: 'strong', emoji: '💪' },
  { id: 'mind', emoji: '🤯' },
  { id: 'angel', emoji: '😇' },
  { id: 'hurry', emoji: '⏰', text: 'Dépêche-toi !' },
  { id: 'easy', emoji: '😎', text: 'Trop facile !' },
  { id: 'bye', emoji: '👋', text: 'Retour à la maison !', game: 'ludo' },
  { id: 'revenge', emoji: '😤', text: 'Je vais me venger !' },
  { id: 'lucky', emoji: '🍀', text: 'Quelle chance…' },
  { id: 'six', emoji: '🎲', text: 'Allez, un 6 !', game: 'ludo' },
  { id: 'mercy', emoji: '🙏', text: 'Pitié, pas moi !' },
  { id: 'cheat', emoji: '🤨', text: 'Tricheur !' },
  { id: 'king', emoji: '👑', text: 'Je suis le roi !' },
  { id: 'oops', emoji: '😬', text: 'Aïe, ça fait mal…' },
  { id: 'gl', emoji: '🤝', text: 'Bonne chance !' },
  { id: 'gg', emoji: '👏', text: 'Bien joué !' },
  { id: 'hello', emoji: '👋', text: 'Salut !' },
  { id: 'thanks', emoji: '😊', text: 'Merci !' },
  { id: 'sorry', emoji: '🙇', text: 'Désolé !' },
  { id: 'wow', emoji: '😮', text: 'Quel coup !' },
  { id: 'yourturn', emoji: '👉', text: 'À toi de jouer !' },
  { id: 'wait', emoji: '✋', text: 'Attends un peu…' },
  { id: 'watch', emoji: '👀', text: 'Regarde bien !' },
  { id: 'notover', emoji: '💪', text: 'Rien n’est fini !' },
  { id: 'toogood', emoji: '🔥', text: 'Tu es trop fort !' },
  { id: 'again', emoji: '🔁', text: 'Une revanche ?' },

  { id: 'ludo-nosix', emoji: '😩', text: 'Toujours pas de 6 !', game: 'ludo' },
  { id: 'ludo-sixagain', emoji: '🤩', text: 'Encore un 6 !', game: 'ludo' },
  { id: 'ludo-dice', emoji: '🙄', text: 'Ce dé m’en veut !', game: 'ludo' },
  { id: 'ludo-caught', emoji: '😈', text: 'Je t’ai attrapé !', game: 'ludo' },
  { id: 'ludo-behind', emoji: '👀', text: 'Je suis derrière toi…', game: 'ludo' },
  { id: 'ludo-spare', emoji: '🥺', text: 'Ne me mange pas !', game: 'ludo' },
  { id: 'ludo-safe', emoji: '🛡️', text: 'Je suis à l’abri !', game: 'ludo' },
  { id: 'ludo-block', emoji: '🚧', text: 'Tu ne passes pas !', game: 'ludo' },
  { id: 'ludo-out', emoji: '🚀', text: 'Je sors un pion !', game: 'ludo' },
  { id: 'ludo-almost', emoji: '🏠', text: 'Presque à la maison !', game: 'ludo' },

  { id: 'dames-forced', emoji: '☝️', text: 'Tu es obligé de prendre !', game: 'dames' },
  { id: 'dames-sweep', emoji: '💥', text: 'Quelle rafle !', game: 'dames' },
  { id: 'dames-trap', emoji: '🪤', text: 'Tombé dans le piège !', game: 'dames' },
  { id: 'dames-crown', emoji: '👑', text: 'Et voilà ma dame !', game: 'dames' },
  { id: 'dames-nocrown', emoji: '🚫', text: 'Pas de dame pour toi !', game: 'dames' },
  { id: 'dames-gift', emoji: '🎁', text: 'Merci pour le pion !', game: 'dames' },
  { id: 'dames-sacrifice', emoji: '😏', text: 'C’était un sacrifice…', game: 'dames' },
  { id: 'dames-missed', emoji: '🙈', text: 'Je ne l’ai pas vu !', game: 'dames' },
  { id: 'dames-think', emoji: '🧠', text: 'Réfléchis bien…', game: 'dames' },

  { id: 'awale-harvest', emoji: '🌾', text: 'Belle récolte !', game: 'awale' },
  { id: 'awale-seeds', emoji: '🫳', text: 'À moi les graines !', game: 'awale' },
  { id: 'awale-count', emoji: '🧮', text: 'Compte bien tes graines !', game: 'awale' },
  { id: 'awale-trap', emoji: '🪤', text: 'Tombé dans le piège !', game: 'awale' },
  { id: 'awale-feed', emoji: '🍽️', text: 'Nourris-moi !', game: 'awale' },
  { id: 'awale-empty', emoji: '🕳️', text: 'Tes trous se vident !', game: 'awale' },
  { id: 'awale-store', emoji: '📈', text: 'Mon grenier se remplit !', game: 'awale' },
  { id: 'awale-missed', emoji: '🙈', text: 'Je n’avais pas compté !', game: 'awale' },
  { id: 'awale-elder', emoji: '🧓', text: 'La leçon du vieux !', game: 'awale' },
];

const BY_ID = new Map(REACTIONS.map((r) => [r.id, r]));

export function getReaction(id: string): Reaction | undefined {
  return BY_ID.get(id);
}

export function isReactionId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Reactions offered in a game: the ones of every game, then its own. */
export function reactionsFor(game: GameId): Reaction[] {
  return REACTIONS.filter((r) => !r.game || r.game === game);
}

export function isReactionFor(game: GameId, value: unknown): value is string {
  if (!isReactionId(value)) return false;
  const only = BY_ID.get(value)!.game;
  return !only || only === game;
}

/** A reaction sent by one side of a two-player game. */
export interface DuelReactionMessage {
  side: Side;
  reaction: string;
}

export interface ReactionMessage {
  color: Color;
  reaction: string;
}

/** Minimum delay between two reactions from the same player. */
export const REACTION_COOLDOWN_MS = 1200;

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/** Identifies the latest event, so each one triggers bot reactions only once. */
export function eventKey(state: GameState): string {
  return `${state.id}:${state.rollId}:${state.lastEvent?.type ?? ''}`;
}

/**
 * A reaction one of the `bots` might send after the latest event (a capture or the end
 * of the game), or null. Bots don't react every time, to keep the chat readable.
 */
export function botReaction(state: GameState, bots: Color[], rng: () => number = Math.random): ReactionMessage | null {
  const event = state.lastEvent;
  if (!event || bots.length === 0) return null;
  const shuffled = [...bots].sort(() => rng() - 0.5);

  if (event.type === 'win') {
    for (const color of shuffled) {
      const won = event.colors.includes(color);
      if (rng() < (won ? 0.7 : 0.4)) {
        return { color, reaction: pick(won ? ['king', 'party', 'easy'] : ['gg', 'cry'], rng) };
      }
    }
    return null;
  }

  const move = event.type === 'move' ? event : null;
  if (!move || move.captures.length === 0) return null;
  for (const color of shuffled) {
    if (color === move.color && rng() < 0.5) return { color, reaction: pick(['bye', 'laugh', 'easy', 'cool'], rng) };
    if (move.captures.some((c) => c.color === color) && rng() < 0.5) {
      return { color, reaction: pick(['revenge', 'angry', 'cry', 'oops'], rng) };
    }
  }
  return null;
}
