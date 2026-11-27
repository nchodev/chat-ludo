export interface PlayerRow {
  id: number;
  username: string;
  /** Real name given at sign-up; null for accounts made before it was asked. */
  fullName: string | null;
  createdAt: number;
  xp: number;
  wins: number;
  games: number;
  coins: number;
  premiumCoins: number;
  bannedAt: number | null;
  banReason: string | null;
  online: boolean;
}
