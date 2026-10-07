'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TEAMMATE, areDiagonal, type BotLevel, type Color, type PublicSeat, type RoomView } from '@ludo/engine';
import { AppearanceCard } from '@/components/AppearancePicker';
import { GameView } from '@/components/GameView';
import { InviteButtons } from '@/components/InviteButtons';
import { NameForm } from '@/components/NameForm';
import { Avatar } from '@/components/PlayerPanel';
import { RulesCard } from '@/components/RulesCard';
import { COLOR_DARK, COLOR_HEX } from '@/lib/board';
import { BOT_LEVEL_LABEL, COLOR_LABEL } from '@/lib/labels';
import { getStoredName, storeName } from '@/lib/socket';
import { useProfile } from '@/lib/profile';
import { useReactionBubbles } from '@/lib/reactions';
import { useOnlineRoom, useRoomReactions } from '@/lib/useOnlineRoom';

type Actions = ReturnType<typeof useOnlineRoom>['actions'];

const CORNER_ORDER: Color[] = ['red', 'green', 'blue', 'yellow'];

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">{children}</main>;
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [nameChecked, setNameChecked] = useState(false);
  const { session, ready } = useProfile();
  const { room, joinError, toast, connected, actions } = useOnlineRoom(code, name);

  useEffect(() => {
    if (!ready) return;
    setName(session?.username ?? (getStoredName() || null));
    setNameChecked(true);
  }, [ready, session]);

  const quit = () => {
    actions.leave();
    router.push('/online');
  };

  if (!nameChecked) return null;

  if (!name) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <div className="text-5xl">🎲</div>
          <h1 className="mt-3 text-2xl font-bold">On t’invite à jouer !</h1>
          <p className="mt-1 text-white/60">
            Salon <span className="font-mono font-bold tracking-widest text-white">{code}</span>
          </p>
        </div>
        <div className="card p-4">
          <NameForm
            submitLabel="Rejoindre la partie"
            onSubmit={(n) => {
              storeName(n);
              setName(n);
            }}
          />
        </div>
      </main>
    );
  }

  if (joinError) {
    return (
      <CenteredMessage>
        <div className="text-5xl">🔍</div>
        <p className="text-lg font-semibold">{joinError}</p>
        <Link href="/online" className="btn btn-light">
          Retour
        </Link>
      </CenteredMessage>
    );
  }

  if (!room) {
    return (
      <CenteredMessage>
        <div className="mx-auto size-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="text-white/70">{connected ? 'Connexion au salon…' : 'Serveur de jeu injoignable, nouvelle tentative…'}</p>
      </CenteredMessage>
    );
  }

  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-400 py-1.5 text-center text-sm font-semibold text-slate-900">
          Connexion perdue, reconnexion…
        </div>
      )}
      {toast && (
        <div className="pop-in fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-2xl bg-red-500 px-4 py-2.5 text-center text-sm font-semibold shadow-xl">
          {toast}
        </div>
      )}
      {room.game ? <OnlineGame room={room} actions={actions} onQuit={quit} /> : <Lobby room={room} actions={actions} onQuit={quit} />}
    </>
  );
}

