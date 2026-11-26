'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_TIMEOUTS, TEAMMATE, controlledColor, type Color, type GameState, type ProgressSummary } from '@ludo/engine';
import { BackButton } from './BackButton';
import { Board } from './Board';
import { Confetti } from './Confetti';
import { Dice, DICE_ANIMATION_MS } from './Dice';
import { HowToPlay } from './HowToPlay';
import { Avatar, PlayerPanel, type SeatMeta } from './PlayerPanel';
import { AppearancePicker } from './AppearancePicker';
import { Sheet } from './Sheet';
import { SoundToggle } from './SoundToggle';
import { useAnimatedPawns } from '@/lib/animation';
import { useAppearance } from '@/lib/appearance';
import { boardTurn, campShownAs, shiftPalette, shownColor, usePreferredColor, viewShift } from '@/lib/perspective';
import { ColorPreference } from './ColorPreference';
import { COLOR_LABEL, describeEvent } from '@/lib/labels';
import { sfx } from '@/lib/sound';
import type { useReactionBubbles } from '@/lib/reactions';
import { useGameProgress } from '@/lib/useGameProgress';
import { ReactionButton } from './ReactionPicker';
import { RewardSummary } from './RewardSummary';

export type { SeatMeta };

type ReactionBubbles = ReturnType<typeof useReactionBubbles>;

interface GameViewProps {
  state: GameState;
  seats: SeatMeta[];
  /** Whether this screen may act for the player whose turn it is. */
  canAct: boolean;
  onRoll: () => void;
  onMove: (pawn: number) => void;
  title: ReactNode;
  /** Called by the back button; the page decides whether to confirm or forfeit. */
  onQuit: () => void;
  overlayActions?: ReactNode;
  /** Shown under the end-of-game actions, e.g. the dice fairness proof. */
  overlayFooter?: ReactNode;
  /** Message shown above the action bar, e.g. when this player was eliminated. */
  notice?: ReactNode;
  /** Colors played from this device: their victories earn coins here. */
  rewardColors: Color[];
  online: boolean;
  /** For signed-in online players: what the server credited for the finished game. */
  serverSummary?: ProgressSummary | null;
  reactions: ReactionBubbles & {
    /** Sends a reaction; absent when this screen has no player who may react (spectators). */
    onReact?: (reaction: string) => void;
  };
  /** Online games: when the current player must have acted by (local clock), and the turn length. */
  turnTimer?: { endsAt: number; duration: number } | null;
  /** Online games: how many times each player ran out of time. */
  timeouts?: Partial<Record<Color, number>>;
  /** Online games: player the computer is finishing the turn for. */
  autoplay?: Color | null;
  /** Online games: this player's camp, shown in their preferred colour (see `lib/perspective`). */
  you?: Color | null;
}

/** Corners of the board, clockwise from the top left, named after the colour drawn there. */
type Corner = 'red' | 'green' | 'yellow' | 'blue';

const URGENT_MS = 5000;

function useTimeLeft(endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [endsAt]);
  return endsAt === null ? null : Math.max(0, endsAt - now);
}

