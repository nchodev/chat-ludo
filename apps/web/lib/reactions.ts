'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getReaction, type Color, type Reaction, type ReactionMessage } from '@ludo/engine';
import { sfx } from './sound';

const BUBBLE_MS = 3200;
const HIDE_KEY = 'ludo:hideReactions';

export interface Bubble {
  reaction: Reaction;
  /** Changes with every message so the pop animation replays. */
  key: number;
}

export type Bubbles = Partial<Record<Color, Bubble>>;

/** Speech bubbles shown next to each player, one per color, fading after a few seconds. */
export function useReactionBubbles(ownColors: Color[] = []) {
  const [bubbles, setBubbles] = useState<Bubbles>({});
  const [hidden, setHiddenState] = useState(false);
  const timers = useRef(new Map<Color, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);
  const own = useRef(ownColors);
  own.current = ownColors;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    setHiddenState(localStorage.getItem(HIDE_KEY) === '1');
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  const show = useCallback((message: ReactionMessage) => {
    const reaction = getReaction(message.reaction);
    if (!reaction) return;
    if (hiddenRef.current && !own.current.includes(message.color)) return;
    sfx.reaction();
    const key = ++counter.current;
    setBubbles((b) => ({ ...b, [message.color]: { reaction, key } }));
    clearTimeout(timers.current.get(message.color));
    timers.current.set(
      message.color,
      setTimeout(() => {
        setBubbles((b) => (b[message.color]?.key === key ? { ...b, [message.color]: undefined } : b));
      }, BUBBLE_MS),
    );
  }, []);

  const setHidden = useCallback((value: boolean) => {
    localStorage.setItem(HIDE_KEY, value ? '1' : '0');
    setHiddenState(value);
  }, []);

  return { bubbles, show, hidden, setHidden };
}
