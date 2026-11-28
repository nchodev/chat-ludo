'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  MAX_TIMEOUTS,
  TEAMMATE,
  areDiagonal,
  potSplit,
  stakeTable,
  type BotLevel,
  type Color,
  type Currency,
  type PublicSeat,
  type RoomStake,
  type RoomView,
} from '@ludo/engine';
import { AdultRequiredBanner, useAdultGate } from '@/components/AdultNotice';
import { AppBar } from '@/components/AppBar';
import { AppearancePicker } from '@/components/AppearancePicker';
import { CoinAmount, CoinIcon, GemIcon } from '@/components/Coins';
import { BackButton } from '@/components/BackButton';
import { ColorPreference } from '@/components/ColorPreference';
import { CustomStake } from '@/components/CustomStake';
import { GameView } from '@/components/GameView';
import { InviteButtons } from '@/components/InviteButtons';
import { NameForm } from '@/components/NameForm';
import { Avatar } from '@/components/PlayerPanel';
import { Icon } from '@/components/Icons';
import { BOT_LEVEL_HINT, IconButton, ListRow, PRESET_ICON, RulesEditor, SectionTitle } from '@/components/MobileList';
import { Sheet } from '@/components/Sheet';
import { COLOR_HEX } from '@/lib/board';
import { useAppearance } from '@/lib/appearance';
import { BOT_LEVEL_LABEL, COLOR_LABEL, matchPreset, rulesSummary } from '@/lib/labels';
import { getStoredName, storeName } from '@/lib/socket';
import { FairDiceCheck } from '@/components/FairDiceCheck';
import { refreshProfile, useProfile } from '@/lib/profile';
import { boardTurn, campShownAs, shownColor, usePreferredColor, viewShift } from '@/lib/perspective';
import { useStakeConfig } from '@/lib/stakes';
import { useReactionBubbles } from '@/lib/reactions';
import { useOnlineRoom, useRoomReactions } from '@/lib/useOnlineRoom';
import { tr, useLang } from '@/lib/i18n';

type Actions = ReturnType<typeof useOnlineRoom>['actions'];

const CORNER_ORDER: Color[] = ['red', 'green', 'blue', 'yellow'];

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 bg-[#0b141a] p-6 text-center text-[#e9edef]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">{children}</div>
    </main>
  );
}

const NOT_FOUND_REASONS = [
  { icon: Icon.Edit, text: ['Une lettre ou un chiffre du code est erroné', 'A letter or digit of the code is wrong'] },
  { icon: Icon.Close, text: ['Tout le monde a quitté le salon, il a été fermé', 'Everyone left the room, so it was closed'] },
  { icon: Icon.Refresh, text: ['Le serveur de jeu a redémarré depuis l’invitation', 'The game server restarted since the invitation'] },
];

