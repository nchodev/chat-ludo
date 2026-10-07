'use client';

import { useEffect, useRef, useState } from 'react';
import { sfx } from '@/lib/sound';
import { DEFAULT_DICE_STYLE, type ColorShades, type DiceStyle } from '@/lib/themes';

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export const DICE_ANIMATION_MS = 500;

interface DiceFaceProps {
  value: number;
  shades: ColorShades;
  diceStyle?: DiceStyle;
  size?: number;
  highlighted?: boolean;
}

/** Static die face, also used for style previews. */
export function DiceFace({ value, shades, diceStyle = DEFAULT_DICE_STYLE, size = 72, highlighted }: DiceFaceProps) {
  const pip = value === 1 ? diceStyle.one(shades) : diceStyle.pip(shades);
  const edge = diceStyle.edge(shades);
  const depth = Math.round(size / 12);
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: diceStyle.face(shades),
        border: diceStyle.glow ? `2px solid ${shades.main}` : undefined,
        boxShadow: [
          highlighted && `0 0 0 ${Math.max(3, size / 18)}px ${shades.main}`,
          `0 ${depth}px 0 ${edge}`,
          `0 ${depth * 2}px ${depth * 3}px rgba(0,0,0,0.4)`,
          diceStyle.glow && `0 0 ${size / 4}px ${shades.main}88`,
        ]
          .filter(Boolean)
          .join(', '),
      }}
    >
      {diceStyle.numeric ? (
        <span className="font-bold leading-none" style={{ fontSize: size * 0.55, color: pip }}>
          {value}
        </span>
      ) : (
        <span className="grid grid-cols-3 grid-rows-3" style={{ width: size * 0.66, height: size * 0.66 }}>
          {PIPS[value].map(([col, row], i) => (
            <span
              key={i}
              className="m-auto rounded-full"
              style={{
                width: size * 0.15,
                height: size * 0.15,
                gridColumn: col + 1,
                gridRow: row + 1,
                background: pip,
                boxShadow: diceStyle.glow ? `0 0 ${size / 10}px ${pip}` : 'inset 0 2px 2px rgba(0,0,0,0.45)',
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

interface DiceProps {
  value: number | null;
  rollId: number;
  shades: ColorShades;
  diceStyle?: DiceStyle;
  canRoll: boolean;
  onRoll: () => void;
}

export function Dice({ value, rollId, shades, diceStyle, canRoll, onRoll }: DiceProps) {
  const [shown, setShown] = useState(value ?? 6);
  const [rolling, setRolling] = useState(false);
  const lastRollId = useRef(rollId);

  useEffect(() => {
    if (rollId === lastRollId.current) {
      if (value) setShown(value);
      return;
    }
    lastRollId.current = rollId;
    setRolling(true);
    sfx.roll();
    const interval = setInterval(() => setShown(1 + Math.floor(Math.random() * 6)), 70);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setRolling(false);
      if (value) setShown(value);
    }, DICE_ANIMATION_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [rollId, value]);

  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!canRoll}
      aria-label={canRoll ? 'Lancer le dé' : `Dé : ${shown}`}
      className={`shrink-0 rounded-[22px] ${canRoll ? 'dice-invite cursor-pointer' : ''} ${rolling ? 'dice-rolling' : ''}`}
    >
      <DiceFace value={shown} shades={shades} diceStyle={diceStyle} highlighted={canRoll} />
    </button>
  );
}
