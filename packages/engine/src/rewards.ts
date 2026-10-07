import type { BotLevel } from './ai';
import type { Color } from './constants';
import type { GameState } from './game';

export type OpponentKind = { kind: 'bot'; level: BotLevel } | { kind: 'human'; online: boolean };

export const REWARDS = {
  bot: { easy: 10, medium: 25, hard: 50 } satisfies Record<BotLevel, number>,
  onlineHuman: 40,
  localHuman: 15,
  perCapture: 5,
  maxCaptureBonus: 30,
  flawless: 20,
} as const;

export type RewardLine =
  | { type: 'opponent'; color: Color; opponent: OpponentKind; forfeited: boolean; coins: number }
  | { type: 'captures'; count: number; coins: number }
  | { type: 'flawless'; coins: number };

export interface Reward {
  total: number;
  lines: RewardLine[];
}

function opponentValue(opponent: OpponentKind): number {
  if (opponent.kind === 'bot') return REWARDS.bot[opponent.level];
  return opponent.online ? REWARDS.onlineHuman : REWARDS.localHuman;
}

/**
 * Coins earned by `winner` once the game is over: a base amount per beaten opponent
 * (halved if that opponent forfeited), plus bonuses for captures and for never being captured.
 */
export function computeReward(
  state: GameState,
  winner: Color,
  opponentKind: (color: Color) => OpponentKind,
): Reward | null {
  if (state.phase !== 'over' || !state.winners.includes(winner)) return null;

  const lines: RewardLine[] = [];
  for (const { color } of state.players) {
    if (state.winners.includes(color)) continue;
    const opponent = opponentKind(color);
    const forfeited = state.forfeited.includes(color);
    const base = opponentValue(opponent);
    lines.push({ type: 'opponent', color, opponent, forfeited, coins: forfeited ? Math.ceil(base / 2) : base });
  }

  const { captures, captured } = state.stats[winner];
  if (captures > 0) {
    lines.push({ type: 'captures', count: captures, coins: Math.min(REWARDS.maxCaptureBonus, captures * REWARDS.perCapture) });
  }
  const wonOnBoard = state.lastEvent?.type === 'win' && state.lastEvent.reason === 'finish';
  if (wonOnBoard && captured === 0) lines.push({ type: 'flawless', coins: REWARDS.flawless });

  return { total: lines.reduce((sum, l) => sum + l.coins, 0), lines };
}
