'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DEFAULT_RULES,
  DUEL_PAIRS,
  areDiagonal,
  botReaction,
  eventKey,
  sanitizeRules,
  type BotLevel,
  type Color,
} from '@ludo/engine';
import { AppearanceCard } from '@/components/AppearancePicker';
import { GameView } from '@/components/GameView';
import { Avatar } from '@/components/PlayerPanel';
import { RulesCard } from '@/components/RulesCard';
import { Sheet } from '@/components/Sheet';
import { COLOR_DARK, COLOR_HEX } from '@/lib/board';
import { BOT_LEVEL_LABEL, COLOR_LABEL } from '@/lib/labels';
import { useReactionBubbles } from '@/lib/reactions';
import { activeSeats, useLocalGame, type LocalSeat, type LocalSetup } from '@/lib/useLocalGame';

const STORAGE_KEY = 'ludo:localSetup';

/** Seats are shown in the same layout as the board corners. */
const CORNER_ORDER: Color[] = ['red', 'green', 'blue', 'yellow'];

const DEFAULT_SETUP: LocalSetup = {
  seats: [
    { color: 'red', kind: 'human', name: 'Joueur 1', botLevel: 'medium' },
    { color: 'green', kind: 'none', name: 'Joueur 2', botLevel: 'medium' },
    { color: 'yellow', kind: 'bot', name: 'Joueur 3', botLevel: 'medium' },
    { color: 'blue', kind: 'none', name: 'Joueur 4', botLevel: 'medium' },
  ],
  rules: DEFAULT_RULES,
};

function setupError(setup: LocalSetup): string | null {
  const active = activeSeats(setup);
  if (active.length < 2) return 'Ajoute au moins 2 joueurs.';
  if (setup.rules.teams && active.length !== 4) return 'Le mode équipes nécessite 4 joueurs.';
  if (active.length === 2 && !areDiagonal(active[0].color, active[1].color)) {
    return 'À deux, les camps doivent être en diagonale : choisis un duel ci-dessus.';
  }
  return null;
}

/** Moves the two active players onto a diagonal pair, keeping a player in place when possible. */
function applyDuelPair(setup: LocalSetup, pair: [Color, Color]): LocalSetup {
  const active = activeSeats(setup);
  const assigned = new Map<Color, LocalSeat>();
  for (const s of active) if (pair.includes(s.color)) assigned.set(s.color, s);
  const rest = active.filter((s) => !pair.includes(s.color));
  for (const c of pair) if (!assigned.has(c) && rest.length) assigned.set(c, rest.shift()!);
  return {
    ...setup,
    seats: setup.seats.map((seat) => {
      const src = assigned.get(seat.color);
      return src ? { ...seat, kind: src.kind, name: src.name, botLevel: src.botLevel } : { ...seat, kind: 'none' };
    }),
  };
}

export default function LocalPage() {
  const [setup, setSetup] = useState<LocalSetup>(DEFAULT_SETUP);
  const [gameKey, setGameKey] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved?.seats?.length === 4) setSetup({ seats: saved.seats, rules: sanitizeRules(saved.rules) });
    } catch {
      // Ignore corrupted saved setup.
    }
  }, []);

  const updateSeat = (color: Color, patch: Partial<LocalSeat>) =>
    setSetup((s) => ({ ...s, seats: s.seats.map((seat) => (seat.color === color ? { ...seat, ...patch } : seat)) }));

  const start = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    setSetup({
      ...setup,
      seats: setup.seats.map((s) => ({
        ...s,
        name: s.kind === 'bot' ? `Ordi ${BOT_LEVEL_LABEL[s.botLevel].toLowerCase()}` : s.name.trim() || COLOR_LABEL[s.color],
      })),
    });
    setGameKey(Date.now());
  };

  if (gameKey !== null) {
    return <LocalGame key={gameKey} setup={setup} onQuit={() => setGameKey(null)} />;
  }

  const error = setupError(setup);
  const count = activeSeats(setup).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Menu">
          ←
        </Link>
        <div>
          <h1 className="text-xl font-bold leading-tight">Nouvelle partie</h1>
          <p className="text-sm text-white/60">Sur cet écran · {count} joueur{count > 1 ? 's' : ''}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {CORNER_ORDER.map((color) => {
          const seat = setup.seats.find((s) => s.color === color)!;
          return <SeatTile key={color} seat={seat} onChange={(patch) => updateSeat(color, patch)} />;
        })}
      </section>

      {count === 2 && <DuelPicker setup={setup} onPick={(pair) => setSetup((s) => applyDuelPair(s, pair))} />}

      <AppearanceCard />

      <RulesCard rules={setup.rules} onChange={(rules) => setSetup((s) => ({ ...s, rules }))} />

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#0f1029] via-[#0f1029]/90 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          {error && <p className="mb-2 text-center text-sm font-medium text-amber-300">{error}</p>}
          <button type="button" disabled={!!error} onClick={start} className="btn btn-primary w-full py-4 text-lg">
            Lancer la partie 🎲
          </button>
        </div>
      </div>
    </main>
  );
}

