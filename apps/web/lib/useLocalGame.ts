'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  applyMove,
  chooseMove,
  createGame,
  forfeit,
  rollDice,
  rollDie,
  type BotLevel,
  type Color,
  type GameState,
  type Rules,
} from '@ludo/engine';
import { DICE_ANIMATION_MS } from '@/components/Dice';

export interface LocalSeat {
  color: Color;
  kind: 'human' | 'bot' | 'none';
  name: string;
  botLevel: BotLevel;
}

export interface LocalSetup {
  seats: LocalSeat[];
  rules: Rules;
}

const BOT_ROLL_DELAY_MS = 950;
const BOT_MOVE_DELAY_MS = DICE_ANIMATION_MS + 450;

export function activeSeats(setup: LocalSetup): LocalSeat[] {
  return setup.seats.filter((s) => s.kind !== 'none');
}

export function useLocalGame(setup: LocalSetup) {
  const [state, setState] = useState<GameState>(() =>
    createGame(
      activeSeats(setup).map((s) => ({ color: s.color, name: s.name })),
      setup.rules,
    ),
  );

  const currentSeat = setup.seats.find((s) => s.color === state.players[state.current].color);
  const isBotTurn = currentSeat?.kind === 'bot' && state.phase !== 'over';

  useEffect(() => {
    if (!isBotTurn || !currentSeat) return;
    const timer = setTimeout(
      () => {
        setState((s) =>
          s.phase === 'roll' ? rollDice(s, rollDie()) : s.phase === 'move' ? applyMove(s, chooseMove(s, currentSeat.botLevel)) : s,
        );
      },
      state.phase === 'roll' ? BOT_ROLL_DELAY_MS : BOT_MOVE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [state, isBotTurn, currentSeat]);

  const roll = useCallback(() => {
    setState((s) => (s.phase === 'roll' ? rollDice(s, rollDie()) : s));
  }, []);

  const move = useCallback((pawn: number) => {
    setState((s) => (s.phase === 'move' ? applyMove(s, pawn) : s));
  }, []);

  const abandon = useCallback((color: Color) => {
    setState((s) => (s.phase !== 'over' && !s.forfeited.includes(color) ? forfeit(s, color) : s));
  }, []);

  const restart = useCallback(() => {
    setState(
      createGame(
        activeSeats(setup).map((s) => ({ color: s.color, name: s.name })),
        setup.rules,
      ),
    );
  }, [setup]);

  return { state, roll, move, abandon, restart, isBotTurn };
}