function OnlineGame({ room, actions, onQuit }: { room: RoomView; actions: Actions; onQuit: () => void }) {
  const game = room.game!;
  const current = game.players[game.current];
  const seats = room.seats
    .filter((s) => s.kind !== 'empty')
    .map((s) => ({
      color: s.color,
      name: s.name,
      isBot: s.kind === 'bot',
      botLevel: s.botLevel,
      connected: s.connected,
      isYou: s.color === room.you,
    }));
  const youForfeited = !!room.you && game.forfeited.includes(room.you);
  const stillPlaying =
    !!room.you && game.phase !== 'over' && !youForfeited && game.players.some((p) => p.color === room.you);
  const reactions = useReactionBubbles(room.you ? [room.you] : []);
  useRoomReactions(reactions.show);

  return (
    <GameView
      state={game}
      reactions={{ ...reactions, onReact: room.you ? actions.react : undefined }}
      seats={seats}
      canAct={game.phase !== 'over' && current.color === room.you}
      onRoll={actions.roll}
      onMove={actions.move}
      title={room.code}
      onQuit={() =>
        confirm(stillPlaying ? 'Quitter la partie ? Tu abandonnes et tu perds.' : 'Quitter le salon ?') && onQuit()
      }
      rewardColors={room.you && !youForfeited ? [room.you] : []}
      online
      serverSummary={room.result}
      notice={youForfeited && game.phase !== 'over' ? 'Tu as quitté la partie : tu as perdu. Tu peux regarder la fin.' : undefined}
      overlayActions={<RematchActions room={room} actions={actions} />}
    />
  );
}

/** End-of-game buttons: everyone can vote for a rematch; the host can also go back to the lobby. */
function RematchActions({ room, actions }: { room: RoomView; actions: Actions }) {
  const humans = room.seats.filter((s) => s.kind === 'human');
  const waitingFor = humans.filter((s) => s.connected && !room.rematch.includes(s.color));
  const voted = !!room.you && room.rematch.includes(room.you);
  const seated = !!room.you && humans.some((s) => s.color === room.you);
  const opponentsLeft = room.seats.filter((s) => s.kind !== 'empty').length < 2;

  return (
    <>
      {seated && !opponentsLeft && (
        <button type="button" onClick={actions.rematch} disabled={voted} className="btn btn-primary">
          {voted ? `En attente : ${waitingFor.map((s) => s.name).join(', ')}…` : '🔁 Revanche !'}
        </button>
      )}
      {room.rematch.length > 0 && !voted && seated && (
        <p className="text-sm text-amber-200">
          {room.seats
            .filter((s) => room.rematch.includes(s.color))
            .map((s) => s.name)
            .join(', ')}{' '}
          veut une revanche !
        </p>
      )}
      {opponentsLeft && <p className="text-sm text-white/60">Tes adversaires sont partis.</p>}
      {room.isHost ? (
        <button type="button" onClick={actions.backToLobby} className="btn btn-ghost">
          Retour au salon
        </button>
      ) : (
        !seated && <p className="text-sm text-white/60">En attente des joueurs…</p>
      )}
    </>
  );
}

