'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DRAUGHTS_SIZE, draughtsCoords, isKing, type DraughtsMove, type Piece, type PlayedMove } from '@ludo/engine';
import { Icon } from '../Icons';

/** Time a piece takes to go from one square to the next of its path. */
const STEP_MS = 190;

interface Props {
  board: (Piece | null)[];
  ids: number[];
  legalMoves: DraughtsMove[];
  lastMove: PlayedMove | null;
  /** Black at the bottom. */
  flipped?: boolean;
  /** The player may pick a move now. */
  interactive: boolean;
  onMove: (move: DraughtsMove) => void;
}

export function PieceDisc({ piece, size = '100%' }: { piece: Piece; size?: string }) {
  const white = piece === 'w' || piece === 'W';
  return (
    <span
      className="relative grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: white
          ? 'radial-gradient(circle at 35% 30%, #ffffff, #efe7d8 55%, #cfc3ad)'
          : 'radial-gradient(circle at 35% 30%, #5b524c, #2b2623 55%, #151210)',
        boxShadow: white ? '0 2px 0 #a99b83, 0 3px 6px rgba(0,0,0,.45)' : '0 2px 0 #050404, 0 3px 6px rgba(0,0,0,.55)',
      }}
    >
      <span
        className="absolute inset-[18%] rounded-full"
        style={{ border: `2px solid ${white ? 'rgba(150,130,100,.45)' : 'rgba(255,255,255,.12)'}` }}
      />
      {isKing(piece) && <Icon.Crown className={`relative w-[56%] h-[56%] ${white ? 'text-[#b8860b]' : 'text-[#f5c542]'}`} />}
    </span>
  );
}

export function DraughtsBoard({ board, ids, legalMoves, lastMove, flipped = false, interactive, onMove }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  const place = (square: number) => {
    const { row, col } = draughtsCoords(square);
    const r = flipped ? DRAUGHTS_SIZE - 1 - row : row;
    const c = flipped ? DRAUGHTS_SIZE - 1 - col : col;
    return { left: `${c * 10}%`, top: `${r * 10}%` };
  };

  /* The last move is replayed square by square, with the pieces it took fading as it passes them. */
  const moveKey = ids.join(',');
  const previous = useRef<{ key: string; board: (Piece | null)[] } | null>(null);
  const [anim, setAnim] = useState<{ key: string; step: number; before: (Piece | null)[] } | null>(null);
  // Before paint, so the moved piece is never drawn on its new square first.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { key: moveKey, board };
    if (!before || before.key === moveKey || !lastMove) return;
    // Only animate a move played on the position we were showing.
    if (before.board[lastMove.from - 1] === null) return;
    setAnim({ key: moveKey, step: 0, before: before.board });
    let step = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      step += 1;
      setAnim((a) => (a && a.key === moveKey ? { ...a, step } : a));
      if (step <= lastMove.path.length) timers.push(setTimeout(tick, STEP_MS));
      else setAnim(null);
    };
    timers.push(setTimeout(tick, 20));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey]);

  useEffect(() => setSelected(null), [moveKey, interactive]);

  const mustCapture = legalMoves.some((m) => m.captures.length > 0);
  const movable = useMemo(() => new Set(interactive ? legalMoves.map((m) => m.from) : []), [legalMoves, interactive]);
  const targets = selected === null ? [] : legalMoves.filter((m) => m.from === selected);

  const tap = (square: number) => {
    if (!interactive) return;
    const move = targets.find((m) => m.to === square);
    if (move) {
      setSelected(null);
      onMove(move);
      return;
    }
    if (movable.has(square)) setSelected(square === selected ? null : square);
    else setSelected(null);
  };

  const animating = anim && lastMove ? anim : null;
  const movingId = animating ? ids[lastMove!.to - 1] : 0;
  const movingAt = animating ? (animating.step === 0 ? lastMove!.from : lastMove!.path[Math.min(animating.step, lastMove!.path.length) - 1]) : 0;

  const squares = [];
  for (let r = 0; r < DRAUGHTS_SIZE; r++) {
    for (let c = 0; c < DRAUGHTS_SIZE; c++) {
      const dark = (r + c) % 2 === 1;
      const row = flipped ? DRAUGHTS_SIZE - 1 - r : r;
      const col = flipped ? DRAUGHTS_SIZE - 1 - c : c;
      const square = dark ? row * 5 + Math.floor(col / 2) + 1 : 0;
      const isLast = !!lastMove && (square === lastMove.from || square === lastMove.to);
      const target = targets.find((m) => m.to === square);
      squares.push(
        <button
          key={`${r}-${c}`}
          type="button"
          disabled={!dark}
          onClick={() => tap(square)}
          aria-label={dark ? `Case ${square}` : undefined}
          tabIndex={dark && interactive ? 0 : -1}
          className="relative"
          style={{ background: dark ? (isLast ? '#9a7a32' : '#76502f') : '#e8d5b3' }}
        >
          {dark && <span className="absolute top-[3%] left-[6%] text-[8px] leading-none font-medium text-white/25 select-none sm:text-[9px]">{square}</span>}
          {target && (
            <span className="absolute inset-0 grid place-items-center">
              <span className={`rounded-full ${target.captures.length ? 'size-[46%] border-[3px] border-[#25d366]' : 'size-[30%] bg-[#25d366]/80'}`} />
            </span>
          )}
        </button>,
      );
    }
  }

  const pieces: React.ReactNode[] = [];
  board.forEach((piece, i) => {
    if (!piece) return;
    const square = i + 1;
    const id = ids[i];
    const at = id === movingId && animating ? movingAt : square;
    const canMove = movable.has(square);
    pieces.push(
      <span
        key={id}
        className="pointer-events-none absolute grid size-[10%] place-items-center transition-[left,top] ease-out"
        style={{ ...place(at), transitionDuration: `${STEP_MS}ms`, zIndex: id === movingId ? 3 : 2 }}
      >
        <span className={`relative grid size-[82%] place-items-center rounded-full transition ${selected === square ? 'ring-[3px] ring-[#25d366]' : ''}`}>
          <PieceDisc piece={piece} />
          {canMove && mustCapture && selected !== square && (
            <span className="absolute -inset-[3px] animate-pulse rounded-full border-[3px] border-[#25d366]" />
          )}
        </span>
      </span>,
    );
  });
  // Pieces taken by the move being replayed stay until the moving piece passes over them.
  if (animating && lastMove) {
    lastMove.captures.forEach((square, k) => {
      const piece = animating.before[square - 1];
      if (!piece) return;
      const gone = animating.step > k + 1;
      pieces.push(
        <span
          key={`ghost-${square}`}
          className="pointer-events-none absolute grid size-[10%] place-items-center transition-[opacity,transform] duration-200"
          style={{ ...place(square), opacity: gone ? 0 : 1, transform: gone ? 'scale(0.6)' : undefined, zIndex: 1 }}
        >
          <span className="size-[82%]">
            <PieceDisc piece={piece} />
          </span>
        </span>,
      );
    });
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl border-[6px] border-[#3b2616] shadow-2xl">
      <div className="grid size-full grid-cols-10 grid-rows-10">{squares}</div>
      {pieces}
    </div>
  );
}
