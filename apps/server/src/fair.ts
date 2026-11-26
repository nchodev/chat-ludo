import { createHash, createHmac, randomBytes } from 'node:crypto';
import { dieFromDigest, fairRollMessage, type FairDice } from '@ludo/engine';

/** Server side of a game's provably fair dice: the seed stays secret until the game is over. */
export interface FairSeed {
  gameId: string;
  seed: string;
  commit: string;
  rolls: number[];
}

export function newFairSeed(gameId: string): FairSeed {
  const seed = randomBytes(32).toString('hex');
  return { gameId, seed, commit: createHash('sha256').update(seed).digest('hex'), rolls: [] };
}

/** Draws the game's next die and remembers it. */
export function nextFairRoll(fair: FairSeed): number {
  const digest = createHmac('sha256', fair.seed).update(fairRollMessage(fair.gameId, fair.rolls.length)).digest();
  const value = dieFromDigest(digest);
  fair.rolls.push(value);
  return value;
}

/** What the players see: the commitment during the game, the seed and every roll once it's over. */
export function publicFair(fair: FairSeed, over: boolean): FairDice {
  return { gameId: fair.gameId, commit: fair.commit, seed: over ? fair.seed : null, rolls: over ? fair.rolls : [] };
}
