/**
 * Inviting friends: once an invited account has played `gamesNeeded` online games against
 * real players, both accounts get Free coins. An inviter is rewarded for `maxRewarded` friends at most.
 */
export const REFERRAL = {
  gamesNeeded: 3,
  referrerCoins: 500,
  newcomerCoins: 200,
  maxRewarded: 20,
} as const;

export interface ReferralView {
  /** Invited friends, newest first. */
  invited: { username: string; games: number; rewarded: boolean; joinedAt: number }[];
  /** Coins earned so far from invitations. */
  earned: number;
  /** Who invited this player, if anyone, and whether the welcome bonus was paid. */
  invitedBy: { username: string; games: number; rewarded: boolean } | null;
}

/** Same rule as usernames: what can follow `?ref=` in an invitation link. */
export const REFERRAL_CODE = /^[\p{L}\p{N}_-]{3,16}$/u;
