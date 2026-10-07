'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_BOARD_THEME,
  DEFAULT_DICE_STYLE,
  DEFAULT_PAWN_STYLE,
  boardTheme,
  diceStyle,
  pawnStyle,
  type BoardTheme,
  type DiceStyle,
  type PawnStyle,
} from './themes';
import { useWallet } from './wallet';

const STORAGE_KEY = 'ludo:appearance';

export interface AppearanceChoice {
  board: string;
  dice: string;
  pawn: string;
}

const DEFAULT_CHOICE: AppearanceChoice = { board: 'classic', dice: 'classic', pawn: 'board' };
const listeners = new Set<(choice: AppearanceChoice) => void>();

function load(): AppearanceChoice {
  try {
    return { ...DEFAULT_CHOICE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export interface Appearance {
  choice: AppearanceChoice;
  board: BoardTheme;
  dice: DiceStyle;
  pawn: PawnStyle;
  update: (patch: Partial<AppearanceChoice>) => void;
}

/** The player's board, dice and pawn styles, saved on this device and shared across components. */
export function useAppearance(): Appearance {
  const [choice, setChoice] = useState<AppearanceChoice>(DEFAULT_CHOICE);

  useEffect(() => {
    setChoice(load());
    listeners.add(setChoice);
    return () => {
      listeners.delete(setChoice);
    };
  }, []);

  const update = useCallback((patch: Partial<AppearanceChoice>) => {
    const next = { ...load(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    listeners.forEach((l) => l(next));
  }, []);

  const { owns } = useWallet();
  const board = boardTheme(choice.board);
  const dice = diceStyle(choice.dice);
  const pawn = pawnStyle(choice.pawn);
  return {
    choice,
    board: owns(`board:${board.id}`, board.price) ? board : DEFAULT_BOARD_THEME,
    dice: owns(`dice:${dice.id}`, dice.price) ? dice : DEFAULT_DICE_STYLE,
    pawn: owns(`pawn:${pawn.id}`, pawn.price) ? pawn : DEFAULT_PAWN_STYLE,
    update,
  };
}
