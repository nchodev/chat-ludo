'use client';

import { useEffect, useState } from 'react';
import type { Color, GameState, OpponentKind, ProgressSummary } from '@ludo/engine';
import type { SeatMeta } from '@/components/PlayerPanel';
import { recordFinishedGame, refreshProfile, useProfile } from './profile';

interface Options {
  state: GameState;
  seats: SeatMeta[];
  /** Colors played from this device. */
  rewardColors: Color[];
  online: boolean;
  /** For signed-in online players: what the server credited. */
  serverSummary?: ProgressSummary | null;
  /** Waits for the last move's animation before revealing the result. */
  animating: boolean;
}

/** Counts the finished game for this device's player once, and returns what they earned. */
export function useGameProgress({ state, seats, rewardColors, online, serverSummary, animating }: Options) {
  const { session } = useProfile();
  const [result, setResult] = useState<{ gameId: string; summary: ProgressSummary | null } | null>(null);
  const isOver = state.phase === 'over';
  const inGame = (c: Color) => state.players.some((p) => p.color === c);
  const color = rewardColors.find((c) => state.winners.includes(c)) ?? rewardColors.find(inGame);
  const handled = result?.gameId === state.id;

  useEffect(() => {
    if (!isOver || animating || !color || handled) return;
    if (online && session) {
      if (serverSummary === undefined || serverSummary === null) return;
      setResult({ gameId: state.id, summary: serverSummary });
      void refreshProfile();
      return;
    }
    setResult({ gameId: state.id, summary: null });
    const opponents: Partial<Record<Color, OpponentKind>> = {};
    for (const s of seats) {
      opponents[s.color] = s.isBot ? { kind: 'bot', level: s.botLevel ?? 'medium' } : { kind: 'human', online };
    }
    recordFinishedGame({ state, color, opponents, online })
      .then((summary) => setResult({ gameId: state.id, summary }))
      .catch(() => {});
  }, [isOver, animating, color, handled, online, session, serverSummary, state, seats]);

  return {
    summary: handled ? result.summary : null,
    /** Whether a player of this device took part in the game. */
    participant: !!color,
    won: !!color && state.winners.includes(color),
  };
}
