'use client';

import { useEffect, useState } from 'react';
import {
  BASE,
  FINISHED,
  HOME_COLUMN_START,
  LAST_TRACK_STEP,
  TRACK_LENGTH,
  type Color,
  type GameState,
} from '@ludo/engine';
import { sfx } from './sound';

export const STEP_MS = 110;

/** Every intermediate position a pawn goes through, excluding `from`. */
export function movePath(from: number, to: number): number[] {
  if (from === BASE) return [0];
  const path: number[] = [];
  let pos = from;
  while (pos !== to && path.length < 64) {
    if (pos >= HOME_COLUMN_START) pos = Math.min(pos + 1, FINISHED);
    else if (pos === LAST_TRACK_STEP && to >= HOME_COLUMN_START) pos = HOME_COLUMN_START;
    else pos = (pos + 1) % TRACK_LENGTH;
    path.push(pos);
  }
  return path;
}

interface Step {
  key: string;
  pos: number;
}

/**
 * Pawn positions to display: the last move is replayed square by square,
 * and captured pawns stay in place until the mover lands on them.
 */
export function useAnimatedPawns(state: GameState) {
  const last = state.lastEvent;
  const event = last?.type === 'move' ? last : last?.type === 'win' ? (last.move ?? null) : null;
  const moveKey = event ? `${state.rollId}:${event.color}:${event.pawn}:${event.from}:${event.to}` : null;
  const [step, setStep] = useState<Step | null>(null);
  const [doneKey, setDoneKey] = useState<string | null>(null);

  useEffect(() => {
    if (!moveKey || !event) return;
    const path = movePath(event.from, event.to);
    const timers = path.map((pos, i) =>
      setTimeout(() => {
        setStep({ key: moveKey, pos });
        sfx.step();
      }, i * STEP_MS),
    );
    timers.push(
      setTimeout(() => {
        setDoneKey(moveKey);
        if (event.captures.length > 0) sfx.capture();
        else if (event.to === FINISHED) sfx.finish();
      }, path.length * STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
    // `event` is fully described by `moveKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey]);

  const animating = !!moveKey && doneKey !== moveKey;
  if (!animating || !event) return { pawns: state.pawns, animating: false };

  const pawns: Partial<Record<Color, number[]>> = {};
  for (const [color, positions] of Object.entries(state.pawns) as [Color, number[]][]) {
    pawns[color] = [...positions];
  }
  pawns[event.color]![event.pawn] = step?.key === moveKey ? step.pos : event.from;
  for (const cap of event.captures) pawns[cap.color]![cap.pawn] = cap.from;
  return { pawns, animating: true };
}