function DuelPicker({ setup, onPick }: { setup: LocalSetup; onPick: (pair: [Color, Color]) => void }) {
  const active = activeSeats(setup).map((s) => s.color);
  const valid = areDiagonal(active[0], active[1]);

  return (
    <section className={`card flex flex-col gap-3 p-4 ${valid ? '' : 'ring-2 ring-amber-400'}`}>
      <div>
        <h2 className="font-bold">⚔️ Duel</h2>
        <p className="text-sm text-white/60">À deux, les camps se font face en diagonale.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DUEL_PAIRS.map((pair) => {
          const selected = pair.every((c) => active.includes(c));
          return (
            <button
              key={pair.join('-')}
              type="button"
              onClick={() => onPick(pair)}
              aria-pressed={selected}
              className={`flex items-center gap-3 rounded-2xl p-2.5 text-left transition active:scale-[0.97] ${
                selected ? 'bg-white text-slate-900 shadow-lg' : 'bg-white/[0.06]'
              }`}
            >
              <MiniBoard pair={pair} />
              <span className="text-sm leading-tight font-semibold">
                {COLOR_LABEL[pair[0]]}
                <span className={selected ? 'text-slate-500' : 'text-white/50'}> contre </span>
                {COLOR_LABEL[pair[1]]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 2x2 grid of board corners with the duel pair highlighted. */
function MiniBoard({ pair }: { pair: [Color, Color] }) {
  return (
    <span className="grid size-10 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
      {CORNER_ORDER.map((c) => (
        <span key={c} style={{ background: COLOR_HEX[c], opacity: pair.includes(c) ? 1 : 0.15 }} />
      ))}
    </span>
  );
}

function SeatTile({ seat, onChange }: { seat: LocalSeat; onChange: (patch: Partial<LocalSeat>) => void }) {
  const active = seat.kind !== 'none';
  return (
    <div
      className={`flex flex-col gap-2 rounded-3xl p-2.5 transition ${active ? 'shadow-lg' : 'opacity-70'}`}
      style={{
        background: active
          ? `linear-gradient(160deg, ${COLOR_HEX[seat.color]}55, ${COLOR_DARK[seat.color]}33)`
          : 'rgba(255,255,255,0.04)',
        border: `1.5px solid ${active ? COLOR_HEX[seat.color] : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar color={seat.color} seat={{ ...seat, isBot: seat.kind === 'bot', connected: true }} size={32} />
        <span className="font-bold">{COLOR_LABEL[seat.color]}</span>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/25 p-1">
        {(
          [
            ['human', '👤', 'Humain'],
            ['bot', '🤖', 'Ordinateur'],
            ['none', '✕', 'Aucun'],
          ] as const
        ).map(([kind, icon, label]) => (
          <button
            key={kind}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onChange({ kind })}
            className={`chip-toggle py-1.5 text-base ${seat.kind === kind ? 'bg-white text-slate-900 shadow' : 'text-white/70'}`}
          >
            {icon}
          </button>
        ))}
      </div>

      {seat.kind === 'human' && (
        <input
          value={seat.name}
          maxLength={20}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nom"
          aria-label={`Nom du joueur ${COLOR_LABEL[seat.color]}`}
          className="w-full rounded-xl bg-black/25 px-3 py-2 text-sm font-medium outline-none ring-white/40 placeholder:text-white/40 focus:ring-2"
        />
      )}
      {seat.kind === 'bot' && (
        <div className="grid grid-cols-3 gap-1">
          {(['easy', 'medium', 'hard'] as BotLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onChange({ botLevel: level })}
              className={`chip-toggle px-0 py-1.5 text-[11px] ${
                seat.botLevel === level ? 'bg-white text-slate-900 shadow' : 'bg-black/25 text-white/80'
              }`}
            >
              {BOT_LEVEL_LABEL[level]}
            </button>
          ))}
        </div>
      )}
      {seat.kind === 'none' && <p className="py-2 text-center text-xs text-white/50">Place libre</p>}
    </div>
  );
}

const BOT_REACTION_DELAY_MS = 700;

function LocalGame({ setup, onQuit }: { setup: LocalSetup; onQuit: () => void }) {
  const { state, roll, move, abandon, restart, isBotTurn } = useLocalGame(setup);
  const [quitOpen, setQuitOpen] = useState(false);
  const seats = activeSeats(setup).map((s) => ({
    color: s.color,
    name: s.name,
    isBot: s.kind === 'bot',
    botLevel: s.botLevel,
    connected: true,
  }));
  const humansInGame = activeSeats(setup).filter((s) => s.kind === 'human' && !state.forfeited.includes(s.color));
  const humanColors = activeSeats(setup).filter((s) => s.kind === 'human').map((s) => s.color);
  const botColors = activeSeats(setup).filter((s) => s.kind === 'bot').map((s) => s.color);
  const reactions = useReactionBubbles(humanColors);
  const { show } = reactions;

  const key = eventKey(state);
  const botsKey = botColors.join();
  useEffect(() => {
    const message = botReaction(state, botsKey ? (botsKey.split(',') as Color[]) : []);
    if (!message) return;
    const timer = setTimeout(() => show(message), BOT_REACTION_DELAY_MS);
    return () => clearTimeout(timer);
    // Keyed on the event rather than the whole state, so bots react once per event.
  }, [key, botsKey, show]);

  // On a shared screen, reactions come from the player whose turn it is, or the first human.
  const current = state.players[state.current].color;
  const reactor = humanColors.includes(current) ? current : humansInGame[0]?.color;
  const onReact = reactor ? (reaction: string) => show({ color: reactor, reaction }) : undefined;

  const requestQuit = () => {
    if (state.phase === 'over' || humansInGame.length === 0) return onQuit();
    if (humansInGame.length === 1) {
      if (confirm('Quitter la partie ? Tu abandonnes et tu perds.')) onQuit();
      return;
    }
    setQuitOpen(true);
  };

  return (
    <>
    <GameView
      state={state}
      seats={seats}
      canAct={!isBotTurn && state.phase !== 'over'}
      onRoll={roll}
      onMove={move}
      title="LUDO"
      onQuit={requestQuit}
      rewardColors={humanColors}
      online={false}
      reactions={{ ...reactions, onReact }}
      overlayActions={
        <>
          <button type="button" onClick={restart} className="btn btn-primary">
            Rejouer
          </button>
          <button type="button" onClick={onQuit} className="btn btn-ghost">
            Changer les joueurs
          </button>
        </>
      }
    />
    <Sheet open={quitOpen} title="Qui quitte la partie ?" onClose={() => setQuitOpen(false)}>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-white/70">Le joueur qui quitte perd. Le dernier encore en jeu remporte la partie.</p>
        {humansInGame.map((s) => (
          <button
            key={s.color}
            type="button"
            className="btn btn-ghost justify-start"
            onClick={() => {
              abandon(s.color);
              setQuitOpen(false);
            }}
          >
            <Avatar color={s.color} seat={{ ...s, isBot: false, connected: true }} size={32} />
            {s.name} abandonne
          </button>
        ))}
        <button type="button" className="btn mt-2 bg-red-500/20 text-red-200" onClick={onQuit}>
          Arrêter la partie (sans vainqueur)
        </button>
      </div>
    </Sheet>
    </>
  );
}
