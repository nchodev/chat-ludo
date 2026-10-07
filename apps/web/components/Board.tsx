'use client';

import { useId } from 'react';
import {
  BASE,
  COLORS,
  FINISHED,
  START_INDEX,
  STAR_SQUARES,
  type Color,
  type GameState,
} from '@ludo/engine';
import { BASE_ORIGIN, HOME_COLUMN, TRACK, pawnCenter } from '@/lib/board';
import { COLOR_LABEL } from '@/lib/labels';
import { DEFAULT_BOARD_THEME, DEFAULT_PAWN_STYLE, type BoardTheme, type PawnStyle } from '@/lib/themes';
import { PawnDefs, PawnShape } from './Pawn';

interface BoardProps {
  state: GameState;
  /** Positions to draw, which may differ from `state.pawns` while a move is animated. */
  pawns?: GameState['pawns'];
  /** Color whose pawns can currently be clicked, if any. */
  movableColor?: Color | null;
  onPawnClick?: (pawn: number) => void;
  theme?: BoardTheme;
  pawnStyle?: PawnStyle;
}

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(angle)).toFixed(3)},${(cy + r * Math.sin(angle)).toFixed(3)}`;
  });
  return `M${points.join('L')}Z`;
}

const STACK_OFFSETS: [number, number][] = [
  [-0.18, -0.18],
  [0.18, 0.18],
  [0.18, -0.18],
  [-0.18, 0.18],
  [0, 0],
];

const BASE_SLOTS = [
  [2, 2],
  [4, 2],
  [2, 4],
  [4, 4],
];

/** Direction arrow drawn on each color's start square, pointing along the track. */
const START_ARROW_ROTATION: Record<Color, number> = { red: 0, green: 90, yellow: 180, blue: 270 };

interface PawnView {
  color: Color;
  pawn: number;
  x: number;
  y: number;
  scale: number;
  movable: boolean;
}

function layoutPawns(pawns: GameState['pawns'], movable: Set<number>, movableColor: Color | null): PawnView[] {
  const views: PawnView[] = [];
  const groups = new Map<string, PawnView[]>();
  for (const [color, positions] of Object.entries(pawns) as [Color, number[]][]) {
    positions.forEach((pos, pawn) => {
      const [x, y] = pawnCenter(color, pos, pawn);
      const view: PawnView = {
        color,
        pawn,
        x,
        y,
        scale: pos === FINISHED ? 0.55 : 1,
        movable: color === movableColor && movable.has(pawn),
      };
      views.push(view);
      if (pos !== BASE && pos !== FINISHED) {
        const key = `${x.toFixed(2)},${y.toFixed(2)}`;
        groups.set(key, [...(groups.get(key) ?? []), view]);
      }
    });
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.forEach((view, i) => {
      const [dx, dy] = STACK_OFFSETS[i % STACK_OFFSETS.length];
      view.x += dx;
      view.y += dy;
      view.scale = 0.72;
    });
  }
  return views.sort((a, b) => Number(a.movable) - Number(b.movable));
}

export function Board({ state, pawns = state.pawns, movableColor = null, onPawnClick,
  theme = DEFAULT_BOARD_THEME,
  pawnStyle = DEFAULT_PAWN_STYLE,
}: BoardProps) {
  const uid = useId().replace(/:/g, '');
  const ids = {
    pawn: (c: Color) => `${uid}-pawn-${c}`,
    base: (c: Color) => `${uid}-base-${c}`,
    glow: `${uid}-glow`,
    wood: `${uid}-wood`,
    wax: `${uid}-wax`,
  };
  const { colors } = theme;
  const neon = theme.pawnStyle === 'neon';

  const inGame = new Set(state.players.map((p) => p.color).filter((c) => !state.forfeited.includes(c)));
  const currentColor = state.players[state.current]?.color;
  const moves = movableColor && state.phase === 'move' ? state.legalMoves : [];
  const movable = new Set(moves.map((m) => m.pawn));
  const views = layoutPawns(pawns, movable, movableColor);
  const startSquares = new Map(COLORS.map((c) => [START_INDEX[c], c]));

  const targets = new Map<string, { x: number; y: number; pawn: number; color: Color; capture: boolean }>();
  for (const m of moves) {
    const [x, y] = pawnCenter(m.color, m.to, m.pawn);
    const key = m.to === FINISHED ? 'finish' : `${x},${y}`;
    if (!targets.has(key)) targets.set(key, { x, y, pawn: m.pawn, color: m.color, capture: m.captures.length > 0 });
  }

  return (
    <svg
      viewBox="-0.2 -0.2 15.4 15.4"
      className="block h-auto w-full select-none touch-manipulation"
      role="img"
      aria-label="Plateau de Ludo"
    >
      <defs>
        <PawnDefs palette={colors} gradientId={ids.pawn} glowId={ids.glow} />
        {COLORS.map((color) => (
          <linearGradient key={color} id={ids.base(color)} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors[color].main} />
            <stop offset="100%" stopColor={colors[color].dark} stopOpacity={0.85} />
          </linearGradient>
        ))}
        <pattern id={ids.wood} width="15" height="1.6" patternUnits="userSpaceOnUse">
          <path d="M0 0.4 Q3.75 0.1 7.5 0.45 T15 0.4" stroke="#7a4a20" strokeWidth="0.05" fill="none" opacity="0.35" />
          <path d="M0 1.2 Q4 1.45 8 1.15 T15 1.25" stroke="#7a4a20" strokeWidth="0.04" fill="none" opacity="0.25" />
        </pattern>
        <pattern id={ids.wax} width="1.5" height="1.5" patternUnits="userSpaceOnUse">
          <circle cx="0.75" cy="0.75" r="0.45" fill="none" stroke="#ffffff" strokeWidth="0.1" opacity="0.35" />
          <circle cx="0.75" cy="0.75" r="0.15" fill="#ffffff" opacity="0.4" />
          <circle cx="0" cy="0" r="0.12" fill="#000000" opacity="0.18" />
          <circle cx="1.5" cy="1.5" r="0.12" fill="#000000" opacity="0.18" />
        </pattern>
      </defs>

      <rect x={-0.2} y={-0.2} width={15.4} height={15.4} rx={0.5} fill={theme.surface} />
      {theme.pattern === 'wood' && <rect x={-0.2} y={-0.2} width={15.4} height={15.4} fill={`url(#${ids.wood})`} />}

      {COLORS.map((color) => {
        const [ox, oy] = BASE_ORIGIN[color];
        const active = inGame.has(color);
        const isCurrent = active && color === currentColor && state.phase !== 'over';
        const outline = theme.baseStyle === 'outline';
        return (
          <g key={color} opacity={active ? 1 : 0.25}>
            <rect
              x={ox + 0.1}
              y={oy + 0.1}
              width={5.8}
              height={5.8}
              rx={0.35}
              fill={outline ? theme.surface : `url(#${ids.base(color)})`}
              stroke={outline ? colors[color].main : 'none'}
              strokeWidth={0.14}
              filter={outline ? `url(#${ids.glow})` : undefined}
            />
            {theme.pattern === 'wax' && (
              <rect x={ox + 0.1} y={oy + 0.1} width={5.8} height={5.8} rx={0.35} fill={`url(#${ids.wax})`} />
            )}
            <rect
              x={ox + 0.85}
              y={oy + 0.85}
              width={4.3}
              height={4.3}
              rx={0.7}
              fill={theme.baseInner}
              stroke={isCurrent ? (outline ? colors[color].main : '#ffffff') : 'none'}
              strokeWidth={0.12}
              className={isCurrent ? 'base-glow' : undefined}
            />
            {BASE_SLOTS.map(([sx, sy]) => (
              <circle
                key={`${sx}-${sy}`}
                cx={ox + sx}
                cy={oy + sy}
                r={0.58}
                fill={colors[color].light}
                stroke={outline ? colors[color].main : 'none'}
                strokeWidth={0.05}
                strokeOpacity={0.5}
              />
            ))}
          </g>
        );
      })}

      {TRACK.map(([x, y], i) => {
        const startColor = startSquares.get(i);
        return (
          <g key={`t${i}`}>
            <rect
              x={x + 0.04}
              y={y + 0.04}
              width={0.92}
              height={0.92}
              rx={0.14}
              fill={startColor ? colors[startColor].main : theme.cell}
              stroke={theme.cellStroke}
              strokeWidth={0.03}
            />
            {state.rules.safeSquares && STAR_SQUARES.includes(i) && (
              <path d={starPath(x + 0.5, y + 0.5, 0.34, 0.14)} fill={theme.star} />
            )}
            {startColor && (
              <path
                d="M-0.22,-0.16 L0.18,0 L-0.22,0.16 Z"
                fill={neon ? theme.surface : '#ffffff'}
                opacity={0.9}
                transform={`translate(${x + 0.5} ${y + 0.5}) rotate(${START_ARROW_ROTATION[startColor]})`}
              />
            )}
          </g>
        );
      })}

      {COLORS.map((color) =>
        HOME_COLUMN[color].map(([x, y], i) => (
          <rect
            key={`h${color}${i}`}
            x={x + 0.04}
            y={y + 0.04}
            width={0.92}
            height={0.92}
            rx={0.14}
            fill={colors[color].main}
            opacity={0.55 + i * 0.09}
          />
        )),
      )}

      <polygon points="6,6 6,9 7.5,7.5" fill={colors.red.main} />
      <polygon points="6,6 9,6 7.5,7.5" fill={colors.green.main} />
      <polygon points="9,6 9,9 7.5,7.5" fill={colors.yellow.main} />
      <polygon points="6,9 9,9 7.5,7.5" fill={colors.blue.main} />
      <circle cx={7.5} cy={7.5} r={0.5} fill={theme.surface} opacity={0.9} />
      <text x={7.5} y={7.72} fontSize={0.6} textAnchor="middle">
        🏠
      </text>

      {views.map((p) => {
        const c = colors[p.color];
        return (
          <g
            key={`${p.color}-${p.pawn}`}
            className="pawn"
            style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            onClick={p.movable ? () => onPawnClick?.(p.pawn) : undefined}
            role={p.movable ? 'button' : undefined}
            aria-label={p.movable ? `Déplacer le pion ${COLOR_LABEL[p.color]} ${p.pawn + 1}` : undefined}
            cursor={p.movable ? 'pointer' : undefined}
          >
            <g transform={`scale(${p.scale})`}>
              <ellipse cx={0} cy={0.24} rx={0.3} ry={0.12} fill="#000" opacity={neon ? 0.5 : 0.25} />
              <g className={p.movable ? 'pawn-bob' : undefined}>
                {p.movable && (
                  <circle
                    className="pawn-ring"
                    r={0.46}
                    fill="none"
                    stroke={neon ? c.main : c.dark}
                    strokeWidth={0.09}
                  />
                )}
                <PawnShape
                  color={p.color}
                  shades={c}
                  pawnStyle={pawnStyle}
                  theme={theme}
                  gradientId={ids.pawn(p.color)}
                  glowId={ids.glow}
                />
              </g>
              {p.movable && <circle r={0.62} fill="transparent" />}
            </g>
          </g>
        );
      })}

      {[...targets.values()].map((t) => (
        <g
          key={`target-${t.x}-${t.y}`}
          onClick={() => onPawnClick?.(t.pawn)}
          cursor="pointer"
          role="button"
          aria-label={t.capture ? 'Capturer ici' : 'Déplacer ici'}
        >
          <circle cx={t.x} cy={t.y} r={0.5} fill="transparent" />
          <circle
            cx={t.x}
            cy={t.y}
            r={t.capture ? 0.46 : 0.3}
            fill={colors[t.color].main}
            fillOpacity={t.capture ? 0.1 : 0.3}
            stroke={t.capture ? '#dc2626' : neon ? colors[t.color].main : colors[t.color].dark}
            strokeWidth={t.capture ? 0.09 : 0.06}
            strokeDasharray="0.12 0.08"
            className="target-spin"
          />
        </g>
      ))}
    </svg>
  );
}
