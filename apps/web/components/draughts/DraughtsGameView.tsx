'use client';

import { countPieces, otherSide, type DraughtsMove, type DraughtsState, type Side } from '@ludo/engine';
import { DuelFrame, PlayerBar, ResultHeader as DuelResultHeader, commonEnding, type DuelSeat, type DuelViewProps } from '../duel/DuelFrame';
import { DraughtsBoard, PieceDisc } from './DraughtsBoard';

export { GameButton, formatClock, useTick } from '../duel/DuelFrame';
export type DraughtsSeat = DuelSeat;

export const SIDE_LABEL: Record<Side, string> = { white: 'Blancs', black: 'Noirs' };

function DraughtsPlayerBar({ seat, state }: { seat: DraughtsSeat; state: DraughtsState }) {
  const taken = 20 - countPieces(state.board)[otherSide(seat.side)];
  return (
    <PlayerBar
      seat={seat}
      turn={state.status === 'playing' && state.turn === seat.side}
      icon={<PieceDisc piece={seat.side === 'white' ? 'w' : 'b'} />}
      idle={`${SIDE_LABEL[seat.side]} · ${taken} prise${taken > 1 ? 's' : ''}`}
    />
  );
}

type Props = Omit<DuelViewProps<DraughtsState>, 'onMove'> & { onMove: (move: DraughtsMove) => void };

export function DraughtsGameView({ title, subtitle, onBack, backLabel, state, top, bottom, flipped, interactive, onMove, banner, toolbar, result }: Props) {
  const mustCapture = interactive && state.legalMoves.some((m) => m.captures.length > 0);
  const most = mustCapture ? Math.max(...state.legalMoves.map((m) => m.captures.length)) : 0;

  return (
    <DuelFrame
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      backLabel={backLabel}
      topBar={<DraughtsPlayerBar seat={top} state={state} />}
      bottomBar={<DraughtsPlayerBar seat={bottom} state={state} />}
      banner={banner}
      board={
        <DraughtsBoard
          board={state.board}
          ids={state.ids}
          legalMoves={state.legalMoves}
          lastMove={state.lastMove}
          flipped={flipped}
          interactive={interactive && state.status === 'playing'}
          onMove={onMove}
        />
      }
      hint={
        mustCapture
          ? `Prise obligatoire : ${most} pièce${most > 1 ? 's' : ''} à prendre.`
          : interactive
            ? 'À toi de jouer : touche une pièce puis sa case d’arrivée.'
            : null
      }
      toolbar={toolbar}
      result={result}
      over={state.status === 'over'}
      gameId={state.id}
    />
  );
}

/** The online room and quick match pages drive every game through the same props. */
export function DraughtsDuelView(props: DuelViewProps<DraughtsState>) {
  return <DraughtsGameView {...props} onMove={(m) => props.onMove({ from: m.from, to: m.to, captures: m.captures })} />;
}

export function draughtsEnding(state: DraughtsState, names: Record<Side, string>) {
  const loser = state.winner ? names[otherSide(state.winner)] : '';
  return (
    commonEnding(state.endReason, state.winner, names) ??
    (state.endReason === 'blocked'
      ? `${loser} n’a plus de pièce ou plus de coup possible.`
      : state.endReason === 'repetition'
        ? 'La même position est revenue trois fois.'
        : '25 coups de dames de chaque côté sans prise.')
  );
}

/** Title, icon and explanation of a finished game, seen by `viewer` (null for a shared screen). */
export function ResultHeader({ state, viewer, names }: { state: DraughtsState; viewer: Side | null; names: Record<Side, string> }) {
  return <DuelResultHeader winner={state.winner} viewer={viewer} names={names} explanation={draughtsEnding(state, names)} />;
}
