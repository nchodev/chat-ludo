'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  BASE,
  FINISHED,
  START_INDEX,
  TRACK_LENGTH,
  applyMove,
  createGame,
  rollDice,
  type GameState,
  type ProgressSummary,
} from '@ludo/engine';
import { Board } from '@/components/Board';
import { Confetti } from '@/components/Confetti';
import { Dice } from '@/components/Dice';
import { RewardSummary } from '@/components/RewardSummary';
import { useAnimatedPawns } from '@/lib/animation';
import { useAppearance } from '@/lib/appearance';
import { finishTutorial } from '@/lib/profile';
import { sfx } from '@/lib/sound';

interface Step {
  /** Builds the board for this step; omitted to continue from the previous one. */
  setup?: () => GameState;
  /** Value the die will show, or none for an explanation step. */
  dice?: number;
  title: string;
  text: string;
  /** Hint once the die has been rolled. */
  moveHint?: string;
}

/** Square 14 on the shared track, four squares ahead of red's pawn on square 10. */
const YELLOW_TARGET = (14 - START_INDEX.yellow + TRACK_LENGTH) % TRACK_LENGTH;

function board(red: number[], yellow: number[] = [BASE, BASE, BASE, BASE]): GameState {
  const game = createGame([
    { color: 'red', name: 'Toi' },
    { color: 'yellow', name: 'Coach' },
  ]);
  game.id = `tutorial-${Date.now()}`;
  game.pawns = { red, yellow };
  return game;
}

const STEPS: Step[] = [
  {
    setup: () => board([BASE, BASE, BASE, BASE]),
    title: 'Bienvenue au Ludo ! 👋',
    text: 'Tu joues les Rouges. Le but : amener tes 4 pions au centre du plateau avant ton adversaire.',
  },
  {
    dice: 6,
    title: 'Sortir un pion',
    text: 'Un pion ne quitte sa base qu’avec un 6. Touche le dé pour le lancer !',
    moveHint: 'Un 6 ! Touche un de tes pions pour le poser sur sa case de départ.',
  },
  {
    dice: 4,
    title: 'Le 6 fait rejouer',
    text: 'Après un 6, tu relances le dé. Vas-y !',
    moveHint: 'Ton pion avance d’autant de cases que le dé. Touche-le.',
  },
  {
    setup: () => board([10, BASE, BASE, BASE], [YELLOW_TARGET, BASE, BASE, BASE]),
    dice: 4,
    title: 'Capturer',
    text: 'Un pion jaune est 4 cases devant toi. Tombe pile dessus pour le renvoyer dans sa base !',
    moveHint: 'Touche ton pion pour capturer le pion jaune.',
  },
  {
    title: 'Les cases protégées ⭐',
    text: 'Sur les étoiles et les cases de départ, personne ne peut être capturé. Pense à t’y abriter quand un adversaire approche !',
  },
  {
    setup: () => board([FINISHED - 3, FINISHED, FINISHED, FINISHED]),
    dice: 3,
    title: 'Rentrer au centre',
    text: 'Ton dernier pion est dans sa colonne d’arrivée. Il faut le chiffre exact pour atteindre le centre. Lance !',
    moveHint: 'Pile 3 cases : touche ton pion pour gagner !',
  },
];

const NEXT_STEP_DELAY_MS = 1200;

