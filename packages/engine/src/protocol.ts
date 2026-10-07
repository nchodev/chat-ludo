import type { BotLevel } from './ai';
import { COLORS, type Color } from './constants';
import { DEFAULT_RULES, type GameState, type Rules } from './game';
import type { ProgressSummary } from './progress';
import type { ReactionMessage } from './reactions';

export type SeatKind = 'empty' | 'human' | 'bot';

export interface PublicSeat {
  color: Color;
  kind: SeatKind;
  name: string;
  botLevel?: BotLevel;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  seats: PublicSeat[];
  spectators: string[];
  rules: Rules;
  game: GameState | null;
  you: Color | null;
  isHost: boolean;
  /** What you earned in the game that just ended, if you are signed in. */
  result: ProgressSummary | null;
  /** Players who asked for a rematch after the game ended. */
  rematch: Color[];
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  /** `auth` is the account session token of a signed-in player. */
  'room:create': (
    payload: { name: string; rules?: Partial<Rules>; auth?: string },
    ack: Ack<{ code: string; token: string }>,
  ) => void;
  'room:join': (payload: { code: string; name: string; token?: string; auth?: string }, ack: Ack<{ token: string }>) => void;
  'room:leave': () => void;
  'room:takeSeat': (payload: { color: Color }, ack?: Ack) => void;
  'room:setSeat': (payload: { color: Color; kind: 'empty' | 'bot'; botLevel?: BotLevel }, ack?: Ack) => void;
  'room:setRules': (payload: { rules: Partial<Rules> }, ack?: Ack) => void;
  'room:start': (ack?: Ack) => void;
  'room:backToLobby': (ack?: Ack) => void;
  'room:rematch': (ack?: Ack) => void;
  'game:roll': (ack?: Ack) => void;
  'game:move': (payload: { pawn: number }, ack?: Ack) => void;
  'game:react': (payload: { reaction: string }) => void;
  'match:join': (payload: { name: string; auth?: string }, ack?: Ack) => void;
  'match:leave': () => void;
}

export interface MatchStatus {
  waiting: number;
  /** When the game will start (ms timestamp), or null while waiting for opponents. */
  startsAt: number | null;
  /** When a computer will join a lone player (ms timestamp). */
  botAt: number | null;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:closed': (reason: string) => void;
  'room:reaction': (message: ReactionMessage) => void;
  'match:status': (status: MatchStatus) => void;
  'match:found': (match: { code: string; token: string }) => void;
}

export const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

/** Keeps only valid rule fields from untrusted input. */
export function sanitizeRules(input: unknown): Rules {
  const rules: Rules = { ...DEFAULT_RULES };
  if (!input || typeof input !== 'object') return rules;
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_RULES) as (keyof Rules)[]) {
    const value = raw[key];
    if (key === 'exitOn') {
      if (value === 'six' || value === 'oneOrSix') rules.exitOn = value;
    } else if (key === 'pawnsPerPlayer') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        rules.pawnsPerPlayer = Math.min(4, Math.max(1, Math.round(value)));
      }
    } else if (typeof value === 'boolean') {
      rules[key] = value;
    }
  }
  return rules;
}
