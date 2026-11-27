'use client';

import { memo } from 'react';
import type { AwaleMove, Side } from '@ludo/engine';
import { tr } from '@/lib/i18n';

/** Fixed spots of the first seeds in a pit, in % of the pit; more seeds pile up on the same spots. */
const SPOTS: [number, number][] = [
  [50, 50], [34, 40], [64, 36], [38, 64], [64, 62], [50, 28], [28, 54], [72, 50],
  [50, 72], [40, 50], [60, 48], [46, 38], [56, 62], [34, 30], [68, 70], [30, 68],
];
const SEED_COLORS = ['#e9d8b4', '#d9c294', '#c9a86e', '#efe3c8', '#bf9a5c'];

function Seeds({ count, pit }: { count: number; pit: number }) {
  const shown = Math.min(count, SPOTS.length);
  return (
    <>
      {Array.from({ length: shown }, (_, i) => {
        const [x, y] = SPOTS[i];
        return (
          <span
            key={i}
            className="absolute size-[17%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[inset_-1px_-1.5px_0_rgba(0,0,0,0.35),0_1px_1px_rgba(0,0,0,0.4)]"
            style={{ left: `${x}%`, top: `${y}%`, background: SEED_COLORS[(i * 3 + pit) % SEED_COLORS.length] }}
          />
        );
      })}
    </>
  );
}

/** One seed, for logos and player bars. */
export function SeedDot({ className = '' }: { className?: string }) {
  return <span className={`inline-block rounded-full bg-[#e2cfa6] shadow-[inset_-1px_-1.5px_0_rgba(0,0,0,0.35)] ${className}`} />;
}

interface Props {
  pits: number[];
  legalMoves: number[];
  lastMove: AwaleMove | null;
  /** The second player (North, pits 6 to 11) sits at the bottom. */
  flipped: boolean;
  interactive: boolean;
  onPlay: (pit: number) => void;
}

/**
 * The 2 × 6 board. Each player owns the row in front of them and seeds travel counter-clockwise:
 * left to right on the bottom row, right to left on the top one.
 */
export const AwaleBoard = memo(function AwaleBoard({ pits, legalMoves, lastMove, flipped, interactive, onPlay }: Props) {
  const bottomSide: Side = flipped ? 'black' : 'white';
  const bottom = bottomSide === 'white' ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
  const top = (bottomSide === 'white' ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5]).reverse();
  const sownOrder = new Map<number, number>();
  lastMove?.sown.forEach((pit, i) => {
    if (!sownOrder.has(pit)) sownOrder.set(pit, i);
  });
  const moveKey = lastMove ? `${lastMove.side}${lastMove.pit}${lastMove.sown.length}` : '';

  const cell = (pit: number) => {
    const count = pits[pit];
    const playable = interactive && legalMoves.includes(pit);
    const played = lastMove?.pit === pit;
    const captured = lastMove?.captured.includes(pit) ?? false;
    const wave = sownOrder.get(pit);
    return (
      <button
        key={`${pit}-${moveKey}`}
        type="button"
        disabled={!playable}
        onClick={() => onPlay(pit)}
        aria-label={`Trou ${(pit % 6) + 1}${pit < 6 ? ' Sud' : ' Nord'}, ${count} graine${count > 1 ? 's' : ''}${playable ? ', jouable' : ''}`}
        className={`relative aspect-square rounded-full transition ${
          playable ? 'cursor-pointer ring-[3px] ring-[#00a884] active:scale-95' : ''
        } ${played ? 'ring-[3px] ring-amber-300/80' : ''}`}
        style={{
          background: 'radial-gradient(circle at 50% 38%, #3b2414 0%, #4c2f1a 55%, #2c190c 100%)',
          boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.65), 0 1px 0 rgba(255,236,200,0.18)',
        }}
      >
        {wave !== undefined && <span className="awale-sown absolute inset-0 rounded-full" style={{ animationDelay: `${wave * 70}ms` }} />}
        {captured && <span className="awale-captured absolute inset-0 rounded-full" />}
        <Seeds count={count} pit={pit} />
        <span
          className={`absolute -right-1 -bottom-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11.5px] font-bold tabular-nums shadow ${
            count === 0 ? 'bg-black/40 text-white/40' : playable ? 'bg-[#00a884] text-[#0b141a]' : 'bg-[#f3e6cf] text-[#3b2414]'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div
      className="rounded-[28px] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      style={{ background: 'linear-gradient(160deg, #9a6a3f 0%, #7a4f2c 45%, #5e3a1e 100%)' }}
    >
      <div className="grid grid-cols-6 gap-2.5">{top.map(cell)}</div>
      <div className="my-2.5 flex items-center gap-2 px-1 text-[10.5px] font-semibold tracking-widest text-[#f3e6cf]/45 uppercase">
        <span className="h-px flex-1 bg-[#f3e6cf]/15" />
        {tr('sens du jeu', 'direction of play')}
        <svg viewBox="0 0 24 12" className="h-3 w-6" aria-hidden>
          <path d="M2 6h18m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="h-px flex-1 bg-[#f3e6cf]/15" />
      </div>
      <div className="grid grid-cols-6 gap-2.5">{bottom.map(cell)}</div>
    </div>
  );
});
