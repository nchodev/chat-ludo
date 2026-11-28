/**
 * Two-player board games played online the same way: rooms, quick match, clock, stake, draw offers.
 * Each has its own rules module; this is what they share.
 */

import type { AwaleState } from './awale';
import type { DraughtsState, Side } from './draughts';
import type { RoomStake } from './stakes';

export type DuelGame = 'dames' | 'awale';

/** Thinking time a private room's host can pick, in minutes per player; quick match uses the default. */
export const DUEL_MINUTES = [10, 15, 20, 30];
export const DEFAULT_DUEL_MINUTES = 10;
/** Added to a player's clock after each of their moves, so a won game isn't lost on time at the end. */
export const DUEL_INCREMENT_MS = 5_000;
/** Time to play your first move; past it the game is cancelled and the stakes given back. */
export const DUEL_FIRST_MOVE_MS = 30_000;

export function isDuelMinutes(value: unknown): value is number {
  return typeof value === 'number' && DUEL_MINUTES.includes(value);
}

export const DUEL_GAMES: DuelGame[] = ['dames', 'awale'];

export function isDuelGame(value: unknown): value is DuelGame {
  return typeof value === 'string' && (DUEL_GAMES as string[]).includes(value);
}

export interface DuelStates {
  dames: DraughtsState;
  awale: AwaleState;
}

export type DuelState = DuelStates[DuelGame];

export interface DuelSeatView {
  name: string;
  connected: boolean;
  isHost: boolean;
  /** With a stake set, why this player couldn't put it in: no account or not enough coins. */
  stakeIssue: 'guest' | 'funds' | null;
}

export interface DuelRoomViewOf<K extends DuelGame> {
  kind: K;
  code: string;
  /** Players in the room, in the order they arrived (the host first). */
  players: DuelSeatView[];
  /** Side of each player in the current or last game, by index in `players`. */
  colors: Side[] | null;
  you: number | null;
  yourSide: Side | null;
  isHost: boolean;
  spectators: number;
  game: DuelStates[K] | null;
  /** Thinking time left; `running` is the side whose clock is ticking. */
  clock: { white: number; black: number; running: Side | null } | null;
  drawOffer: Side | null;
  rematch: Side[];
  stake: RoomStake | null;
  wager: string | null;
  /** Made by quick match: both players and the stake are fixed. */
  matched: boolean;
  /** Thinking time per player, in minutes, for the room's games. */
  minutes: number;
  /** The side to move hasn't played its first move yet: the game is cancelled at the end of this delay. */
  firstMove: { side: Side; endsIn: number } | null;
}

export type DuelRoomView = { [K in DuelGame]: DuelRoomViewOf<K> }[DuelGame];

export interface DuelQueueStatus {
  waiting: number;
  table: string | null;
}

/** What a client sends to play: draughts name squares, awalé a pit. */
export type DuelMovePayload = { from: number; to: number; captures?: number[] } | { pit: number };
