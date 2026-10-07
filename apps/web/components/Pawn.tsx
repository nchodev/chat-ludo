'use client';

import { useId } from 'react';
import { COLORS, type Color } from '@ludo/engine';
import type { BoardTheme, ColorShades, PawnStyle } from '@/lib/themes';

const ANIMALS: Record<Color, string> = { red: '🦊', green: '🐸', yellow: '🦁', blue: '🐳' };

function starPoints(outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`;
  }).join(' ');
}

const STAR = starPoints(0.44, 0.2);

interface PawnShapeProps {
  color: Color;
  shades: ColorShades;
  pawnStyle: PawnStyle;
  theme: BoardTheme;
  /** Id of the radial gradient for this color, defined by the parent SVG. */
  gradientId: string;
  glowId: string;
}

/** A pawn centered on (0, 0), about 0.8 units wide. */
export function PawnShape({ color, shades: c, pawnStyle, theme, gradientId, glowId }: PawnShapeProps) {
  const neon = theme.pawnStyle === 'neon';
  const fill = `url(#${gradientId})`;
  const outline = neon ? c.main : '#ffffff';
  const shape = pawnStyle.shape === 'board' ? theme.pawnStyle : pawnStyle.shape;

  const body = (() => {
    switch (shape) {
      case 'glossy':
        return (
          <>
            <circle r={0.36} fill={fill} stroke="#ffffff" strokeWidth={0.07} />
            <circle r={0.16} fill="#ffffff" opacity={0.35} />
          </>
        );
      case 'flat':
        return (
          <>
            <circle r={0.36} fill={c.main} stroke="#ffffff" strokeWidth={0.08} />
            <circle r={0.15} fill={c.dark} opacity={0.35} />
          </>
        );
      case 'neon':
        return (
          <>
            <circle r={0.33} fill={theme.surface} stroke={c.main} strokeWidth={0.09} />
            <circle r={0.12} fill={c.main} />
          </>
        );
      case 'cone':
        return (
          <g stroke={outline} strokeWidth={0.05} strokeLinejoin="round">
            <ellipse cy={0.27} rx={0.31} ry={0.09} fill={c.dark} />
            <path d="M-0.27 0.26 Q-0.24 0.02 -0.09 -0.07 L0.09 -0.07 Q0.24 0.02 0.27 0.26 Z" fill={fill} />
            <circle cy={-0.2} r={0.16} fill={fill} />
            <circle cx={-0.05} cy={-0.25} r={0.05} fill="#ffffff" opacity={0.6} stroke="none" />
          </g>
        );
      case 'star':
        return (
          <>
            <polygon points={STAR} fill={fill} stroke={outline} strokeWidth={0.06} strokeLinejoin="round" />
            <circle r={0.1} fill="#ffffff" opacity={0.45} />
          </>
        );
      case 'gem':
        return (
          <g strokeLinejoin="round">
            <polygon points="-0.38,-0.1 -0.2,-0.32 0.2,-0.32 0.38,-0.1 0,0.4" fill={c.main} stroke={outline} strokeWidth={0.05} />
            <polygon points="-0.2,-0.32 0.2,-0.32 0.1,-0.1 -0.1,-0.1" fill={c.light} opacity={0.75} />
            <path
              d="M-0.38 -0.1 H0.38 M-0.1 -0.1 L0 0.4 L0.1 -0.1 M-0.2 -0.32 L-0.1 -0.1 M0.2 -0.32 L0.1 -0.1"
              fill="none"
              stroke={c.dark}
              strokeWidth={0.025}
              opacity={0.7}
            />
          </g>
        );
      case 'animal':
        return (
          <>
            <circle r={0.38} fill={fill} stroke={outline} strokeWidth={0.06} />
            <text y={0.15} fontSize={0.44} textAnchor="middle">
              {ANIMALS[color]}
            </text>
          </>
        );
      case 'crown':
        return (
          <g strokeLinejoin="round">
            <path
              d="M-0.34 0.24 L-0.38 -0.2 L-0.17 0.02 L0 -0.34 L0.17 0.02 L0.38 -0.2 L0.34 0.24 Z"
              fill={fill}
              stroke={outline}
              strokeWidth={0.05}
            />
            <rect x={-0.34} y={0.14} width={0.68} height={0.1} fill={c.dark} />
            {[
              [-0.38, -0.2],
              [0, -0.34],
              [0.38, -0.2],
            ].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r={0.06} fill="#fde047" stroke="#a16207" strokeWidth={0.02} />
            ))}
          </g>
        );
    }
  })();

  return neon ? <g filter={`url(#${glowId})`}>{body}</g> : body;
}

const PREVIEW_SPOTS: Record<Color, [number, number]> = {
  red: [-0.5, -0.5],
  green: [0.5, -0.5],
  blue: [-0.5, 0.5],
  yellow: [0.5, 0.5],
};

/** The four colors of a pawn style, on the given board's surface. */
export function PawnPreview({ pawnStyle, theme }: { pawnStyle: PawnStyle; theme: BoardTheme }) {
  const uid = useId().replace(/:/g, '');
  const gradientId = (c: Color) => `${uid}-pawn-${c}`;
  const glowId = `${uid}-glow`;
  return (
    <svg viewBox="-1.05 -1.05 2.1 2.1" className="block h-auto w-full" aria-hidden>
      <defs>
        <PawnDefs palette={theme.colors} gradientId={gradientId} glowId={glowId} />
      </defs>
      <rect x={-1.05} y={-1.05} width={2.1} height={2.1} rx={0.25} fill={theme.surface} />
      {COLORS.map((color) => {
        const [x, y] = PREVIEW_SPOTS[color];
        return (
          <g key={color} transform={`translate(${x} ${y}) scale(1.05)`}>
            <ellipse cy={0.26} rx={0.3} ry={0.1} fill="#000" opacity={0.2} />
            <PawnShape
              color={color}
              shades={theme.colors[color]}
              pawnStyle={pawnStyle}
              theme={theme}
              gradientId={gradientId(color)}
              glowId={glowId}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Shared SVG definitions for pawns: one gradient per color and a glow filter. */
export function PawnDefs({
  palette,
  gradientId,
  glowId,
}: {
  palette: BoardTheme['colors'];
  gradientId: (c: Color) => string;
  glowId: string;
}) {
  return (
    <>
      {(Object.keys(palette) as Color[]).map((color) => (
        <radialGradient key={color} id={gradientId(color)} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
          <stop offset="28%" stopColor={palette[color].main} />
          <stop offset="100%" stopColor={palette[color].dark} />
        </radialGradient>
      ))}
      <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.09" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );
}
