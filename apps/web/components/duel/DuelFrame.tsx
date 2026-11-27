'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { DuelMovePayload, Side } from '@ludo/engine';
import { BackButton } from '../BackButton';
import { Icon } from '../Icons';
import { tr } from '@/lib/i18n';

/** A player of a two-player board game, as shown above or below the board. */
export interface DuelSeat {
  name: string;
  side: Side;
  /** Thinking time left, for timed games. */
  clockMs?: number | null;
  connected?: boolean;
  you?: boolean;
  /** Small line under the name, e.g. the computer level. */
  detail?: string;
}

/** What every game's screen takes, so the online room and quick match pages work for all of them. */
export interface DuelViewProps<S> {
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  backLabel: string;
  state: S;
  top: DuelSeat;
  bottom: DuelSeat;
  /** The second player sits at the bottom. */
  flipped: boolean;
  interactive: boolean;
  onMove: (move: DuelMovePayload) => void;
  /** Shown above the board: draw offers, stake, notices. */
  banner?: ReactNode;
  /** Buttons under the board. */
  toolbar?: ReactNode;
  /** End of game card, shown once the game is over. */
  result?: ReactNode;
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Re-renders every `ms` while active, for clocks. */
export function useTick(active: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
  return now;
}

/** Name, piece, whose turn it is and clock of one player. `idle` is the line shown when it isn't their turn. */
export function PlayerBar({ seat, turn, icon, idle, badge }: { seat: DuelSeat; turn: boolean; icon: ReactNode; idle: string; badge?: ReactNode }) {
  const low = seat.clockMs != null && seat.clockMs < 30_000;
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition ${turn ? 'bg-[#1f2c33] ring-2 ring-[#00a884]' : 'bg-[#1f2c33]/60'}`}>
      <span className="relative size-10 shrink-0">
        {icon}
        {seat.connected === false && (
          <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-[#f15c6d] ring-2 ring-[#0b141a]" title={tr('Déconnecté', 'Disconnected')} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
          <span className="truncate">{seat.name}</span>
          {seat.you && <span className="rounded-full bg-[#00a884]/15 px-1.5 text-[11px] font-medium text-[#00a884]">{tr('Toi', 'You')}</span>}
        </span>
        <span className="block truncate text-[12.5px] text-[#8696a0]">
          {seat.connected === false ? tr('Déconnecté', 'Disconnected') : turn ? tr('Au trait', 'To move') : (seat.detail ?? idle)}
        </span>
      </span>
      {badge}
      {seat.clockMs != null && (
        <span
          className={`flex h-10 min-w-[76px] items-center justify-center gap-1 rounded-xl px-2 font-mono text-[19px] font-semibold tabular-nums ${
            turn ? (low ? 'bg-[#f15c6d] text-white' : 'bg-[#e9edef] text-[#0b141a]') : 'bg-[#0b141a] text-[#aebac1]'
          }`}
        >
          <Icon.Timer size={16} className="opacity-70" />
          {formatClock(seat.clockMs)}
        </span>
      )}
    </div>
  );
}

/** Screen of a game: header, the two players around the board, toolbar, and the result card at the end. */
export function DuelFrame({
  title,
  subtitle,
  onBack,
  backLabel,
  topBar,
  bottomBar,
  banner,
  board,
  hint,
  toolbar,
  result,
  over,
  gameId,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  backLabel: string;
  topBar: ReactNode;
  bottomBar: ReactNode;
  banner?: ReactNode;
  board: ReactNode;
  /** Line under the board: whose turn, compulsory moves. */
  hint?: ReactNode;
  toolbar?: ReactNode;
  result?: ReactNode;
  over: boolean;
  /** The result card shows again for each new game. */
  gameId: string;
}) {
  const [resultHidden, setResultHidden] = useState(false);
  useEffect(() => setResultHidden(false), [gameId, over]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-10 bg-[#1f2c33] pt-[env(safe-area-inset-top)] shadow-md">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-1">
          <BackButton onClick={onBack} label={backLabel} text={tr('Quitter', 'Leave')} />
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[18px] leading-tight font-medium">{title}</h1>
            {subtitle && <p className="truncate text-[12.5px] text-[#8696a0]">{subtitle}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-2.5 px-2 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {topBar}
        {banner}
        {board}
        <p className="min-h-5 text-center text-[13px] text-[#8696a0]">{over ? ' ' : (hint ?? ' ')}</p>
        {bottomBar}
        {toolbar && <div className="mt-1 flex flex-wrap justify-center gap-2">{toolbar}</div>}
      </main>

      {over && result && !resultHidden && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="sheet-up w-full max-w-md rounded-[28px] bg-[#1f2c33] p-5 shadow-2xl">
            {result}
            <button
              type="button"
              onClick={() => setResultHidden(true)}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-medium text-[#8696a0] transition active:bg-white/5"
            >
              <Icon.Eye size={18} />
              {tr('Voir le plateau', 'See the board')}
            </button>
          </div>
        </div>
      )}
      {over && result && resultHidden && (
        <button
          type="button"
          onClick={() => setResultHidden(false)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex h-12 items-center gap-2 rounded-full bg-[#00a884] px-5 text-[15px] font-semibold text-[#0b141a] shadow-xl"
        >
          <Icon.Trophy size={20} />
          {tr('Résultat', 'Result')}
        </button>
      )}
    </div>
  );
}

/** Title, icon and explanation of a finished game, seen by `viewer` (null for a shared screen). */
export function ResultHeader({
  winner,
  viewer,
  names,
  explanation,
}: {
  winner: Side | null;
  viewer: Side | null;
  names: Record<Side, string>;
  explanation: string;
}) {
  const draw = !winner;
  const won = !draw && viewer === winner;
  const lost = !draw && viewer !== null && viewer !== winner;
  const title = draw
    ? tr('Match nul', 'Draw')
    : viewer === null
      ? tr(`${names[winner]} gagne !`, `${names[winner]} wins!`)
      : won
        ? tr('Victoire !', 'Victory!')
        : tr('Défaite', 'Defeat');
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={`grid size-16 place-items-center rounded-full ${won ? 'bg-amber-400/20 text-amber-300' : lost ? 'bg-[#f15c6d]/15 text-[#f15c6d]' : 'bg-[#53bdeb]/15 text-[#53bdeb]'}`}
      >
        {draw ? <Icon.Handshake size={34} /> : lost ? <Icon.Flag size={32} /> : <Icon.Trophy size={34} />}
      </span>
      <h2 className="mt-3 text-[24px] font-semibold">{title}</h2>
      <p className="mt-1 text-[14px] text-[#8696a0]">{explanation}</p>
    </div>
  );
}

/** Why the game ended, for the endings every game shares; null for the game's own endings. */
export function commonEnding(reason: string | null, winner: Side | null, names: Record<Side, string>): string | null {
  const loser = winner ? names[winner === 'white' ? 'black' : 'white'] : '';
  switch (reason) {
    case 'resign':
      return tr(`${loser} a abandonné.`, `${loser} resigned.`);
    case 'timeout':
      return tr(`Temps écoulé pour ${loser}.`, `${loser} ran out of time.`);
    case 'abandon':
      return tr(`${loser} a quitté la partie.`, `${loser} left the game.`);
    case 'agreement':
      return tr('Nulle acceptée par les deux joueurs.', 'Draw agreed by both players.');
    default:
      return null;
  }
}

export function GameButton({
  onClick,
  icon,
  children,
  tone = 'default',
  disabled,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-medium transition active:scale-95 disabled:opacity-40 ${
        tone === 'danger' ? 'border-[#f15c6d]/40 text-[#f15c6d]' : 'border-[#2a3942] text-[#e9edef]'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
