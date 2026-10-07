'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { COLOR_HEX } from '@/lib/board';

const COLORS = [...Object.values(COLOR_HEX), '#ffffff'];

function makePieces(count: number) {
  return Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        width: 6 + Math.random() * 6,
        height: 8 + Math.random() * 10,
        color: COLORS[i % COLORS.length],
        style: {
          '--drift': `${(Math.random() - 0.5) * 30}vw`,
          '--spin': `${(Math.random() - 0.5) * 1440}deg`,
          '--duration': `${2.4 + Math.random() * 2}s`,
          '--delay': `${Math.random() * 0.8}s`,
        } as CSSProperties,
      }));
}

export function Confetti({ count = 90 }: { count?: number }) {
  const [pieces, setPieces] = useState<ReturnType<typeof makePieces>>([]);

  // Random values are generated on the client only to avoid hydration mismatches.
  useEffect(() => setPieces(makePieces(count)), [count]);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti rounded-sm"
          style={{ ...p.style, left: `${p.left}%`, width: p.width, height: p.height, background: p.color }}
        />
      ))}
    </div>
  );
}