function TimeoutDots({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${count} temps dépassé(s) sur ${MAX_TIMEOUTS}`}>
      {Array.from({ length: MAX_TIMEOUTS }, (_, i) => (
        <span key={i} className={`size-1.5 rounded-full ${i < count ? 'bg-red-400' : 'bg-white/20'}`} />
      ))}
    </span>
  );
}

const AUTO_MOVE_DELAY_MS = DICE_ANIMATION_MS + 250;
const DICE_SIZE = 52;
/** How long the dice stays with whoever rolled it when the turn passes straight away. */
const DICE_LINGER_MS = DICE_ANIMATION_MS + 900;

/**
 * Colour the dice sits next to: the current player, except right after a roll that ended
 * the turn (no move possible), when it stays a moment with the player who rolled.
 */
function useDiceColor(state: GameState) {
  const current = state.players[state.current].color;
  const committed = useRef({ rollId: state.rollId, color: current, roller: current });
  const [released, setReleased] = useState(state.rollId);
  const roller = state.rollId !== committed.current.rollId ? committed.current.color : committed.current.roller;

  useEffect(() => {
    committed.current = { rollId: state.rollId, color: current, roller };
  });

  useEffect(() => {
    const timer = setTimeout(() => setReleased(state.rollId), DICE_LINGER_MS);
    return () => clearTimeout(timer);
  }, [state.rollId]);

  return released === state.rollId || state.phase === 'over' ? current : roller;
}

export function GameView({
  state,
  seats,
  canAct,
  onRoll,
  onMove,
  title,
  onQuit,
  overlayActions,
  overlayFooter,
  notice,
  rewardColors,
  online,
  serverSummary,
  reactions,
  turnTimer = null,
  timeouts = {},
  autoplay = null,
  you = null,
}: GameViewProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const { board: baseTheme, dice: diceStyle, pawn: pawnStyle } = useAppearance();
  const shift = viewShift(you, usePreferredColor());
  const turn = boardTurn(you);
  const palette = shiftPalette(baseTheme.colors, shift);
  const theme = shift ? { ...baseTheme, colors: palette } : baseTheme;
  const label = (color: Color) => COLOR_LABEL[shownColor(color, shift)];
  const { pawns, animating } = useAnimatedPawns(state);
  const current = state.players[state.current];
  const currentSeat = seats.find((s) => s.color === current.color);
  const moveColor = controlledColor(state);
  const isOver = state.phase === 'over';
  const canMove = canAct && state.phase === 'move' && !animating;
  const canRoll = canAct && state.phase === 'roll' && !animating;

  // When every legal move leads to the same result, play it for the player.
  useEffect(() => {
    if (!canMove) return;
    const [first, ...rest] = state.legalMoves;
    if (!first || rest.some((m) => m.from !== first.from || m.to !== first.to)) return;
    const timer = setTimeout(() => onMove(first.pawn), AUTO_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canMove, state.legalMoves, onMove]);

  const lastTurn = useRef(state.current);
  useEffect(() => {
    if (lastTurn.current !== state.current && canAct && state.phase === 'roll') sfx.yourTurn();
    lastTurn.current = state.current;
  }, [state.current, state.phase, canAct]);

  useEffect(() => {
    if (isOver) sfx.win();
  }, [isOver]);

  const progress = useGameProgress({ state, seats, rewardColors, online, serverSummary, animating });

  const timeLeft = useTimeLeft(isOver ? null : (turnTimer?.endsAt ?? null));
  const urgent = timeLeft !== null && timeLeft <= URGENT_MS;
  const warned = useRef<number | null>(null);
  useEffect(() => {
    if (!canAct || !urgent || !turnTimer || warned.current === turnTimer.endsAt) return;
    warned.current = turnTimer.endsAt;
    sfx.yourTurn();
    navigator.vibrate?.(150);
  }, [canAct, urgent, turnTimer]);
  const currentTimeouts = timeouts[current.color] ?? 0;

  const diceColor = useDiceColor(state);
  const area = useRef<HTMLDivElement>(null);
  const slots = useRef<Partial<Record<Color, HTMLDivElement | null>>>({});
  const [dicePos, setDicePos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const box = area.current;
    if (!box) return;
    const place = () => {
      const slot = slots.current[diceColor];
      if (!slot) return;
      const from = box.getBoundingClientRect();
      const to = slot.getBoundingClientRect();
      setDicePos({ left: to.left - from.left, top: to.top - from.top });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [diceColor]);

  const slot = (color: Color) => (
    <div
      ref={(el) => {
        slots.current[color] = el;
      }}
      className="shrink-0"
      style={{ width: DICE_SIZE, height: DICE_SIZE }}
      aria-hidden
    />
  );

  const panel = (corner: Corner, align: 'left' | 'right') => {
    const color = campShownAs(corner, turn);
    const forfeited = state.forfeited.includes(color);
    const player = state.players.find((p) => p.color === color);
    const seat =
      seats.find((s) => s.color === color) ??
      (forfeited && player ? { color, name: player.name, isBot: false, connected: false } : undefined);
    return (
    <PlayerPanel
      color={color}
      seat={seat}
      forfeited={forfeited}
      pawns={state.pawns[color]}
      active={!isOver && current.color === color}
      winner={state.winners.includes(color)}
      align={align}
      teamLabel={state.rules.teams ? `équipe ${label(color)}-${label(TEAMMATE[color])}` : undefined}
      palette={palette}
      bubble={reactions.bubbles[color]}
      bubbleSide={corner === 'red' || corner === 'green' ? 'below' : 'above'}
    />
    );
  };

  const headline = isOver
    ? 'Partie terminée'
    : autoplay === current.color
      ? canAct
        ? 'Temps écoulé : l’ordi joue pour toi'
        : `Temps écoulé : l’ordi joue pour ${current.name}`
      : canAct
      ? state.phase === 'roll'
        ? 'À toi : lance le dé !'
        : 'À toi : choisis un pion'
      : `${current.name} joue…`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full flex-col gap-2" style={{ maxWidth: 'max(300px, min(100%, calc(100dvh - 300px)))' }}>
        <header className="flex items-center gap-2">
          <BackButton onClick={onQuit} label="Quitter la partie" compact />
          <div className="min-w-0 flex-1 text-center text-sm font-bold tracking-[0.2em] text-white/80">{title}</div>
          <button type="button" className="icon-btn" aria-label="Apparence" onClick={() => setLookOpen(true)}>
            🎨
          </button>
          <button type="button" className="icon-btn" aria-label="Comment jouer" onClick={() => setHelpOpen(true)}>
            ?
          </button>
          <SoundToggle />
        </header>

        <div ref={area} className="relative flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {panel('red', 'left')}
          {slot(campShownAs('red', turn))}
          {slot(campShownAs('green', turn))}
          {panel('green', 'right')}
        </div>

        <div className="rounded-[26px] p-1.5 shadow-2xl shadow-black/50" style={{ background: theme.frame }}>
          <div className="overflow-hidden rounded-[20px]">
            <Board
              state={state}
              pawns={pawns}
              movableColor={canMove ? moveColor : null}
              onPawnClick={onMove}
              theme={theme}
              pawnStyle={pawnStyle}
              rotation={turn * 90}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          {panel('blue', 'left')}
          {slot(campShownAs('blue', turn))}
          {slot(campShownAs('yellow', turn))}
          {panel('yellow', 'right')}
        </div>

        {dicePos && (
          <div
            className="absolute z-10 transition-[left,top] duration-300 ease-out"
            style={{ left: dicePos.left, top: dicePos.top }}
          >
            <Dice
              value={state.dice}
              rollId={state.rollId}
              shades={palette[diceColor]}
              diceStyle={diceStyle}
              canRoll={canRoll && diceColor === current.color}
              onRoll={onRoll}
              size={DICE_SIZE}
            />
          </div>
        )}
        </div>

        {notice && (
          <div className="rounded-2xl bg-amber-400/15 px-4 py-2 text-center text-sm font-medium text-amber-100">{notice}</div>
        )}

        <div className="card relative mt-1 flex items-center gap-3 p-3">
          {reactions.onReact && (
            <ReactionButton onReact={reactions.onReact} hidden={reactions.hidden} onHiddenChange={reactions.setHidden} />
          )}
          <Avatar color={current.color} seat={currentSeat} size={reactions.onReact ? 36 : 44} palette={palette} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold" style={{ color: palette[current.color].main }}>
              <span className="min-w-0">{headline}</span>
              {timeLeft !== null && (
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                    urgent ? 'animate-pulse bg-red-500 text-white' : 'bg-white/10 text-white/80'
                  }`}
                >
                  {Math.ceil(timeLeft / 1000)} s
                </span>
              )}
            </p>
            {!isOver && currentTimeouts > 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-red-200/90">
                <TimeoutDots count={currentTimeouts} />
                {canAct
                  ? `Tour manqué ${currentTimeouts}/${MAX_TIMEOUTS} : à ${MAX_TIMEOUTS} de suite, tu perds.`
                  : `Tour manqué ${currentTimeouts}/${MAX_TIMEOUTS}`}
              </p>
            )}
            <p key={`${state.rollId}-${state.lastEvent?.type}`} className="pop-in text-[13px] leading-snug text-white/80">
              {describeEvent(state)}
            </p>
            {state.rules.teams && moveColor !== current.color && !isOver && (
              <p className="mt-0.5 text-xs text-white/60">Tu joues pour {label(moveColor)}.</p>
            )}
          </div>
          {timeLeft !== null && turnTimer && (
            <div className="absolute inset-x-4 bottom-1 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div
                className={`h-full rounded-full transition-[width] duration-200 ease-linear ${urgent ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{ width: `${(timeLeft / turnTimer.duration) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <Sheet open={helpOpen} title="Comment jouer" onClose={() => setHelpOpen(false)}>
        <HowToPlay rules={state.rules} />
      </Sheet>
      <Sheet open={lookOpen} title="Apparence" onClose={() => setLookOpen(false)}>
        {you && (
          <div className="mb-5">
            <h3 className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">Ta couleur</h3>
            <ColorPreference assigned={you} />
          </div>
        )}
        <AppearancePicker />
      </Sheet>

      {isOver && !animating && (
        <>
          {(!progress.participant || progress.won) && <Confetti />}
          <div className="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm">
            <div className="pop-in w-full max-w-sm rounded-[28px] border border-white/10 bg-[#1a1b3a] p-6 text-center shadow-2xl">
              <div className="float text-6xl">{progress.participant && !progress.won ? '😢' : '🏆'}</div>
              <h2 className="mt-3 text-3xl font-bold">
                {progress.participant && !progress.won
                  ? 'Perdu…'
                  : state.winners.length > 1
                    ? 'Victoire d’équipe !'
                    : 'Victoire !'}
              </h2>
              {state.lastEvent?.type === 'win' && state.lastEvent.reason === 'forfeit' && (
                <p className="mt-1 text-sm text-white/60">Par abandon : dernier en lice.</p>
              )}
              <div className="mt-4 flex flex-col items-center gap-2">
                {state.winners.map((c) => (
                  <div key={c} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pr-4 pl-1">
                    <Avatar color={c} seat={seats.find((s) => s.color === c)} size={32} palette={palette} />
                    <span className="font-semibold">{state.players.find((p) => p.color === c)?.name}</span>
                  </div>
                ))}
              </div>
              {progress.summary && <RewardSummary state={state} summary={progress.summary} />}
              <div className="mt-6 flex flex-col gap-2">{overlayActions}</div>
              {overlayFooter && <div className="mt-3">{overlayFooter}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
