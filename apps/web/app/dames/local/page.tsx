'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  chooseDraughtsMove,
  endDraughtsGame,
  newDraughtsGame,
  otherSide,
  playDraughtsMove,
  type DraughtsBotLevel,
  type DraughtsMove,
  type DraughtsState,
  type Side,
} from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { PieceDisc } from '@/components/draughts/DraughtsBoard';
import { DraughtsGameView, GameButton, ResultHeader, SIDE_LABEL } from '@/components/draughts/DraughtsGameView';
import { getStoredName } from '@/lib/socket';
import { useProfile } from '@/lib/profile';

type Mode = 'bot' | 'friend';
type ColorChoice = Side | 'random';

const LEVELS: { id: DraughtsBotLevel; label: string; hint: string }[] = [
  { id: 'easy', label: 'Facile', hint: 'Pour découvrir' },
  { id: 'medium', label: 'Moyen', hint: 'Voit 3 coups' },
  { id: 'hard', label: 'Difficile', hint: 'Calcule loin' },
];
const LEVEL_NAME: Record<DraughtsBotLevel, string> = { easy: 'Ordi facile', medium: 'Ordi moyen', hard: 'Ordi difficile' };
const BOT_DELAY_MS = 450;

interface Setup {
  mode: Mode;
  level: DraughtsBotLevel;
  color: ColorChoice;
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: React.ReactNode; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-2 text-[14.5px] font-semibold transition ${
            value === o.id ? 'border-[#00a884] bg-[#00a884]/10 text-[#e9edef]' : 'border-transparent bg-[#2a3942] text-[#aebac1]'
          }`}
        >
          {o.label}
          {o.hint && <span className="text-[11.5px] font-normal text-[#8696a0]">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export default function DamesLocalPage() {
  const router = useRouter();
  const { session } = useProfile();
  const [setup, setSetup] = useState<Setup>({ mode: 'bot', level: 'medium', color: 'white' });
  const [game, setGame] = useState<{ state: DraughtsState; human: Side | null; level: DraughtsBotLevel; past: DraughtsState[] } | null>(null);
  const [flip, setFlip] = useState(false);
  const [confirm, setConfirm] = useState<'quit' | 'resign' | null>(null);
  const [thinking, setThinking] = useState(false);
  const you = session?.username ?? (getStoredName() || 'Toi');

  const start = (s = setup) => {
    const human: Side | null = s.mode === 'friend' ? null : s.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : s.color;
    setGame({ state: newDraughtsGame(), human, level: s.level, past: [] });
    setFlip(false);
  };

  // The computer plays its moves after a short pause.
  const botTurn = !!game && game.human !== null && game.state.status === 'playing' && game.state.turn !== game.human;
  const stateId = game ? `${game.state.id}:${game.state.ids.join(',')}:${game.state.turn}` : '';
  useEffect(() => {
    if (!botTurn || !game) return;
    setThinking(true);
    const timer = setTimeout(() => {
      const move = chooseDraughtsMove(game.state, game.level);
      setThinking(false);
      setGame((g) => (g && g.state === game.state ? { ...g, state: playDraughtsMove(g.state, move.from, move.to, move.captures) } : g));
    }, BOT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botTurn, stateId]);

  if (!game) {
    return (
      <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
        <AppBar title="Sur cet écran" subtitle="Dames internationales" backHref="/dames" backText="Dames" backLabel="Retour aux dames" />
        <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-32">
          <section className="rounded-[28px] bg-[#1f2c33] p-4">
            <h2 className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">Adversaire</h2>
            <Choice
              value={setup.mode}
              onChange={(mode) => setSetup({ ...setup, mode })}
              options={[
                { id: 'bot', label: <span className="flex items-center gap-1.5"><Icon.Robot size={20} />Ordinateur</span> },
                { id: 'friend', label: <span className="flex items-center gap-1.5"><Icon.Groups size={20} />Un ami</span> },
              ]}
            />
            {setup.mode === 'friend' && (
              <p className="mt-3 px-1 text-[13px] text-[#8696a0]">Vous jouez à tour de rôle sur ce téléphone. Les blancs commencent.</p>
            )}
          </section>

          {setup.mode === 'bot' && (
            <>
              <section className="rounded-[28px] bg-[#1f2c33] p-4">
                <h2 className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">Niveau</h2>
                <Choice value={setup.level} onChange={(level) => setSetup({ ...setup, level })} options={LEVELS} />
              </section>
              <section className="rounded-[28px] bg-[#1f2c33] p-4">
                <h2 className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">Tu joues</h2>
                <Choice
                  value={setup.color}
                  onChange={(color) => setSetup({ ...setup, color })}
                  options={[
                    { id: 'white', label: <span className="flex items-center gap-2"><span className="size-6"><PieceDisc piece="w" /></span>Blancs</span>, hint: 'Tu commences' },
                    { id: 'black', label: <span className="flex items-center gap-2"><span className="size-6"><PieceDisc piece="b" /></span>Noirs</span> },
                    { id: 'random', label: <span className="flex items-center gap-1.5"><Icon.Swap size={20} />Hasard</span> },
                  ]}
                />
              </section>
            </>
          )}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => start()}
            className="mx-auto flex h-14 w-full max-w-lg items-center justify-center gap-2 rounded-full bg-[#00a884] text-[16px] font-semibold text-[#0b141a] transition active:scale-[0.98]"
          >
            <Icon.Play size={24} />
            Commencer la partie
          </button>
        </div>
      </div>
    );
  }

  const { state, human, level } = game;
  const vsBot = human !== null;
  const bottomSide: Side = vsBot ? human : flip ? 'black' : 'white';
  const names: Record<Side, string> = vsBot
    ? { [human]: you, [otherSide(human)]: LEVEL_NAME[level] } as Record<Side, string>
    : { white: 'Blancs', black: 'Noirs' };

  const play = (move: DraughtsMove) => {
    setGame((g) => (g ? { ...g, past: [...g.past, g.state], state: playDraughtsMove(g.state, move.from, move.to, move.captures) } : g));
  };

  // Against the computer, undo goes back to the player's previous turn.
  const undo = () => {
    setGame((g) => {
      if (!g || !g.past.length) return g;
      const past = g.past.slice();
      let state = past.pop()!;
      while (g.human && state.turn !== g.human && past.length) state = past.pop()!;
      return { ...g, state, past };
    });
  };
  const canUndo = vsBot && game.past.length > 0 && state.status === 'playing' && !botTurn;
  const playing = state.status === 'playing' && game.past.length > 0;

  const resign = () => {
    const loser = vsBot ? human! : state.turn;
    setGame((g) => (g ? { ...g, state: endDraughtsGame(g.state, otherSide(loser), 'resign') } : g));
    setConfirm(null);
  };

  return (
    <>
      <DraughtsGameView
        title={vsBot ? `Contre ${LEVEL_NAME[level].toLowerCase()}` : 'À deux sur cet écran'}
        subtitle="Dames internationales"
        onBack={() => (playing ? setConfirm('quit') : router.push('/dames'))}
        backLabel="Quitter la partie"
        state={state}
        top={{ name: names[otherSide(bottomSide)], side: otherSide(bottomSide), you: false, detail: thinking ? 'Réfléchit…' : undefined }}
        bottom={{ name: names[bottomSide], side: bottomSide, you: vsBot }}
        flipped={bottomSide === 'black'}
        interactive={state.status === 'playing' && (!vsBot || state.turn === human)}
        onMove={play}
        toolbar={
          state.status === 'playing' ? (
            <>
              {vsBot ? (
                <GameButton onClick={undo} disabled={!canUndo} icon={<Icon.Undo size={18} />}>
                  Annuler le coup
                </GameButton>
              ) : (
                <GameButton onClick={() => setFlip((f) => !f)} icon={<Icon.Swap size={18} />}>
                  Tourner le plateau
                </GameButton>
              )}
              <GameButton onClick={() => setConfirm('resign')} tone="danger" icon={<Icon.Flag size={18} />}>
                Abandonner
              </GameButton>
            </>
          ) : undefined
        }
        result={
          <>
            <ResultHeader state={state} viewer={vsBot ? human : null} names={names} />
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => start({ ...setup, color: vsBot && setup.color !== 'random' ? otherSide(human!) : setup.color })}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]"
              >
                <Icon.Refresh size={20} />
                {vsBot && setup.color !== 'random' ? `Rejouer avec les ${SIDE_LABEL[otherSide(human!)].toLowerCase()}` : 'Rejouer'}
              </button>
              <button
                type="button"
                onClick={() => setGame(null)}
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#e9edef]"
              >
                <Icon.Tune size={20} />
                Changer les réglages
              </button>
            </div>
          </>
        }
      />
      <Sheet open={confirm !== null} title={confirm === 'resign' ? 'Abandonner la partie ?' : 'Quitter la partie ?'} onClose={() => setConfirm(null)}>
        <p className="text-[14px] text-[#aebac1]">
          {confirm === 'resign'
            ? vsBot
              ? 'L’ordinateur remportera la partie.'
              : `Les ${SIDE_LABEL[state.turn].toLowerCase()} abandonnent : les ${SIDE_LABEL[otherSide(state.turn)].toLowerCase()} gagnent.`
            : 'La partie en cours sera perdue.'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 pb-1">
          <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-full border border-[#2a3942] text-[15px] font-semibold">
            Continuer
          </button>
          <button
            type="button"
            onClick={() => (confirm === 'resign' ? resign() : router.push('/dames'))}
            className="h-12 rounded-full bg-[#f15c6d] text-[15px] font-semibold text-white"
          >
            {confirm === 'resign' ? 'Abandonner' : 'Quitter'}
          </button>
        </div>
      </Sheet>
    </>
  );
}