export default function TutorialPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [game, setGame] = useState(() => STEPS[0].setup!());
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const { board: theme, dice: diceStyle, pawn: pawnStyle } = useAppearance();
  const { pawns, animating } = useAnimatedPawns(game);
  const step = STEPS[stepIndex];

  const goTo = (index: number) => {
    if (index >= STEPS.length) {
      setDone(true);
      sfx.win();
      finishTutorial().then(setSummary, () => {});
      return;
    }
    const next = STEPS[index];
    if (next.setup) setGame(next.setup());
    else setGame((g) => ({ ...g, current: 0, phase: 'roll', dice: null, legalMoves: [], lastEvent: null }));
    setStepIndex(index);
  };

  const moved = game.lastEvent?.type === 'move' || game.lastEvent?.type === 'win';
  useEffect(() => {
    if (!moved || animating || done) return;
    const timer = setTimeout(() => goTo(stepIndex + 1), NEXT_STEP_DELAY_MS);
    return () => clearTimeout(timer);
    // Advance once per move, after the pawn animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moved, animating, done, stepIndex]);

  const canRoll = !!step.dice && game.phase === 'roll' && !moved && !animating;
  const canMove = game.phase === 'move' && !animating;

  const roll = () => {
    if (!canRoll) return;
    sfx.roll();
    setGame((g) => rollDice(g, step.dice!));
  };

  const move = (pawn: number) => {
    if (!canMove || !game.legalMoves.some((m) => m.pawn === pawn)) return;
    setGame((g) => applyMove(g, pawn));
  };

  const hint = moved ? 'Bien joué ! 👏' : game.phase === 'move' ? step.moveHint : step.text;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full flex-col gap-3" style={{ maxWidth: 'max(300px, min(100%, calc(100dvh - 260px)))' }}>
        <header className="flex items-center gap-2">
          <Link href="/" className="icon-btn" aria-label="Quitter le tutoriel">
            ←
          </Link>
          <div className="flex flex-1 justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-6 bg-emerald-400' : i < stepIndex ? 'w-3 bg-emerald-400/60' : 'w-3 bg-white/20'}`}
              />
            ))}
          </div>
          <span className="w-10 text-right text-xs font-semibold text-white/50">
            {Math.min(stepIndex + 1, STEPS.length)}/{STEPS.length}
          </span>
        </header>

        <div className="rounded-[26px] p-1.5 shadow-2xl shadow-black/50" style={{ background: theme.frame }}>
          <div className="overflow-hidden rounded-[20px]">
            <Board
              state={game}
              pawns={pawns}
              movableColor={canMove ? 'red' : null}
              onPawnClick={move}
              theme={theme}
              pawnStyle={pawnStyle}
            />
          </div>
        </div>

        <div className="card flex items-center gap-3 p-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-2xl shadow-lg">
            🦉
          </span>
          <div key={`${stepIndex}-${game.phase}-${moved}`} className="pop-in min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-300">{step.title}</p>
            <p className="text-[13px] leading-snug text-white/85">{hint}</p>
          </div>
          {step.dice ? (
            <div className={canRoll ? 'animate-pulse' : ''}>
              <Dice
                value={game.dice}
                rollId={game.rollId}
                shades={theme.colors.red}
                diceStyle={diceStyle}
                canRoll={canRoll}
                onRoll={roll}
              />
            </div>
          ) : (
            <button type="button" onClick={() => goTo(stepIndex + 1)} className="btn btn-primary shrink-0">
              {stepIndex === 0 ? 'C’est parti' : 'Compris'}
            </button>
          )}
        </div>
      </div>

      {done && (
        <>
          <Confetti />
          <div className="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm">
            <div className="pop-in w-full max-w-sm rounded-[28px] border border-white/10 bg-[#1a1b3a] p-6 text-center shadow-2xl">
              <div className="float text-6xl">🎓</div>
              <h2 className="mt-3 text-3xl font-bold">Tu es prêt !</h2>
              <p className="mt-1 text-sm text-white/60">
                Tu connais l’essentiel. Les règles complètes sont dans le bouton « ? » en partie.
              </p>
              {summary && <RewardSummary state={game} summary={summary} />}
              <div className="mt-6 flex flex-col gap-2">
                <Link href="/local" className="btn btn-primary">
                  Jouer contre l’ordinateur
                </Link>
                <Link href="/rapide" className="btn btn-light">
                  Partie rapide en ligne
                </Link>
                <Link href="/" className="btn btn-ghost">
                  Menu
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
