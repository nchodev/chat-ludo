'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  TEAMMATE,
  computeReward,
  controlledColor,
  type Color,
  type GameState,
  type OpponentKind,
} from '@ludo/engine';
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
import { COLOR_LABEL, describeEvent } from '@/lib/labels';
import { sfx } from '@/lib/sound';
import type { useReactionBubbles } from '@/lib/reactions';
import { claimReward } from '@/lib/wallet';
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
  /** Message shown above the action bar, e.g. when this player was eliminated. */
  notice?: ReactNode;
  /** Colors played from this device: their victories earn coins here. */
  rewardColors: Color[];
  online: boolean;
  reactions: ReactionBubbles & {
    /** Sends a reaction; absent when this screen has no player who may react (spectators). */
    onReact?: (reaction: string) => void;
  };
}

const AUTO_MOVE_DELAY_MS = DICE_ANIMATION_MS + 250;

export function GameView({
  state,
  seats,
  canAct,
  onRoll,
  onMove,
  title,
  onQuit,
  overlayActions,
  notice,
  rewardColors,
  online,
  reactions,
}: GameViewProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const { board: theme, dice: diceStyle, pawn: pawnStyle } = useAppearance();
  const palette = theme.colors;
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

  const rewardColor = isOver ? rewardColors.find((c) => state.winners.includes(c)) : undefined;
  const reward = useMemo(() => {
    if (!rewardColor) return null;
    const opponentKind = (color: Color): OpponentKind => {
      const seat = seats.find((s) => s.color === color);
      return seat?.isBot ? { kind: 'bot', level: seat.botLevel ?? 'medium' } : { kind: 'human', online };
    };
    return computeReward(state, rewardColor, opponentKind);
  }, [state, rewardColor, seats, online]);
  const lostHere = isOver && rewardColors.length > 0 && !rewardColor;

  useEffect(() => {
    if (reward && !animating) claimReward(state.id, reward.total);
  }, [reward, animating, state.id]);

  const panel = (color: Color, align: 'left' | 'right') => {
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
      teamLabel={state.rules.teams ? `équipe ${COLOR_LABEL[color]}-${COLOR_LABEL[TEAMMATE[color]]}` : undefined}
      palette={palette}
      bubble={reactions.bubbles[color]}
      bubbleSide={color === 'red' || color === 'green' ? 'below' : 'above'}
    />
    );
  };

  const headline = isOver
    ? 'Partie terminée'
    : canAct
      ? state.phase === 'roll'
        ? 'À toi : lance le dé !'
        : 'À toi : choisis un pion'
      : `${current.name} joue…`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full flex-col gap-2" style={{ maxWidth: 'max(300px, min(100%, calc(100dvh - 300px)))' }}>
        <header className="flex items-center gap-2">
          <button type="button" className="icon-btn" aria-label="Quitter" onClick={onQuit}>
            ←
          </button>
          <div className="min-w-0 flex-1 text-center text-sm font-bold tracking-[0.2em] text-white/80">{title}</div>
          <button type="button" className="icon-btn" aria-label="Apparence" onClick={() => setLookOpen(true)}>
            🎨
          </button>
          <button type="button" className="icon-btn" aria-label="Comment jouer" onClick={() => setHelpOpen(true)}>
            ?
          </button>
          <SoundToggle />
        </header>

        <div className="flex justify-between gap-2">
          {panel('red', 'left')}
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
            />
          </div>
        </div>

        <div className="flex justify-between gap-2">
          {panel('blue', 'left')}
          {panel('yellow', 'right')}
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
            <p className="text-sm font-bold" style={{ color: palette[current.color].main }}>
              {headline}
            </p>
            <p key={`${state.rollId}-${state.lastEvent?.type}`} className="pop-in text-[13px] leading-snug text-white/80">
              {describeEvent(state)}
            </p>
            {state.rules.teams && moveColor !== current.color && !isOver && (
              <p className="mt-0.5 text-xs text-white/60">Tu joues pour {COLOR_LABEL[moveColor]}.</p>
            )}
          </div>
          <Dice
            value={state.dice}
            rollId={state.rollId}
            shades={palette[current.color]}
            diceStyle={diceStyle}
            canRoll={canRoll}
            onRoll={onRoll}
          />
        </div>
      </div>

      <Sheet open={helpOpen} title="Comment jouer" onClose={() => setHelpOpen(false)}>
        <HowToPlay rules={state.rules} />
      </Sheet>
      <Sheet open={lookOpen} title="Apparence" onClose={() => setLookOpen(false)}>
        <AppearancePicker />
      </Sheet>

      {isOver && !animating && (
        <>
          <Confetti />
          <div className="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm">
            <div className="pop-in w-full max-w-sm rounded-[28px] border border-white/10 bg-[#1a1b3a] p-6 text-center shadow-2xl">
              <div className="float text-6xl">🏆</div>
              <h2 className="mt-3 text-3xl font-bold">
                {state.winners.length > 1 ? 'Victoire d’équipe !' : 'Victoire !'}
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
              {reward && <RewardSummary state={state} reward={reward} />}
              {lostHere && (
                <p className="mt-4 rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/60">
                  Pas de pièces cette fois : gagne une partie pour en remporter !
                </p>
              )}
              <div className="mt-6 flex flex-col gap-2">{overlayActions}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
