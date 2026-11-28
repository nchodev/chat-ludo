'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getReaction, type Color, type Reaction } from '@ludo/engine';
import { sfx } from './sound';

const BUBBLE_MS = 3200;
const HIDE_KEY = 'ludo:hideReactions';
const USE_KEY = 'ludo:reactionUse';

/** How many times a player sent each reaction, by reaction id. */
type ReactionUse = Record<string, number>;

/** Kept on this device, apart for each account that plays on it. */
const useKey = (username: string | undefined) => (username ? `${USE_KEY}:${username}` : USE_KEY);

function readUse(key: string): ReactionUse {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    return saved && typeof saved === 'object' ? (saved as ReactionUse) : {};
  } catch {
    return {};
  }
}

/** Counts what the player sends and puts their most used reactions first. */
export function useReactionRanking(username: string | undefined) {
  const key = useKey(username);
  /** Read when asked for, so the order only moves between two openings of the panel. */
  const rank = useCallback(
    (reactions: Reaction[]) => {
      const use = readUse(key);
      // The sort is stable: reactions used as often keep their usual order.
      return [...reactions].sort((a, b) => (Number(use[b.id]) || 0) - (Number(use[a.id]) || 0));
    },
    [key],
  );
  const count = useCallback(
    (id: string) => {
      const use = readUse(key);
      try {
        localStorage.setItem(key, JSON.stringify({ ...use, [id]: (Number(use[id]) || 0) + 1 }));
      } catch {
        /* storage blocked: the order just stays as it is */
      }
    },
    [key],
  );
  return { rank, count };
}

export interface Bubble {
  reaction: Reaction;
  /** Changes with every message so the pop animation replays. */
  key: number;
}

export type Bubbles<K extends string = Color> = Partial<Record<K, Bubble>>;

/** Speech bubbles shown next to each player, one per color (or side), fading after a few seconds. */
export function useReactionBubbles<K extends string = Color>(ownColors: K[] = []) {
  const [bubbles, setBubbles] = useState<Bubbles<K>>({});
  const [hidden, setHiddenState] = useState(false);
  const timers = useRef(new Map<K, ReturnType<typeof setTimeout>>());
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

  const show = useCallback((message: { color: K; reaction: string }) => {
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
