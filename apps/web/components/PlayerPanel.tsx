'use client';

import { BASE, FINISHED, type BotLevel, type Color } from '@ludo/engine';
import { BOT_LEVEL_LABEL } from '@/lib/labels';
import type { Bubble } from '@/lib/reactions';
import { DEFAULT_BOARD_THEME, type Palette } from '@/lib/themes';

export interface SeatMeta {
  color: Color;
  name: string;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  isYou?: boolean;
}

interface PlayerPanelProps {
  color: Color;
  seat?: SeatMeta;
  pawns?: number[];
  active: boolean;
  winner?: boolean;
  align: 'left' | 'right';
  teamLabel?: string;
  palette?: Palette;
  forfeited?: boolean;
  bubble?: Bubble;
  /** Where the reaction bubble appears, so it points toward the board. */
  bubbleSide?: 'above' | 'below';
}

function ReactionBubble({
  bubble: { reaction },
  align,
  side,
  color,
}: {
  bubble: Bubble;
  align: 'left' | 'right';
  side: 'above' | 'below';
  color: string;
}) {
  const position = `${align === 'left' ? 'left-1' : 'right-1'} ${side === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'}`;
  const tail = `${align === 'left' ? 'left-4' : 'right-4'} ${side === 'below' ? '-top-1.5' : '-bottom-1.5'}`;

  if (!reaction.text) {
    return (
      <span
        className={`reaction-bubble pointer-events-none absolute z-30 text-5xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)] ${position}`}
        role="status"
      >
        {reaction.emoji}
      </span>
    );
  }
  return (
    <span
      className={`reaction-bubble pointer-events-none absolute z-30 rounded-2xl bg-white px-3 py-1.5 text-sm font-bold whitespace-nowrap text-slate-900 shadow-xl ${position}`}
      style={{ boxShadow: `0 0 0 2px ${color}, 0 10px 24px -8px rgba(0,0,0,0.6)` }}
      role="status"
    >
      <span className={`absolute size-3 rotate-45 bg-white ${tail}`} />
      <span className="relative">
        {reaction.emoji} {reaction.text}
      </span>
    </span>
  );
}

export function Avatar({
  color,
  seat,
  size = 40,
  palette = DEFAULT_BOARD_THEME.colors,
}: {
  color: Color;
  seat?: SeatMeta;
  size?: number;
  palette?: Palette;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-2 border-white/80 font-bold text-white shadow-md"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `radial-gradient(circle at 35% 30%, ${palette[color].main}, ${palette[color].dark})`,
      }}
    >
      {seat?.isBot ? '🤖' : (seat?.name.trim()[0]?.toUpperCase() ?? '?')}
    </span>
  );
}

export function PlayerPanel({
  color,
  seat,
  pawns,
  active,
  winner,
  align,
  teamLabel,
  palette = DEFAULT_BOARD_THEME.colors,
  forfeited,
  bubble,
  bubbleSide = 'below',
}: PlayerPanelProps) {
  if (!seat || (!pawns && !forfeited)) return <div className="min-w-0 flex-1" />;
  const main = palette[color].main;

  const subtitle = forfeited
    ? '🏳️ A quitté · perdu'
    : seat.isBot
      ? `Ordi ${BOT_LEVEL_LABEL[seat.botLevel ?? 'medium'].toLowerCase()}`
      : !seat.connected
        ? 'Déconnecté'
        : seat.isYou
          ? 'Toi'
          : 'Joueur';

  return (
    <div
      className={`relative flex min-w-0 max-w-[48%] flex-1 items-center gap-2 rounded-2xl px-2 py-1.5 transition-all duration-300 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      } ${active ? 'bg-white/15 shadow-lg' : 'bg-white/[0.04]'} ${
        forfeited ? 'opacity-40 grayscale' : seat.connected ? '' : 'opacity-50'
      }`}
      style={active ? { boxShadow: `0 0 0 2px ${main}, 0 8px 20px -6px ${main}` } : undefined}
    >
      {bubble && <ReactionBubble key={bubble.key} bubble={bubble} align={align} side={bubbleSide} color={main} />}
      <div className="relative">
        <Avatar color={color} seat={seat} size={38} palette={palette} />
        {winner && <span className="absolute -top-2 -right-1 text-base">👑</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm leading-tight font-semibold ${forfeited ? 'line-through' : ''}`}>{seat.name}</div>
        <div className="truncate text-[11px] leading-tight text-white/60">
          {subtitle}
          {teamLabel && ` · ${teamLabel}`}
        </div>
        <div className={`mt-1 flex gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {(pawns ?? []).map((pos, i) => (
            <span
              key={i}
              className="size-2 rounded-full"
              style={{
                background: pos === FINISHED ? main : 'transparent',
                border: `1.5px solid ${pos === BASE ? 'rgba(255,255,255,0.3)' : main}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
