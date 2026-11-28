'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DUEL_FIRST_MOVE_MS, DUEL_INCREMENT_MS, DUEL_MINUTES, DUEL_REACTIONS, otherSide, type DuelGame, type DuelRoomViewOf, type RoomStake, type Side } from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { CoinAmount } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { InviteButtons } from '@/components/InviteButtons';
import { NameForm } from '@/components/NameForm';
import { Sheet } from '@/components/Sheet';
import { AdultRequiredBanner } from '@/components/AdultNotice';
import { StakePicker } from '@/components/StakePicker';
import { getStoredName, storeName } from '@/lib/socket';
import { refreshProfile, useProfile } from '@/lib/profile';
import { useDuelReactions, useDuelRoom, type DuelActions as Actions } from '@/lib/useDuelRoom';
import { useReactionBubbles } from '@/lib/reactions';
import { ReactionButton } from '@/components/ReactionPicker';
import { GameButton, ResultHeader, useTick } from './DuelFrame';
import { DUEL_UI, type DuelUi } from './duelGames';
import { tr } from '@/lib/i18n';

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 bg-[#0b141a] p-6 text-center text-[#e9edef]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">{children}</div>
    </main>
  );
}

/** Room of a two-player game reached by its code: lobby, then the online game. */
export function DuelRoomPage({ kind }: { kind: DuelGame }) {
  const ui = DUEL_UI[kind];
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const { session, ready } = useProfile();
  const [name, setName] = useState<string | null>(null);
  const [nameChecked, setNameChecked] = useState(false);
  const { room, otherKind, receivedAt, joinError, toast, connected, actions } = useDuelRoom(kind, code, name);

  useEffect(() => {
    if (!ready) return;
    setName(session?.username ?? (getStoredName() || null));
    setNameChecked(true);
  }, [ready, session]);

  useEffect(() => {
    if (otherKind) router.replace(`${DUEL_UI[otherKind].base}/salon/${code}`);
  }, [otherKind, code, router]);

  const quit = () => {
    actions.leave();
    router.push(room?.matched ? ui.base : `${ui.base}/salon`);
  };

  /** Goes to another screen without leaving: the floating shortcut brings the player back. */
  const stepOut = () => router.push(room?.matched ? ui.base : `${ui.base}/salon`);

  if (!nameChecked) return null;

  if (!name) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-[#0b141a] p-6 text-[#e9edef]">
        <div className="text-center">
          <span className="mx-auto grid w-fit place-items-center">{ui.logo(72)}</span>
          <h1 className="mt-3 text-2xl font-bold">{ui.challengeTitle}</h1>
          <p className="mt-1 text-white/60">
            {tr('Salon', 'Room')} <span className="font-mono font-bold tracking-widest text-white">{code}</span>
          </p>
        </div>
        <div className="rounded-3xl bg-[#1f2c33] p-4">
          <NameForm
            submitLabel={tr('Rejoindre la partie', 'Join the game')}
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
    const notFound = /introuvable|not found/i.test(joinError);
    return (
      <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
        <AppBar title={ui.roomTitle} backHref={`${ui.base}/salon`} backText={tr('Salons', 'Rooms')} backLabel={tr('Retour aux salons', 'Back to rooms')} />
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-12 text-center">
          <span className="grid size-24 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
            {notFound ? <Icon.Search size={46} /> : <Icon.Block size={46} />}
          </span>
          <h1 className="mt-5 text-[22px] font-semibold">{notFound ? tr('Salon introuvable', 'Room not found') : tr('Impossible de rejoindre', 'Could not join')}</h1>
          <p className="mt-1.5 max-w-xs text-[14.5px] text-[#8696a0]">{notFound ? tr(`Aucun salon ouvert avec le code ${code}.`, `No open room with code ${code}.`) : joinError}</p>
          <div className="mt-8 flex w-full flex-col gap-2">
            <Link href={`${ui.base}/salon`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]">
              <Icon.Login size={20} />
              {tr('Entrer un autre code', 'Enter another code')}
            </Link>
            <Link href={`${ui.base}/rapide`} className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884]">
              <Icon.Bolt size={20} />
              {tr('Partie rapide', 'Quick match')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!room || otherKind) {
    return (
      <Centered>
        <span className="mx-auto size-12 animate-spin rounded-full border-4 border-[#00a884]/20 border-t-[#00a884]" />
        <p className="text-[18px] font-medium">{connected ? tr('Connexion au salon', 'Joining the room') : tr('Serveur de jeu injoignable', 'Game server unreachable')}</p>
      </Centered>
    );
  }

  return (
    <>
      {toast && (
        <div className="pop-in fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-2xl bg-[#f15c6d] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
      {room.game ? (
        <OnlineGame room={room} receivedAt={receivedAt} actions={actions} onQuit={quit} onStepOut={stepOut} />
      ) : (
        <Lobby room={room} actions={actions} onQuit={quit} />
      )}
    </>
  );
}

function StakeLine({ stake }: { stake: RoomStake }) {
  const premium = stake.currency === 'premium';
  return (
    <span className="flex items-center justify-center gap-3 text-[13.5px]">
      <span className="flex items-center gap-1.5">
        {tr('Cagnotte', 'Pot')} <CoinAmount value={stake.pot} premium={premium} size={15} />
      </span>
      <span className="text-white/30">·</span>
      <span className="flex items-center gap-1.5">
        {tr('Gain', 'Prize')} <CoinAmount value={stake.prize} premium={premium} size={15} className="text-[#25d366]" />
      </span>
    </span>
  );
}

function Lobby({ room, actions, onQuit }: { room: DuelRoomViewOf<DuelGame>; actions: Actions; onQuit: () => void }) {
  const ui = DUEL_UI[room.kind];
  const ready = room.players.length === 2;
  const issues = room.players.filter((p) => p.stakeIssue);
  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={ui.roomTitle} subtitle={room.isHost ? tr('Tu es l’hôte', 'You’re the host') : tr('En attente du lancement', 'Waiting for the start')}
        backHref={`${ui.base}/salon`}
        backText={tr('Salons', 'Rooms')}
        backLabel={tr('Retour aux salons', 'Back to rooms')}
      />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-36">
        <section className="rounded-[28px] bg-[#1f2c33] p-4 text-center">
          <p className="text-[13px] text-[#8696a0]">{tr('Code du salon', 'Room code')}</p>
          <p className="mt-1 font-mono text-[40px] leading-none font-bold tracking-[0.2em]">{room.code}</p>
          <div className="mt-4">
            <InviteButtons code={room.code} path={`${ui.base}/salon/${room.code}`} game={ui.inviteGame} />
          </div>
        </section>

        <section className="rounded-[28px] bg-[#1f2c33] p-2">
          <h2 className="px-3 pt-2 pb-1 text-[13px] font-medium text-[#00a884]">Joueurs</h2>
          <ul>
            {[0, 1].map((i) => {
              const p = room.players[i];
              return (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={`grid size-11 place-items-center rounded-full ${p ? 'bg-gradient-to-br from-amber-600 to-orange-800 text-[18px] font-semibold' : 'border-2 border-dashed border-[#2a3942] text-[#8696a0]'}`}>
                    {p ? p.name[0]?.toUpperCase() : <Icon.PersonAdd size={22} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15.5px] font-medium">
                      <span className="truncate">{p ? p.name : tr('En attente d’un adversaire…', 'Waiting for an opponent…')}</span>
                      {p && room.you === i && <span className="rounded-full bg-[#00a884]/15 px-1.5 text-[11px] text-[#00a884]">{tr('Toi', 'You')}</span>}
                    </span>
                    <span className="block text-[12.5px] text-[#8696a0]">
                      {!p
                        ? tr('Partage le code ou le lien', 'Share the code or the link')
                        : p.stakeIssue === 'guest'
                          ? tr('Doit se connecter pour miser', 'Must sign in to stake')
                          : p.stakeIssue === 'funds'
                            ? tr('Solde insuffisant pour la mise', 'Not enough coins for the stake')
                            : p.isHost
                              ? tr('Hôte', 'Host')
                              : p.connected
                                ? tr('Prêt', 'Ready')
                                : tr('Déconnecté', 'Disconnected')}
                    </span>
                  </span>
                  {p?.isHost && <Icon.Star size={20} className="text-amber-300" />}
                </li>
              );
            })}
          </ul>
          {room.spectators > 0 && (
            <p className="flex items-center gap-2 px-3 pb-2 text-[13px] text-[#8696a0]">
              <Icon.Eye size={16} />
              {tr(`${room.spectators} spectateur${room.spectators > 1 ? 's' : ''}`, `${room.spectators} spectator${room.spectators > 1 ? 's' : ''}`)}
            </p>
          )}
        </section>

        {room.isHost ? (
          <section className="rounded-[28px] bg-[#1f2c33] p-4">
            <p className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">{tr('Type de partie', 'Game type')}</p>
            <StakePicker value={room.wager} onChange={actions.setWager} players={2} />
          </section>
        ) : room.wager ? (
          <p className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-[13.5px] text-amber-200">
            <Icon.Info size={20} className="shrink-0" />
            {tr('Partie avec mise : ta mise sera prise au lancement par l’hôte.', 'Staked game: your stake is taken when the host starts the game.')}
          </p>
        ) : null}
        {!room.isHost && room.wager?.startsWith('premium-') && <AdultRequiredBanner />}

        <section className="rounded-[28px] bg-[#1f2c33] p-4">
          <p className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">{tr('Temps de jeu par joueur', 'Thinking time per player')}</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={tr('Temps de jeu par joueur', 'Thinking time per player')}>
            {DUEL_MINUTES.map((m) => {
              const on = room.minutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!room.isHost}
                  onClick={() => actions.setMinutes(m)}
                  className={`h-11 rounded-2xl text-[15px] font-semibold transition active:scale-95 ${
                    on ? 'bg-[#00a884] text-[#0b141a]' : room.isHost ? 'bg-[#0b141a] text-[#e9edef]' : 'bg-[#0b141a] text-[#8696a0] opacity-60'
                  }`}
                >
                  {m} min
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 px-1 text-[12.5px] leading-snug text-[#8696a0]">
            {tr(
              `+ ${DUEL_INCREMENT_MS / 1000} s à chaque coup joué. Si un joueur ne joue pas son premier coup en ${DUEL_FIRST_MOVE_MS / 1000} s, la partie est annulée et les mises rendues.`,
              `+ ${DUEL_INCREMENT_MS / 1000} s for every move played. If a player doesn’t make their first move within ${DUEL_FIRST_MOVE_MS / 1000} s, the game is cancelled and stakes returned.`,
            )}{' '}
            {!room.isHost && tr('L’hôte choisit le temps.', 'The host picks the time.')}
          </p>
        </section>

        <p className="flex items-start gap-3 px-2 text-[13px] text-[#8696a0]">
          <Icon.Timer size={18} className="mt-px shrink-0" />
          {ui.sidesText}
        </p>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {room.isHost ? (
            <button
              type="button"
              onClick={actions.start}
              disabled={!ready || issues.length > 0}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[16px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:bg-[#2a3942] disabled:text-[#8696a0]"
            >
              <Icon.Play size={24} />
              {ready
                ? room.wager
                  ? tr('Lancer et prendre les mises', 'Start and take the stakes')
                  : tr('Lancer la partie', 'Start the game')
                : tr('En attente d’un adversaire', 'Waiting for an opponent')}
            </button>
          ) : (
            <p className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#1f2c33] text-[15px] text-[#aebac1]">
              <span className="size-4 animate-spin rounded-full border-2 border-[#00a884]/30 border-t-[#00a884]" />
              {tr('L’hôte va lancer la partie', 'The host will start the game')}
            </p>
          )}
          <button type="button" onClick={onQuit} className="h-11 text-[14px] font-medium text-[#8696a0]">
            {tr('Quitter le salon', 'Leave the room')}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineGame({
  room,
  receivedAt,
  actions,
  onQuit,
  onStepOut,
}: {
  room: DuelRoomViewOf<DuelGame>;
  receivedAt: number;
  actions: Actions;
  onQuit: () => void;
  onStepOut: () => void;
}) {
  const ui = DUEL_UI[room.kind] as unknown as DuelUi;
  const View = ui.View;
  const game = room.game!;
  const playing = game.status === 'playing';
  const now = useTick(playing && !!room.clock);
  const [confirm, setConfirm] = useState<'quit' | 'resign' | null>(null);
  const you = room.yourSide;
  const bottomSide: Side = you ?? 'white';
  const nameOf = (side: Side) => {
    const index = room.colors?.indexOf(side) ?? -1;
    return index >= 0 ? room.players[index]?.name ?? tr('Joueur parti', 'Player left') : tr('Joueur parti', 'Player left');
  };
  const seatOf = (side: Side) => room.players[room.colors?.indexOf(side) ?? -1];
  const clockOf = (side: Side) => {
    if (!room.clock) return null;
    const base = room.clock[side];
    return room.clock.running === side ? base - (now - receivedAt) : base;
  };
  const names = { white: nameOf('white'), black: nameOf('black') };
  const reactions = useReactionBubbles<Side>(you ? [you] : []);
  const { show } = reactions;
  useDuelReactions(useCallback((message) => show({ color: message.side, reaction: message.reaction }), [show]));
  const reactionButton = you && room.players.length === 2 && (
    <ReactionButton onReact={actions.react} hidden={reactions.hidden} onHiddenChange={reactions.setHidden} reactions={DUEL_REACTIONS} />
  );

  const payoutKey = room.stake
    ? `${game.id}:${room.stake.payout ? 'paid' : 'open'}`
    : game.status === 'over'
      ? `${game.id}:over`
      : null;
  useEffect(() => {
    if (payoutKey) void refreshProfile();
  }, [payoutKey]);

  const offerFromOpponent = !!you && room.drawOffer === otherSide(you);
  const youOffered = !!you && room.drawOffer === you;
  const rematchAsked = !!you && room.rematch.includes(you);
  const opponentAsked = !!you && room.rematch.includes(otherSide(you));
  const opponentGone = room.players.length < 2;

  const firstMoveLeft = room.firstMove ? Math.max(0, room.firstMove.endsIn - (now - receivedAt)) : null;
  const banner = room.firstMove && firstMoveLeft !== null && playing && !offerFromOpponent ? (
    <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-[13.5px] text-amber-100">
      <Icon.Timer size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">
        {room.firstMove.side === you
          ? tr('Joue ton premier coup, sinon la partie est annulée.', 'Play your first move, or the game is cancelled.')
          : tr(`${nameOf(room.firstMove.side)} doit jouer son premier coup, sinon la partie est annulée et remboursée.`, `${nameOf(room.firstMove.side)} must play their first move, or the game is cancelled and refunded.`)}
      </span>
      <span className="font-mono font-semibold tabular-nums">{Math.ceil(firstMoveLeft / 1000)} s</span>
    </div>
  ) : offerFromOpponent ? (
    <div className="pop-in flex items-center gap-2 rounded-2xl bg-[#53bdeb]/15 px-3 py-2">
      <Icon.Handshake size={20} className="shrink-0 text-[#53bdeb]" />
      <span className="min-w-0 flex-1 text-[13.5px]">{tr(`${nameOf(otherSide(you!))} propose la nulle.`, `${nameOf(otherSide(you!))} offers a draw.`)}</span>
      <button type="button" onClick={actions.declineDraw} className="h-8 rounded-full px-3 text-[13px] font-semibold text-[#aebac1]">
        {tr('Refuser', 'Decline')}
      </button>
      <button type="button" onClick={actions.draw} className="h-8 rounded-full bg-[#53bdeb] px-3 text-[13px] font-semibold text-[#0b141a]">
        {tr('Accepter', 'Accept')}
      </button>
    </div>
  ) : room.stake && playing ? (
    <div className="rounded-2xl bg-amber-500/10 px-3 py-2 text-amber-100">
      <StakeLine stake={room.stake} />
    </div>
  ) : !you && playing ? (
    <p className="flex items-center justify-center gap-2 text-[13px] text-[#8696a0]">
      <Icon.Eye size={16} />
      {tr('Tu regardes la partie', 'You’re watching the game')}
    </p>
  ) : null;

  const payout = room.stake?.payout;
  const premium = room.stake?.currency === 'premium';

  return (
    <>
      <View
        title={room.matched ? tr('Partie rapide', 'Quick match') : tr(`Salon ${room.code}`, `Room ${room.code}`)}
        subtitle={
          room.spectators
            ? tr(`${room.spectators} spectateur${room.spectators > 1 ? 's' : ''}`, `${room.spectators} spectator${room.spectators > 1 ? 's' : ''}`)
            : tr(`${ui.long} · ${room.minutes} min + ${DUEL_INCREMENT_MS / 1000} s`, `${ui.long} · ${room.minutes} min + ${DUEL_INCREMENT_MS / 1000} s`)
        }
        onBack={() => (playing && you ? setConfirm('quit') : onQuit())}
        backLabel={tr('Quitter la partie', 'Leave the game')}
        state={game}
        top={{ name: nameOf(otherSide(bottomSide)), side: otherSide(bottomSide), clockMs: clockOf(otherSide(bottomSide)), connected: seatOf(otherSide(bottomSide))?.connected ?? false, bubble: reactions.bubbles[otherSide(bottomSide)], bubbleAt: 'below' }}
        bottom={{ name: nameOf(bottomSide), side: bottomSide, clockMs: clockOf(bottomSide), connected: seatOf(bottomSide)?.connected ?? false, you: !!you, bubble: reactions.bubbles[bottomSide], bubbleAt: 'above' }}
        flipped={bottomSide === 'black'}
        interactive={playing && !!you && game.turn === you}
        onMove={actions.move}
        banner={banner}
        toolbar={
          playing && you ? (
            <>
              {reactionButton}
              <GameButton onClick={actions.draw} disabled={youOffered} icon={<Icon.Handshake size={18} />}>
                {youOffered ? tr('Nulle proposée', 'Draw offered') : offerFromOpponent ? tr('Accepter la nulle', 'Accept the draw') : tr('Proposer la nulle', 'Offer a draw')}
              </GameButton>
              <GameButton onClick={() => setConfirm('resign')} tone="danger" icon={<Icon.Flag size={18} />}>
                {tr('Abandonner', 'Resign')}
              </GameButton>
            </>
          ) : (
            reactionButton || undefined
          )
        }
        result={
          <>
            <ResultHeader winner={game.winner} viewer={you} names={names} explanation={ui.ending(game, names)} />
            {room.stake && (
              <div className="mt-4 rounded-2xl bg-[#0b141a]/60 px-4 py-3 text-center text-[14px]">
                {!payout ? (
                  tr('Règlement de la cagnotte…', 'Paying out the pot…')
                ) : payout.winner ? (
                  <span className="flex flex-wrap items-center justify-center gap-1.5">
                    {tr(`${payout.winner} remporte`, `${payout.winner} wins`)} <CoinAmount value={payout.amount} premium={premium} size={16} className="text-[#25d366]" />
                  </span>
                ) : (
                  tr('Partie nulle : chaque mise a été remboursée.', 'Draw: every stake was refunded.')
                )}
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {room.matched && room.stake ? (
                <Link
                  href={`${ui.base}/rapide?table=${room.stake.table}`}
                  onClick={() => actions.leave()}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]"
                >
                  <Icon.Refresh size={20} />
                  {tr('Rejouer à cette table', 'Play again at this table')}
                </Link>
              ) : you ? (
                <button
                  type="button"
                  onClick={actions.rematch}
                  disabled={rematchAsked || opponentGone}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:bg-[#2a3942] disabled:text-[#8696a0]"
                >
                  <Icon.Refresh size={20} />
                  {opponentGone
                    ? tr('Ton adversaire est parti', 'Your opponent has left')
                    : rematchAsked
                      ? tr('En attente de ton adversaire…', 'Waiting for your opponent…')
                      : opponentAsked
                        ? tr('Accepter la revanche', 'Accept the rematch')
                        : room.stake
                          ? tr(`Revanche · nouvelle mise de ${room.stake.stake}`, `Rematch · new stake of ${room.stake.stake}`)
                          : tr('Revanche', 'Rematch')}
                </button>
              ) : null}
              <button type="button" onClick={onQuit} className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold">
                <Icon.Close size={20} />
                {tr('Quitter', 'Leave')}
              </button>
            </div>
          </>
        }
      />
      <Sheet open={confirm !== null} title={confirm === 'resign' ? tr('Abandonner la partie ?', 'Resign the game?') : tr('Quitter la partie ?', 'Leave the game?')} onClose={() => setConfirm(null)}>
        <p className="text-[14px] text-[#aebac1]">
          {confirm === 'resign'
            ? tr('Ton adversaire remportera la partie.', 'Your opponent will win the game.')
            : tr('Quitter maintenant compte comme un abandon : ton adversaire gagne.', 'Leaving now counts as resigning: your opponent wins.')}
          {room.stake && tr(' Ta mise sera perdue.', ' Your stake will be lost.')}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 pb-1">
          <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-full border border-[#2a3942] text-[15px] font-semibold">
            {tr('Continuer', 'Keep playing')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(null);
              if (confirm === 'resign') actions.resign();
              else onQuit();
            }}
            className="h-12 rounded-full bg-[#f15c6d] text-[15px] font-semibold text-white"
          >
            {confirm === 'resign' ? tr('Abandonner', 'Resign') : tr('Quitter', 'Leave')}
          </button>
        </div>
        {confirm === 'quit' && (
          <div className="pb-1">
            <button type="button" onClick={onStepOut} className="mt-2 h-12 w-full rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884]">
              {tr('Sortir un moment', 'Step out for a moment')}
            </button>
            <p className="mt-1.5 text-center text-[12.5px] text-[#8696a0]">
              {tr('La partie continue et ta pendule tourne pendant ton tour.', 'The game goes on and your clock runs during your turn.')}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
