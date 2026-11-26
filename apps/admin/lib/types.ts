export interface PlayerRow {
  id: number;
  username: string;
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
