/**
 * Two-player board games played online the same way: rooms, quick match, clock, stake, draw offers.
 * Each has its own rules module; this is what they share.
 */

import type { AwaleState } from './awale';
import type { DraughtsState, Side } from './draughts';
import type { RoomStake } from './stakes';

export type DuelGame = 'dames' | 'awale';

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
}

export type DuelRoomView = { [K in DuelGame]: DuelRoomViewOf<K> }[DuelGame];

export interface DuelQueueStatus {
  waiting: number;
  table: string | null;
}

/** What a client sends to play: draughts name squares, awalé a pit. */
export type DuelMovePayload = { from: number; to: number; captures?: number[] } | { pit: number };
