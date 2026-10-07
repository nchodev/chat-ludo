import type { Color } from './constants';
import type { GameState } from './game';

export interface Reaction {
  id: string;
  emoji: string;
  /** Short phrase; emoji-only reactions have none. */
  text?: string;
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
  { id: 'hurry', emoji: '⏰', text: 'Dépêche-toi !' },
  { id: 'easy', emoji: '😎', text: 'Trop facile !' },
  { id: 'bye', emoji: '👋', text: 'Retour à la maison !' },
  { id: 'revenge', emoji: '😤', text: 'Je vais me venger !' },
  { id: 'lucky', emoji: '🍀', text: 'Quelle chance…' },
  { id: 'six', emoji: '🎲', text: 'Allez, un 6 !' },
  { id: 'mercy', emoji: '🙏', text: 'Pitié, pas moi !' },
  { id: 'cheat', emoji: '🤨', text: 'Tricheur !' },
  { id: 'king', emoji: '👑', text: 'Je suis le roi !' },
  { id: 'oops', emoji: '😬', text: 'Aïe, ça fait mal…' },
  { id: 'gl', emoji: '🤝', text: 'Bonne chance !' },
  { id: 'gg', emoji: '👏', text: 'Bien joué !' },
];

const BY_ID = new Map(REACTIONS.map((r) => [r.id, r]));

export function getReaction(id: string): Reaction | undefined {
  return BY_ID.get(id);
}

export function isReactionId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
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
