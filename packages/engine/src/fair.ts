/**
 * Provably fair dice for online games. Before the first roll the server publishes
 * `commit = SHA-256(seed)`; roll n of the game is drawn from `HMAC-SHA256(seed, "<gameId>:<n>")`;
 * at the end the seed is revealed so anyone can check the hash and recompute every roll.
 */
export interface FairDice {
  /** SHA-256 of the seed (hex), known from the start of the game. */
  commit: string;
  /** The seed (hex), revealed once the game is over. */
  seed: string | null;
  /** Every roll of the game in order, sent with the seed. */
  rolls: number[];
  gameId: string;
}

export const fairRollMessage = (gameId: string, index: number) => `${gameId}:${index}`;

/** A die value from an HMAC digest: first byte under 252, so each face is exactly as likely. */
export function dieFromDigest(digest: Uint8Array): number {
  for (const byte of digest) if (byte < 252) return (byte % 6) + 1;
  return (digest[0]! % 6) + 1;
}
