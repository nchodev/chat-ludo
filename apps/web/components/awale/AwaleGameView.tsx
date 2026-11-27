'use client';

import { awalePitsOf, otherSide, type AwaleState, type Side } from '@ludo/engine';
import { DuelFrame, PlayerBar, ResultHeader as DuelResultHeader, commonEnding, type DuelSeat, type DuelViewProps } from '../duel/DuelFrame';
import { AwaleBoard, SeedDot } from './AwaleBoard';
import { tr } from '@/lib/i18n';

export const AWALE_SIDE_LABEL: Record<Side, string> = {
  get white() {
    return tr('Sud', 'South');
  },
  get black() {
    return tr('Nord', 'North');
  },
};

/** Round token of a player: light wood for South, dark wood for North. */
export function AwaleSideToken({ side }: { side: Side }) {
  return (
    <span
      className={`grid size-full place-items-center rounded-full shadow-[inset_0_-2px_0_rgba(0,0,0,0.3)] ${
        side === 'white' ? 'bg-gradient-to-br from-[#d9b383] to-[#9a6a3f]' : 'bg-gradient-to-br from-[#6b4527] to-[#2c190c]'
      }`}
    >
      <span className="flex gap-0.5">
        <SeedDot className="size-2" />
        <SeedDot className="size-2" />
        <SeedDot className="size-2" />
      </span>
    </span>
  );
}

function AwalePlayerBar({ seat, state }: { seat: DuelSeat; state: AwaleState }) {
  const store = state.store[seat.side];
  return (
    <PlayerBar
      seat={seat}
      turn={state.status === 'playing' && state.turn === seat.side}
      icon={<AwaleSideToken side={seat.side} />}
      idle={AWALE_SIDE_LABEL[seat.side]}
      badge={
        <span className="flex h-10 shrink-0 flex-col items-center justify-center rounded-xl bg-[#0b141a] px-2.5" title={tr('Graines prises', 'Seeds captured')}>
          <span className="text-[17px] leading-none font-bold tabular-nums text-[#f3e6cf]">{store}</span>
          <span className="text-[10px] leading-tight text-[#8696a0]">graine{store > 1 ? 's' : ''}</span>
        </span>
      }
    />
  );
}

type Props = Omit<DuelViewProps<AwaleState>, 'onMove'> & { onMove: (pit: number) => void };

export function AwaleGameView({ title, subtitle, onBack, backLabel, state, top, bottom, flipped, interactive, onMove, banner, toolbar, result }: Props) {
  const own = awalePitsOf(state.turn).filter((pit) => state.pits[pit] > 0);
  const mustFeed = interactive && state.legalMoves.length < own.length;
  const opponentEmpty = awalePitsOf(otherSide(state.turn)).every((pit) => state.pits[pit] === 0);
  return (
    <DuelFrame
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      backLabel={backLabel}
      topBar={<AwalePlayerBar seat={top} state={state} />}
      bottomBar={<AwalePlayerBar seat={bottom} state={state} />}
      banner={banner}
      board={
        <AwaleBoard
          pits={state.pits}
          legalMoves={state.legalMoves}
          lastMove={state.lastMove}
          flipped={flipped}
          interactive={interactive && state.status === 'playing'}
          onPlay={onMove}
        />
      }
      hint={
        mustFeed || (interactive && opponentEmpty)
          ? tr('Ton adversaire n’a plus de graines : tu dois le nourrir.', 'Your opponent has no seeds left: you must feed them.')
          : interactive
            ? tr('À toi de jouer : touche un de tes trous.', 'Your move: tap one of your pits.')
            : state.lastMove?.slam
              ? tr('Grand chelem : prendre toutes les graines est interdit, rien n’est pris.', 'Grand slam: taking all the seeds is not allowed, nothing is captured.')
              : null
      }
      toolbar={toolbar}
      result={result}
      over={state.status === 'over'}
      gameId={state.id}
    />
  );
}

export function AwaleDuelView(props: DuelViewProps<AwaleState>) {
  return <AwaleGameView {...props} onMove={(pit) => props.onMove({ pit })} />;
}

export function awaleEnding(state: AwaleState, names: Record<Side, string>) {
  const score = tr(`Score : ${state.store.white} à ${state.store.black}.`, `Score: ${state.store.white} to ${state.store.black}.`);
  const common = commonEnding(state.endReason, state.winner, names);
  if (common) return common;
  switch (state.endReason) {
    case 'majority':
      return tr(`${names[state.winner!]} a pris plus de la moitié des graines. ${score}`, `${names[state.winner!]} captured more than half the seeds. ${score}`);
    case 'starved':
      return tr(`Impossible de nourrir l’adversaire : chacun garde les graines de son côté. ${score}`, `Couldn’t feed the opponent: each keeps the seeds on their side. ${score}`);
    default:
      return tr(`Les graines tournaient sans prise : chacun garde les graines de son côté. ${score}`, `The seeds kept going round with no capture: each keeps the seeds on their side. ${score}`);
  }
}

export function AwaleResultHeader({ state, viewer, names }: { state: AwaleState; viewer: Side | null; names: Record<Side, string> }) {
  return <DuelResultHeader winner={state.winner} viewer={viewer} names={names} explanation={awaleEnding(state, names)} />;
}