function JoinErrorScreen({ code, error }: { code: string; error: string }) {
  const { t } = useLang();
  const notFound = /introuvable|not found/i.test(error);
  const started = /commencé|already started/i.test(error);
  const title = notFound ? t('Salon introuvable', 'Room not found') : started ? t('Partie déjà en cours', 'Game already in progress') : t('Impossible de rejoindre', 'Could not join');
  const text = notFound ? t('Ce code ne correspond à aucun salon ouvert.', 'This code doesn’t match any open room.') : error;

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={t('Rejoindre un salon', 'Join a room')} backHref="/online" backText={t('Salons', 'Rooms')} backLabel={t('Retour aux salons', 'Back to rooms')} />

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-10 pb-44 text-center">
        <div className="relative">
          <span className="grid size-28 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0] ring-1 ring-white/5">
            {notFound ? <Icon.Search size={52} /> : started ? <Icon.Hourglass size={48} /> : <Icon.Block size={50} />}
          </span>
          <span className="absolute -right-1 -bottom-1 grid size-10 place-items-center rounded-full bg-[#f15c6d] text-white ring-4 ring-[#0b141a]">
            {notFound ? <Icon.Close size={22} /> : <Icon.Info size={22} />}
          </span>
        </div>

        <h1 className="mt-6 text-[22px] font-semibold">{title}</h1>
        <p className="mt-1.5 max-w-xs text-[14.5px] leading-relaxed text-[#8696a0]">{text}</p>

        <div className="mt-5 flex gap-1.5" aria-label={`Code ${code}`}>
          {code.split('').map((char, i) => (
            <span
              key={i}
              className="grid h-12 w-10 place-items-center rounded-xl border-2 border-[#f15c6d]/40 bg-[#1f2c33] font-mono text-[22px] font-bold"
            >
              {char}
            </span>
          ))}
        </div>

        {notFound && (
          <section className="mt-8 w-full text-left">
            <h2 className="px-1 pb-2 text-[13px] font-medium tracking-wide text-[#00a884]">{t('Causes possibles', 'Possible reasons')}</h2>
            <ul className="overflow-hidden rounded-[24px] bg-[#1f2c33]">
              {NOT_FOUND_REASONS.map(({ icon: ReasonIcon, text: [fr, en] }, i) => (
                <li key={fr} className="flex items-center gap-4 px-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[#aebac1]">
                    <ReasonIcon size={18} />
                  </span>
                  <span className={`flex-1 py-3.5 text-[14px] text-[#d1d7db] ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>{t(fr, en)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <Link
            href="/online"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98]"
          >
            <Icon.Login size={20} />
            {t('Entrer un autre code', 'Enter another code')}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[14.5px] font-semibold text-[#00a884] transition active:bg-white/5"
            >
              <Icon.Refresh size={20} />
              {t('Réessayer', 'Try again')}
            </button>
            <Link
              href="/rapide"
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[14.5px] font-semibold text-[#00a884] transition active:bg-white/5"
            >
              <Icon.Bolt size={20} />
              {t('Partie rapide', 'Quick match')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [nameChecked, setNameChecked] = useState(false);
  const { session, ready } = useProfile();
  const { room, joinError, toast, connected, actions } = useOnlineRoom(code, name);
  const { t } = useLang();

  useEffect(() => {
    if (!ready) return;
    setName(session?.username ?? (getStoredName() || null));
    setNameChecked(true);
  }, [ready, session]);

  const quit = () => {
    actions.leave();
    router.push(room?.shared ? '/local' : room?.matched ? '/ludo' : '/online');
  };

  /** Goes to another screen without leaving: the floating shortcut brings the player back. */
  const stepOut = () => router.push(room?.matched ? '/ludo' : '/online');

  if (!nameChecked) return null;

  if (!name) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
            <Icon.Dice size={34} />
          </span>
          <h1 className="mt-3 text-2xl font-bold">{t('On t’invite à jouer !', 'You’re invited to play!')}</h1>
          <p className="mt-1 text-white/60">
            {t('Salon', 'Room')} <span className="font-mono font-bold tracking-widest text-white">{code}</span>
          </p>
        </div>
        <div className="card p-4">
          <NameForm
            submitLabel={t('Rejoindre la partie', 'Join the game')}
            onSubmit={(n) => {
              storeName(n);
              setName(n);
            }}
          />
        </div>
      </main>
    );
  }

  if (joinError) return <JoinErrorScreen code={code} error={joinError} />;

  if (!room) {
    return (
      <CenteredMessage>
        <span className="mx-auto size-12 animate-spin rounded-full border-4 border-[#00a884]/20 border-t-[#00a884]" />
        <p className="text-[18px] font-medium">{connected ? t('Connexion au salon', 'Joining the room') : t('Serveur de jeu injoignable', 'Game server unreachable')}</p>
        <p className="-mt-2 text-[14px] text-[#8696a0]">
          {connected ? (
            <>
              {t('Salon', 'Room')} <span className="font-mono font-semibold tracking-widest text-[#e9edef]">{code}</span>
            </>
          ) : (
            t('Nouvelle tentative en cours…', 'Trying again…')
          )}
        </p>
      </CenteredMessage>
    );
  }

  return (
    <>
      {toast && (
        <div className="pop-in fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-2xl bg-red-500 px-4 py-2.5 text-center text-sm font-semibold shadow-xl">
          {toast}
        </div>
      )}
      {room.game ? (
        <OnlineGame room={room} actions={actions} onQuit={quit} onStepOut={stepOut} />
      ) : (
        <Lobby room={room} actions={actions} onQuit={quit} onStepOut={stepOut} />
      )}
    </>
  );
}

function OnlineGame({ room, actions, onQuit, onStepOut }: { room: RoomView; actions: Actions; onQuit: () => void; onStepOut: () => void }) {
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
  const [quitOpen, setQuitOpen] = useState(false);
  const { t } = useLang();
  const reactions = useReactionBubbles(room.you ? [room.you] : []);
  useRoomReactions(reactions.show);
  const payoutKey = room.stake ? `${game.id}:${room.stake.payout ? 'paid' : 'open'}` : null;
  useEffect(() => {
    if (payoutKey) void refreshProfile();
  }, [payoutKey]);
  const timedOut = !!room.you && (room.timeouts[room.you] ?? 0) >= MAX_TIMEOUTS;
  // The server sends the time left; anchor it to this device's clock when the update arrives.
  const turnTimer = useMemo(
    () => (room.turnTimer ? { endsAt: Date.now() + room.turnTimer.endsIn, duration: room.turnTimer.duration } : null),
    [room],
  );

  const running = game.phase !== 'over';
  const requestQuit = () => {
    if (running && (room.shared || stillPlaying)) setQuitOpen(true);
    else onQuit();
  };

  return (
    <>
    <GameView
      state={game}
      reactions={{ ...reactions, onReact: room.you ? actions.react : undefined }}
      seats={seats}
      canAct={game.phase !== 'over' && (room.shared ? seats.some((s) => s.color === current.color) : current.color === room.you)}
      onRoll={actions.roll}
      onMove={actions.move}
      title={room.shared ? 'LUDO' : room.code}
      onQuit={requestQuit}
      onResign={running && stillPlaying && !room.shared ? () => setQuitOpen(true) : undefined}
      rewardColors={room.shared ? [] : room.you && !youForfeited ? [room.you] : []}
      online
      serverSummary={room.result}
      notice={
        youForfeited && game.phase !== 'over' ? (
          timedOut ? (
            t(`${MAX_TIMEOUTS} tours manqués de suite : tu as perdu. Tu peux regarder la fin.`, `${MAX_TIMEOUTS} missed turns in a row: you lost. You can watch the end.`)
          ) : (
            t('Tu as quitté la partie : tu as perdu. Tu peux regarder la fin.', 'You left the game: you lost. You can watch the end.')
          )
        ) : room.stake && game.phase !== 'over' ? (
          <span className="flex items-center justify-center gap-3">
            <span className="flex items-center gap-1.5">
              {t('Cagnotte', 'Pot')} <CoinAmount value={room.stake.pot} premium={room.stake.currency === 'premium'} size={16} />
            </span>
            <span className="text-white/40">·</span>
            <span className="flex items-center gap-1.5">
              {t('Gain', 'Prize')} <CoinAmount value={room.stake.prize} premium={room.stake.currency === 'premium'} size={16} className="text-[#25d366]" />
            </span>
          </span>
        ) : undefined
      }
      turnTimer={turnTimer}
      timeouts={room.timeouts}
      autoplay={room.autoplay}
      you={room.shared ? null : room.you}
      overlayFooter={room.fair?.seed ? <FairDiceCheck fair={room.fair} /> : undefined}
      overlayActions={
        room.stake ? (
          <StakeResult room={room} stake={room.stake}>
            {room.shared ? (
              <>
                <button type="button" onClick={actions.rematch} className="btn btn-primary">
                  {t(`Rejouer · nouvelle mise de ${room.stake.stake}`, `Play again · new stake of ${room.stake.stake}`)}
                </button>
                <button type="button" onClick={onQuit} className="btn btn-ghost">
                  {t('Changer les joueurs', 'Change players')}
                </button>
              </>
            ) : room.matched ? (
              <>
                <Link href={`/rapide?table=${room.stake.table}`} className="btn btn-primary">
                  {t('Rejouer à cette table', 'Play again at this table')}
                </Link>
                <Link href="/rapide" className="btn btn-ghost">
                  {t('Changer de table', 'Change table')}
                </Link>
              </>
            ) : (
              <RematchActions room={room} actions={actions} />
            )}
          </StakeResult>
        ) : (
          <RematchActions room={room} actions={actions} />
        )
      }
    />
    <QuitWarning
      open={quitOpen}
      room={room}
      onStay={() => setQuitOpen(false)}
      onStepOut={onStepOut}
      onQuit={() => {
        setQuitOpen(false);
        onQuit();
      }}
    />
    </>
  );
}

/** Before quitting a running game: on a shared phone everyone's stake is lost, otherwise only yours. */
function QuitWarning({
  open,
  room,
  onStay,
  onStepOut,
  onQuit,
}: {
  open: boolean;
  room: RoomView;
  onStay: () => void;
  onStepOut: () => void;
  onQuit: () => void;
}) {
  const stake = room.stake;
  const premium = stake?.currency === 'premium';
  const amount = (value: number) => <CoinAmount value={value} premium={premium} size={15} className="font-semibold text-[#e9edef]" />;
  const players = stake ? Math.round(stake.pot / stake.stake) : 0;
  const { t } = useLang();

  const title = room.shared
    ? t('Tout le monde perd sa mise', 'Everyone loses their stake')
    : stake
      ? t('Tu perds la partie et ta mise', 'You lose the game and your stake')
      : t('Tu perds la partie', 'You lose the game');
  const body = room.shared ? (
    t(
      <>
        Cette partie se joue sur ce téléphone. Si tu quittes maintenant, elle s’arrête : les {players} joueurs perdent leur mise
        {stake && <> de {amount(stake.stake)}</>} et personne ne gagne la cagnotte{stake && <> de {amount(stake.pot)}</>}.
      </>,
      <>
        This game is played on this phone. If you leave now, it stops: the {players} players lose their stake
        {stake && <> of {amount(stake.stake)}</>} and nobody wins the pot{stake && <> of {amount(stake.pot)}</>}.
      </>,
    )
  ) : stake ? (
    t(
      <>
        Si tu quittes, tu abandonnes : ta mise de {amount(stake.stake)} est perdue et les autres joueurs continuent pour la cagnotte.
      </>,
      <>If you leave, you forfeit: your stake of {amount(stake.stake)} is lost and the other players carry on for the pot.</>,
    )
  ) : (
    t(<>Si tu quittes, tu abandonnes et les autres joueurs continuent sans toi.</>, <>If you leave, you forfeit and the other players carry on without you.</>)
  );

  return (
    <Sheet open={open} title={t('Quitter la partie ?', 'Leave the game?')} onClose={onStay}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl bg-[#f15c6d]/10 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f15c6d]/20 text-[#f15c6d]">
            <Icon.Info size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#f15c6d]">{title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-[#d1d7db]">{body}</p>
          </div>
        </div>
        <button type="button" onClick={onStay} className="btn btn-primary">
          {t('Continuer la partie', 'Keep playing')}
        </button>
        {/* On a shared phone every seat would miss its turns, so there is no stepping out. */}
        {!room.shared && (
          <div>
            <button type="button" onClick={onStepOut} className="btn btn-ghost w-full">
              {t('Sortir un moment', 'Step out for a moment')}
            </button>
            <p className="mt-1.5 text-center text-[12.5px] text-[#8696a0]">
              {t(
                `La partie continue : l’ordinateur joue tes tours manqués, et au ${MAX_TIMEOUTS}e d’affilée tu perds.`,
                `The game goes on: the computer plays your missed turns, and you lose at ${MAX_TIMEOUTS} in a row.`,
              )}
            </p>
          </div>
        )}
        <button type="button" onClick={onQuit} className="btn bg-[#f15c6d]/15 text-[#f15c6d]">
          {room.shared && stake ? t('Quitter, tout le monde perd sa mise', 'Leave, everyone loses their stake') : t('Quitter et abandonner', 'Leave and forfeit')}
        </button>
      </div>
    </Sheet>
  );
}

/** End of a staked game: who took the pot, then what to do next. */
function StakeResult({ room, stake, children }: { room: RoomView; stake: RoomStake; children: React.ReactNode }) {
  const premium = stake.currency === 'premium';
  const you = room.seats.find((s) => s.color === room.you);
  const youWon = !!stake.payout?.winner && stake.payout.winner === you?.name;
  const played = !!room.you;
  const { t } = useLang();

  return (
    <>
      <div className="rounded-2xl bg-white/[0.06] p-4 text-left">
        {stake.payout?.winner ? (
          <div className="flex items-center gap-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-full ${youWon ? 'bg-[#25d366]/20' : 'bg-white/10'}`}>
              {premium ? <GemIcon size={24} /> : <CoinIcon size={24} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-white/60">{youWon ? t('Tu remportes la cagnotte', 'You win the pot') : t(`${stake.payout.winner} remporte la cagnotte`, `${stake.payout.winner} wins the pot`)}</p>
              <CoinAmount
                value={stake.payout.amount}
                premium={premium}
                size={20}
                className={`text-[22px] ${youWon ? 'text-[#25d366]' : ''}`}
              />
            </div>
          </div>
        ) : stake.payout ? (
          <p className="text-[14px] text-white/80">{t('Partie interrompue : chaque mise a été remboursée.', 'Game interrupted: every stake was refunded.')}</p>
        ) : (
          <p className="text-[14px] text-white/80">{t('Calcul des gains…', 'Working out the winnings…')}</p>
        )}
        {played && !youWon && stake.payout?.winner && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/60">
            {t('Ta mise perdue :', 'Your lost stake:')} <CoinAmount value={stake.stake} premium={premium} size={14} />
          </p>
        )}
      </div>
      {children}
    </>
  );
}

/** End-of-game buttons: everyone can vote for a rematch; the host can also go back to the lobby. */
function RematchActions({ room, actions }: { room: RoomView; actions: Actions }) {
  const humans = room.seats.filter((s) => s.kind === 'human');
  const waitingFor = humans.filter((s) => s.connected && !room.rematch.includes(s.color));
  const voted = !!room.you && room.rematch.includes(room.you);
  const seated = !!room.you && humans.some((s) => s.color === room.you);
  const opponentsLeft = room.seats.filter((s) => s.kind !== 'empty').length < 2;
  const { t } = useLang();

  return (
    <>
      {seated && !opponentsLeft && (
        <button type="button" onClick={actions.rematch} disabled={voted} className="btn btn-primary">
          {voted
            ? t(`En attente : ${waitingFor.map((s) => s.name).join(', ')}…`, `Waiting for: ${waitingFor.map((s) => s.name).join(', ')}…`)
            : room.wager
              ? t(`Revanche · nouvelle mise de ${stakeTable(room.wager)?.stake ?? ''}`, `Rematch · new stake of ${stakeTable(room.wager)?.stake ?? ''}`)
              : t('Revanche !', 'Rematch!')}
        </button>
      )}
      {room.rematch.length > 0 && !voted && seated && (
        <p className="text-sm text-amber-200">
          {room.seats
            .filter((s) => room.rematch.includes(s.color))
            .map((s) => s.name)
            .join(', ')}{' '}
          {t('veut une revanche !', 'wants a rematch!')}
        </p>
      )}
      {opponentsLeft && <p className="text-sm text-white/60">{t('Tes adversaires sont partis.', 'Your opponents have left.')}</p>}
      {room.isHost ? (
        <button type="button" onClick={actions.backToLobby} className="btn btn-ghost">
          {t('Retour au salon', 'Back to the room')}
        </button>
      ) : (
        !seated && <p className="text-sm text-white/60">{t('En attente des joueurs…', 'Waiting for players…')}</p>
      )}
    </>
  );
}

function Lobby({ room, actions, onQuit, onStepOut }: { room: RoomView; actions: Actions; onQuit: () => void; onStepOut: () => void }) {
  const [botSeat, setBotSeat] = useState<Color | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [wagerOpen, setWagerOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const { session } = useProfile();
  const wager = room.wager ? (stakeTable(room.wager) ?? null) : null;
  const humans = room.seats.filter((s) => s.kind === 'human');
  const { board, dice, pawn } = useAppearance();
  const { t } = useLang();
  const filledSeats = room.seats.filter((s) => s.kind !== 'empty');
  const filled = filledSeats.length;
  const shift = viewShift(room.you, usePreferredColor());
  let duelNote: string | null = null;
  if (filled === 2 && !areDiagonal(filledSeats[0].color, filledSeats[1].color)) {
    const [keep, move] = filledSeats[1].isHost ? [filledSeats[1], filledSeats[0]] : filledSeats;
    const side = COLOR_LABEL[shownColor(TEAMMATE[keep.color], shift)];
    duelNote = t(`À deux, les camps sont en diagonale : ${move.name} jouera ${side}.`, `With two players, sides are diagonal: ${move.name} will play ${side}.`);
  }
  const guests = humans.filter((s) => s.stakeIssue === 'guest').map((s) => s.name);
  const broke = humans.filter((s) => s.stakeIssue === 'funds').map((s) => s.name);
  const startError =
    filled < 2
      ? t('Il faut au moins 2 joueurs.', 'At least 2 players are needed.')
      : room.rules.teams && filled !== 4
        ? t('Le mode équipes nécessite 4 joueurs.', 'Team mode needs 4 players.')
        : wager && filled !== humans.length
          ? t('Pas d’ordinateur dans une partie avec mise.', 'No computer players in a staked game.')
          : guests.length
            ? t(`${guests.join(', ')} doi${guests.length > 1 ? 'vent' : 't'} se connecter pour miser.`, `${guests.join(', ')} must sign in to stake.`)
            : broke.length
              ? t(`${broke.join(', ')} n’${broke.length > 1 ? 'ont' : 'a'} pas assez de pièces.`, `${broke.join(', ')} ${broke.length > 1 ? 'don’t' : 'doesn’t'} have enough coins.`)
              : null;
  const pot = wager ? potSplit(wager.stake, Math.max(2, humans.length)) : null;
  const youCantStake = wager && room.you ? room.seats.find((s) => s.color === room.you)?.stakeIssue : null;
  const preset = matchPreset(room.rules);
  const PresetIcon = (preset && PRESET_ICON[preset.id]) || Icon.Tune;
  const summary = rulesSummary(room.rules);

  const copyCode = async () => {
    await navigator.clipboard?.writeText(room.code).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-[#1f2c33] px-1 pt-[env(safe-area-inset-top)] shadow-md">
        <div className="flex h-16 w-full items-center gap-1">
          <BackButton onClick={onStepOut} label={t('Retour aux salons', 'Back to rooms')} text={t('Salons', 'Rooms')} />
          <div className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[20px] leading-tight font-medium">{t('Salon privé', 'Private room')}</h1>
            <p className="truncate text-[13px] text-[#8696a0]">
              {t(`${filled}/4 joueurs`, `${filled}/4 players`)}
              {room.spectators.length > 0 && t(` · ${room.spectators.length} spectateur(s)`, ` · ${room.spectators.length} spectator(s)`)}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg pb-48">
        <section className="mx-4 mt-4 rounded-[28px] bg-[#1f2c33] p-5">
          <p className="text-[12px] font-medium tracking-[0.12em] text-[#8696a0] uppercase">{t('Code du salon', 'Room code')}</p>
          <div className="mt-1 mb-4 flex items-center justify-between gap-2">
            <span className="font-mono text-[34px] leading-none font-bold tracking-[0.28em]">{room.code}</span>
            <IconButton label={codeCopied ? t('Code copié', 'Code copied') : t('Copier le code', 'Copy the code')} onClick={copyCode}>
              {codeCopied ? <Icon.Check className="text-[#25d366]" /> : <Icon.Copy />}
            </IconButton>
          </div>
          <InviteButtons code={room.code} />
        </section>

        <SectionTitle>{t('Joueurs', 'Players')}</SectionTitle>
        <ul className="divide-y divide-[#222d34]">
          {CORNER_ORDER.map((corner) => {
            const color = campShownAs(corner, boardTurn(room.you));
            return (
              <li key={color}>
                <LobbySeat
                  seat={room.seats.find((s) => s.color === color)!}
                  shown={shownColor(color, shift)}
                  room={room}
                  actions={actions}
                  onAddBot={() => setBotSeat(color)}
                />
              </li>
            );
          })}
        </ul>

        {room.you && (
          <>
            <SectionTitle>{t('Ta couleur', 'Your colour')}</SectionTitle>
            <div className="mx-4 rounded-[28px] bg-[#1f2c33] p-4">
              <ColorPreference assigned={room.you} />
            </div>
          </>
        )}

        {duelNote && (
          <p className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-[#1f2c33] px-4 py-3 text-[13.5px] text-[#d1d7db]">
            <Icon.Info size={20} className="mt-px shrink-0 text-[#53bdeb]" />
            {duelNote}
          </p>
        )}

        {room.spectators.length > 0 && (
          <ListRow
            leading={<Icon.Eye className="text-[#8696a0]" />}
            title={t('Spectateurs', 'Spectators')}
            subtitle={room.spectators.join(', ')}
          />
        )}

        {youCantStake && (
          <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-[#f15c6d]/12 px-4 py-3 text-[13.5px] text-[#e9edef]">
            <Icon.Info size={20} className="mt-px shrink-0 text-[#f15c6d]" />
            <span className="flex-1">
              {youCantStake === 'guest' ? (
                t(
                  <>
                    Ce salon se joue avec mise : <Link href="/compte" className="font-semibold text-[#00a884]">connecte-toi</Link> pour jouer, ou
                    laisse ta place.
                  </>,
                  <>
                    This room is played with a stake: <Link href="/compte" className="font-semibold text-[#00a884]">sign in</Link> to play, or
                    leave your seat.
                  </>,
                )
              ) : (
                t(
                  <>
                    Il te faut <CoinAmount value={wager!.stake} premium={wager!.currency === 'premium'} size={14} /> pour jouer dans ce salon.
                  </>,
                  <>
                    You need <CoinAmount value={wager!.stake} premium={wager!.currency === 'premium'} size={14} /> to play in this room.
                  </>,
                )
              )}
            </span>
          </div>
        )}
        {wager?.currency === 'premium' && <AdultRequiredBanner className="mx-4 mt-3" />}

        <SectionTitle>{t('Paramètres de la partie', 'Game settings')}</SectionTitle>
        <ListRow
          leading={
            <span
              className={`grid size-11 place-items-center rounded-full ${
                wager ? (wager.currency === 'premium' ? 'bg-violet-500/15' : 'bg-amber-500/15') : 'bg-white/10 text-[#8696a0]'
              }`}
            >
              {wager?.currency === 'premium' ? <GemIcon size={22} /> : wager ? <CoinIcon size={22} /> : <CoinIcon size={22} />}
            </span>
          }
          title={
            wager ? (
              <span className="flex items-center gap-1.5">
                {t('Mise', 'Stake')} <CoinAmount value={wager.stake} premium={wager.currency === 'premium'} size={15} /> {t('par joueur', 'per player')}
              </span>
            ) : (
              t('Sans mise', 'No stake')
            )
          }
          subtitle={
            wager && pot ? (
              <span className="flex items-center gap-1">
                {wager.currency === 'premium' ? 'Premium' : 'Free'} · {t('le gagnant remporte', 'the winner gets')}{' '}
                <CoinAmount value={pot.prize} premium={wager.currency === 'premium'} size={13} className="text-[#25d366]" />
              </span>
            ) : room.isHost ? (
              t('Ajoute une mise en pièces Free ou Premium', 'Add a stake in Free or Premium coins')
            ) : (
              t('Partie amicale', 'Friendly game')
            )
          }
          trailing={room.isHost ? <Icon.ChevronRight className="text-[#8696a0]" /> : undefined}
          onClick={room.isHost ? () => setWagerOpen(true) : undefined}
        />
        <ListRow
          leading={
            <span className="grid size-11 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
              <PresetIcon size={22} />
            </span>
          }
          title={t(`Règles : ${preset?.label ?? 'personnalisées'}`, `Rules: ${preset?.label ?? 'custom'}`)}
          subtitle={summary.length ? summary.join(' · ') : t('Règles standard', 'Standard rules')}
          trailing={<Icon.ChevronRight className="text-[#8696a0]" />}
          onClick={() => setRulesOpen(true)}
        />
        <ListRow
          leading={
            <span className="grid size-11 place-items-center rounded-full bg-[#53bdeb]/15 text-[#53bdeb]">
              <Icon.Palette size={22} />
            </span>
          }
          title={t('Apparence', 'Appearance')}
          subtitle={t(
            `${board.name} · dés ${dice.name.toLowerCase()} · pions ${pawn.name.toLowerCase()}`,
            `${board.name} · ${dice.name.toLowerCase()} dice · ${pawn.name.toLowerCase()} pawns`,
          )}
          trailing={<Icon.ChevronRight className="text-[#8696a0]" />}
          onClick={() => setLookOpen(true)}
        />
        <p className="px-5 pt-1 text-[12.5px] text-[#8696a0]">{t('L’apparence ne change que sur ton appareil.', 'The appearance only changes on your device.')}</p>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          {room.isHost ? (
            <>
              {startError && (
                <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-[13px] text-[#ffbc38]">
                  <Icon.Info size={16} />
                  {startError}
                </p>
              )}
              <button
                type="button"
                disabled={!!startError}
                onClick={actions.start}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[16px] font-semibold text-[#0b141a] shadow-lg shadow-black/30 transition active:scale-[0.98] disabled:bg-[#2a3942] disabled:text-[#8696a0] disabled:shadow-none"
              >
                <Icon.Play />
                {wager ? (
                  <span className="flex items-center gap-1.5">
                    {t('Miser', 'Stake')} <CoinAmount value={wager.stake} premium={wager.currency === 'premium'} size={17} /> {t('et lancer', 'and start')}
                  </span>
                ) : (
                  t('Lancer la partie', 'Start the game')
                )}
              </button>
              {wager && !startError && (
                <p className="mt-2 text-center text-[12px] text-[#8696a0]">{t('La mise de chaque joueur est prélevée au lancement.', 'Each player’s stake is taken when the game starts.')}</p>
              )}
            </>
          ) : (
            <div className="flex h-14 items-center justify-center gap-3 rounded-full bg-[#1f2c33] text-[15px] text-[#d1d7db]">
              <span className="size-5 animate-spin rounded-full border-2 border-[#00a884]/30 border-t-[#00a884]" />
              {t('En attente de l’hôte…', 'Waiting for the host…')}
            </div>
          )}
          <button type="button" onClick={onQuit} className="mt-1 h-11 w-full text-[14px] font-medium text-[#8696a0]">
            {t('Quitter le salon', 'Leave the room')}
          </button>
        </div>
      </div>

      <Sheet open={botSeat !== null} title={t('Ajouter un ordinateur', 'Add a computer player')} onClose={() => setBotSeat(null)}>
        <ul className="-mx-5">
          {(['easy', 'medium', 'hard'] as BotLevel[]).map((level) => (
            <li key={level}>
              <ListRow
                leading={
                  <span className="grid size-11 place-items-center rounded-full bg-white/10">
                    <Icon.Robot size={22} />
                  </span>
                }
                title={BOT_LEVEL_LABEL[level]}
                subtitle={BOT_LEVEL_HINT[level]}
                onClick={() => {
                  if (botSeat) actions.setSeat(botSeat, 'bot', level);
                  setBotSeat(null);
                }}
              />
            </li>
          ))}
        </ul>
      </Sheet>

      <WagerSheet
        open={wagerOpen}
        onClose={() => setWagerOpen(false)}
        current={room.wager}
        players={Math.max(2, humans.length)}
        hasBots={room.seats.some((s) => s.kind === 'bot')}
        signedIn={!!session}
        onPick={(table) => {
          actions.setWager(table);
          setWagerOpen(false);
        }}
      />

      <Sheet open={rulesOpen} title={t('Règles et variantes', 'Rules and variants')} onClose={() => setRulesOpen(false)}>
        <RulesEditor rules={room.rules} onChange={room.isHost ? actions.setRules : undefined} />
      </Sheet>

      <Sheet open={lookOpen} title={t('Apparence', 'Appearance')} onClose={() => setLookOpen(false)}>
        <AppearancePicker />
      </Sheet>
    </div>
  );
}

function SeatAvatar({ seat, shown }: { seat: PublicSeat; shown: Color }) {
  const hex = COLOR_HEX[shown];
  if (seat.kind === 'empty') {
    return (
      <span className="grid size-11 place-items-center rounded-full border-2 border-dashed" style={{ borderColor: `${hex}99`, color: hex }}>
        <Icon.PersonAdd size={20} />
      </span>
    );
  }
  return (
    <span className="relative grid size-11 place-items-center rounded-full text-[17px] font-semibold text-white" style={{ background: hex }}>
      {seat.kind === 'bot' ? <Icon.Robot size={22} /> : seat.name.trim()[0]?.toUpperCase()}
      {seat.isHost && (
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-[#0b141a] bg-[#ffbc38] text-[#0b141a]">
          <Icon.Star size={11} />
        </span>
      )}
      {seat.kind === 'human' && !seat.connected && (
        <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-[#0b141a] bg-[#8696a0]" />
      )}
    </span>
  );
}

/** `shown` is the colour this seat appears in on this screen (see `lib/perspective`). */
function LobbySeat({
  seat,
  shown,
  room,
  actions,
  onAddBot,
}: {
  seat: PublicSeat;
  shown: Color;
  room: RoomView;
  actions: Actions;
  onAddBot: () => void;
}) {
  const isYou = seat.color === room.you;
  const { t } = useLang();
  const colorTag = (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: COLOR_HEX[shown] }} />
      {COLOR_LABEL[shown]}
    </span>
  );

  if (seat.kind === 'empty') {
    return (
      <ListRow
        leading={<SeatAvatar seat={seat} shown={shown} />}
        title={<span className="text-[#8696a0]">{t('Place libre', 'Free seat')}</span>}
        subtitle={colorTag}
        trailing={
          <span className="flex items-center gap-1">
            {room.isHost && !room.wager && (
              <IconButton label={t('Ajouter un ordinateur', 'Add a computer player')} onClick={onAddBot}>
                <Icon.Robot size={22} />
              </IconButton>
            )}
            <button
              type="button"
              onClick={() => actions.takeSeat(seat.color)}
              className="h-9 rounded-full bg-[#00a884]/15 px-4 text-[14px] font-medium text-[#00a884] transition active:bg-[#00a884]/25"
            >
              {room.you ? t('Changer', 'Switch') : t('Rejoindre', 'Join')}
            </button>
          </span>
        }
      />
    );
  }

  const status =
    seat.kind === 'bot'
      ? t(`Ordinateur ${BOT_LEVEL_LABEL[seat.botLevel ?? 'medium'].toLowerCase()}`, `${BOT_LEVEL_LABEL[seat.botLevel ?? 'medium']} computer`)
      : !seat.connected
        ? t('Déconnecté', 'Disconnected')
        : seat.isHost
          ? t('Hôte', 'Host')
          : t('Prêt', 'Ready');

  return (
    <ListRow
      leading={<SeatAvatar seat={seat} shown={shown} />}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{seat.name}</span>
          {isYou && <span className="shrink-0 rounded-full bg-[#00a884]/15 px-2 py-0.5 text-[11px] font-semibold text-[#00a884]">{t('Toi', 'You')}</span>}
        </span>
      }
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          {colorTag}
          <span>·</span>
          <span className={seat.kind === 'human' && !seat.connected ? 'text-[#f15c6d]' : ''}>{status}</span>
          {room.wager && seat.kind === 'human' && (
            <>
              <span>·</span>
              {seat.stakeIssue === 'guest' ? (
                <span className="text-[#f15c6d]">{t('Sans compte', 'No account')}</span>
              ) : seat.stakeIssue === 'funds' ? (
                <span className="text-[#f15c6d]">{t('Solde insuffisant', 'Not enough coins')}</span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[#25d366]">
                  <Icon.Check size={14} />
                  {t('Mise OK', 'Stake OK')}
                </span>
              )}
            </>
          )}
        </span>
      }
      trailing={
        room.isHost && !isYou ? (
          <IconButton label={t(`Retirer ${seat.name}`, `Remove ${seat.name}`)} onClick={() => actions.setSeat(seat.color, 'empty')}>
            <Icon.PersonRemove size={22} />
          </IconButton>
        ) : undefined
      }
    />
  );
}

const WAGER_TABS: { id: Currency; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'premium', label: 'Premium' },
];

/** Host's choice of stake for a private room: none, or one of the quick-match tables. */
function WagerSheet({
  open,
  onClose,
  current,
  players,
  hasBots,
  signedIn,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
  players: number;
  hasBots: boolean;
  signedIn: boolean;
  onPick: (table: string | null) => void;
}) {
  const { profile, premiumCoins } = useProfile();
  const stakes = useStakeConfig();
  const { gate, notice } = useAdultGate();
  const [pickedCurrency, setCurrency] = useState<Currency>(() => stakeTable(current)?.currency ?? 'free');
  const currency: Currency = stakes.premiumEnabled ? pickedCurrency : 'free';
  const premium = currency === 'premium';
  const balance = premium ? premiumCoins : profile.coins;
  const picked = stakeTable(current);
  const customStake = picked && !stakes.tables.some((s) => s.id === picked.id) ? picked : null;
  const { t } = useLang();

  return (
    <Sheet open={open} title={t('Mise de la partie', 'Game stake')} onClose={onClose}>
      <div className="flex flex-col pb-1">
        <p className="text-[13.5px] leading-relaxed text-[#8696a0]">
          {t(
            `Chaque joueur mise la même somme au lancement. Le gagnant remporte ${Math.round(stakes.winnerShare * 100)} % de la cagnotte.`,
            `Each player stakes the same amount at the start. The winner gets ${Math.round(stakes.winnerShare * 100)}% of the pot.`,
          )}
        </p>

        <div className={`mt-4 grid grid-cols-2 gap-1 rounded-full bg-[#2a3942] p-1 ${stakes.premiumEnabled ? '' : 'hidden'}`}>
          {WAGER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => (tab.id === 'premium' ? gate(() => setCurrency('premium')) : setCurrency(tab.id))}
              aria-pressed={currency === tab.id}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-full text-[14.5px] font-semibold transition ${
                currency === tab.id ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#aebac1]'
              }`}
            >
              {tab.id === 'premium' ? <GemIcon size={17} /> : <CoinIcon size={17} />}
              {tab.label}
            </button>
          ))}
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-[#8696a0]">
          {t('Ton solde :', 'Your balance:')} <CoinAmount value={signedIn ? balance : 0} premium={premium} size={14} />
        </p>

        {hasBots && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#ffbc38]/10 px-3 py-2.5 text-[13px] text-[#ffd279]">
            <Icon.Info size={18} className="mt-px shrink-0" />
            {t('Retire d’abord les ordinateurs : seuls des joueurs connectés peuvent miser.', 'Remove the computer players first: only signed-in players can stake.')}
          </p>
        )}

        <ul className="-mx-2 mt-2">
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left active:bg-white/5"
            >
              <span className="grid size-11 place-items-center rounded-full bg-white/10 text-[#8696a0]">
                <Icon.Block size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] text-[#e9edef]">{t('Sans mise', 'No stake')}</span>
                <span className="block text-[13px] text-[#8696a0]">{t('Partie amicale, ordinateurs autorisés', 'Friendly game, computer players allowed')}</span>
              </span>
              <Radio checked={current === null} />
            </button>
          </li>
          {stakes.tables.filter((t) => t.currency === currency).map((table) => {
            const { prize } = potSplit(table.stake, players);
            const short = signedIn && balance < table.stake;
            return (
              <li key={table.id}>
                <button
                  type="button"
                  disabled={hasBots || !signedIn}
                  onClick={() => onPick(table.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left enabled:active:bg-white/5 disabled:opacity-45"
                >
                  <span className={`grid size-11 place-items-center rounded-full ${premium ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}>
                    {premium ? <GemIcon size={22} /> : <CoinIcon size={22} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15.5px] text-[#e9edef]">
                      {t('Mise', 'Stake')} <CoinAmount value={table.stake} premium={premium} size={15} />
                    </span>
                    <span className="flex items-center gap-1 text-[13px] text-[#8696a0]">
                      {short ? (
                        <span className="text-[#f15c6d]">{t('Solde insuffisant pour toi', 'Not enough coins for you')}</span>
                      ) : (
                        <>
                          {t(`À ${players} joueurs, gain`, `With ${players} players, prize`)} <CoinAmount value={prize} premium={premium} size={13} className="text-[#25d366]" />
                        </>
                      )}
                    </span>
                  </span>
                  <Radio checked={current === table.id} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2">
          <CustomStake
            key={currency}
            currency={currency}
            balance={signedIn ? balance : null}
            players={players}
            initial={customStake?.currency === currency ? customStake.stake : undefined}
            selected={customStake?.currency === currency}
            action={t('Choisir', 'Choose')}
            disabled={hasBots || !signedIn}
            onSubmit={onPick}
          />
        </div>
        {!signedIn && (
          <p className="mt-2 text-center text-[13px] text-[#8696a0]">
            <Link href="/compte" className="font-semibold text-[#00a884]">
              {t('Connecte-toi', 'Sign in')}
            </Link>{' '}
            {t('pour proposer une mise.', 'to offer a stake.')}
          </p>
        )}
      </div>
      {notice}
    </Sheet>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${checked ? 'border-[#00a884]' : 'border-[#8696a0]'}`}>
      {checked && <span className="size-2.5 rounded-full bg-[#00a884]" />}
    </span>
  );
}
