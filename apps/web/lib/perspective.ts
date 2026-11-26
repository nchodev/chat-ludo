'use client';

import { useSyncExternalStore } from 'react';
import { COLORS, type Color } from '@ludo/engine';
import type { Palette } from './themes';

/**
 * Online, each player sees their own camp at the bottom of the board, facing them, in the colour
 * they like: the board is turned and the colours shifted on their screen only. Both keep every
 * camp's place relative to the others, so two players still face each other diagonally whatever
 * colour each of them picked.
 */
const KEY = 'luchat:ludo-color';
const listeners = new Set<() => void>();

function read(): Color | null {
  try {
    const value = localStorage.getItem(KEY);
    return (COLORS as readonly string[]).includes(value ?? '') ? (value as Color) : null;
  } catch {
    return null;
  }
}

export function setPreferredColor(color: Color | null) {
  try {
    if (color) localStorage.setItem(KEY, color);
    else localStorage.removeItem(KEY);
  } catch {}
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Colour this player wants to see their camp in, or null to keep the one the server gave. */
export function usePreferredColor() {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Quarter turns (clockwise) that bring `you`'s camp to the preferred colour. */
export function viewShift(you: Color | null | undefined, preferred: Color | null): number {
  if (!you || !preferred) return 0;
  return (COLORS.indexOf(preferred) - COLORS.indexOf(you) + 4) % 4;
}

/** Camp drawn in the bottom-left corner, the one facing the player. */
const FACING_CORNER: Color = 'blue';

/** Quarter turns (clockwise) of the board that bring `you`'s camp to the bottom-left corner. */
export function boardTurn(you: Color | null | undefined): number {
  return you ? viewShift(you, FACING_CORNER) : 0;
}

/** Colour a camp is shown in on this screen. */
export function shownColor(color: Color, shift: number): Color {
  return COLORS[(COLORS.indexOf(color) + shift) % 4];
}

/** Camp shown in a given colour (the inverse of `shownColor`), or drawn in a corner for a board turned `shift` times. */
export function campShownAs(shown: Color, shift: number): Color {
  return COLORS[(COLORS.indexOf(shown) - shift + 4) % 4];
}

/** Palette indexed by camp, giving each camp the shades of the colour it is shown in. */
export function shiftPalette(palette: Palette, shift: number): Palette {
  if (!shift) return palette;
  return Object.fromEntries(COLORS.map((c) => [c, palette[shownColor(c, shift)]])) as Palette;
}