function Lobby({ room, actions, onQuit }: { room: RoomView; actions: Actions; onQuit: () => void }) {
  const filledSeats = room.seats.filter((s) => s.kind !== 'empty');
  const filled = filledSeats.length;
  let duelNote: string | null = null;
  if (filled === 2 && !areDiagonal(filledSeats[0].color, filledSeats[1].color)) {
    const [keep, move] = filledSeats[1].isHost ? [filledSeats[1], filledSeats[0]] : filledSeats;
    duelNote = `À deux, les camps sont en diagonale : ${move.name} jouera ${COLOR_LABEL[TEAMMATE[keep.color]]}.`;
  }
  const startError =
    filled < 2 ? 'Il faut au moins 2 joueurs.' : room.rules.teams && filled !== 4 ? 'Le mode équipes nécessite 4 joueurs.' : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
      <header className="flex items-center gap-3">
        <button type="button" onClick={onQuit} className="icon-btn" aria-label="Quitter le salon">
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold leading-tight">Salon privé</h1>
          <p className="text-sm text-white/60">
            {filled}/4 places occupées{room.spectators.length > 0 && ` · ${room.spectators.length} spectateur(s)`}
          </p>
        </div>
      </header>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Code du salon</span>
          <span className="text-xs text-white/50">Invite tes amis 👇</span>
        </div>
        <div className="text-center font-mono text-4xl font-bold tracking-[0.25em]">{room.code}</div>
        <InviteButtons code={room.code} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        {CORNER_ORDER.map((color) => (
          <LobbySeat key={color} seat={room.seats.find((s) => s.color === color)!} room={room} actions={actions} />
        ))}
      </section>

      {room.spectators.length > 0 && (
        <p className="text-center text-xs text-white/50">👀 {room.spectators.join(', ')}</p>
      )}

      <AppearanceCard note="Ton choix, visible seulement sur ton appareil." />

      <RulesCard rules={room.rules} onChange={actions.setRules} readOnly={!room.isHost} />

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#0f1029] via-[#0f1029]/90 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          {room.isHost ? (
            <>
              {startError && <p className="mb-2 text-center text-sm font-medium text-amber-300">{startError}</p>}
              {!startError && duelNote && <p className="mb-2 text-center text-sm text-white/70">⚔️ {duelNote}</p>}
              <button type="button" disabled={!!startError} onClick={actions.start} className="btn btn-primary w-full py-4 text-lg">
                Lancer la partie 🎲
              </button>
            </>
          ) : (
            <div className="card flex items-center justify-center gap-3 py-4 text-white/80">
              <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              En attente de l’hôte…
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function LobbySeat({ seat, room, actions }: { seat: PublicSeat; room: RoomView; actions: Actions }) {
  const empty = seat.kind === 'empty';
  const isYou = seat.color === room.you;

  return (
    <div
      className="flex min-h-32 flex-col gap-2 rounded-3xl p-3 transition"
      style={{
        background: empty
          ? 'rgba(255,255,255,0.04)'
          : `linear-gradient(160deg, ${COLOR_HEX[seat.color]}55, ${COLOR_DARK[seat.color]}33)`,
        border: `1.5px ${empty ? 'dashed' : 'solid'} ${empty ? 'rgba(255,255,255,0.15)' : COLOR_HEX[seat.color]}`,
      }}
    >
      {empty ? (
        <>
          <div className="flex items-center gap-2 text-white/60">
            <span className="size-8 rounded-full border-2 border-dashed" style={{ borderColor: COLOR_HEX[seat.color] }} />
            <span className="font-semibold">{COLOR_LABEL[seat.color]}</span>
          </div>
          <div className="mt-auto flex flex-col gap-1.5">
            <button type="button" onClick={() => actions.takeSeat(seat.color)} className="btn btn-ghost px-2 py-2 text-sm">
              M’asseoir ici
            </button>
            {room.isHost && <BotPicker onPick={(level) => actions.setSeat(seat.color, 'bot', level)} />}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Avatar color={seat.color} seat={{ ...seat, isBot: seat.kind === 'bot' }} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{seat.name}</div>
              <div className="truncate text-xs text-white/60">
                {seat.kind === 'bot'
                  ? `Niveau ${BOT_LEVEL_LABEL[seat.botLevel ?? 'medium'].toLowerCase()}`
                  : !seat.connected
                    ? 'Déconnecté'
                    : isYou
                      ? 'Toi'
                      : 'Prêt'}
              </div>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-1">
            {seat.isHost && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">★ Hôte</span>}
            {isYou && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">Toi</span>}
          </div>
          {room.isHost && !isYou && (
            <button type="button" onClick={() => actions.setSeat(seat.color, 'empty')} className="btn btn-ghost px-2 py-1.5 text-xs">
              Retirer
            </button>
          )}
        </>
      )}
    </div>
  );
}

function BotPicker({ onPick }: { onPick: (level: BotLevel) => void }) {
  return (
    <select
      aria-label="Ajouter un ordinateur"
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value as BotLevel)}
      className="w-full appearance-none rounded-2xl bg-black/25 px-2 py-2 text-center text-sm font-semibold"
    >
      <option value="" disabled>
        🤖 Ajouter un ordi
      </option>
      {(['easy', 'medium', 'hard'] as BotLevel[]).map((level) => (
        <option key={level} value={level} className="text-slate-900">
          {BOT_LEVEL_LABEL[level]}
        </option>
      ))}
    </select>
  );
}
