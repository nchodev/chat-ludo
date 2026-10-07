'use client';

import { ownsItem, type AppearanceChoice, type ShopItem } from '@ludo/engine';
import { chooseAppearance, useProfile } from './profile';
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

export interface Appearance {
  choice: AppearanceChoice;
  board: BoardTheme;
  dice: DiceStyle;
  pawn: PawnStyle;
  update: (patch: Partial<AppearanceChoice>) => Promise<void>;
}

/** The player's board, dice and pawn styles, falling back to free ones if not owned. */
export function useAppearance(): Appearance {
  const { profile } = useProfile();
  const choice = profile.appearance;
  const owns = (item: string) => ownsItem(profile, item as ShopItem);
  const board = boardTheme(choice.board);
  const dice = diceStyle(choice.dice);
  const pawn = pawnStyle(choice.pawn);
  return {
    choice,
    board: owns(`board:${board.id}`) ? board : DEFAULT_BOARD_THEME,
    dice: owns(`dice:${dice.id}`) ? dice : DEFAULT_DICE_STYLE,
    pawn: owns(`pawn:${pawn.id}`) ? pawn : DEFAULT_PAWN_STYLE,
    update: chooseAppearance,
  };
}
