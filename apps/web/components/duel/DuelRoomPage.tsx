'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { otherSide, type DuelGame, type DuelRoomViewOf, type RoomStake, type Side } from '@ludo/engine';
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
import { useDuelRoom, type DuelActions as Actions } from '@/lib/useDuelRoom';
import { GameButton, ResultHeader, useTick } from './DuelFrame';
import { DUEL_UI, type DuelUi } from './duelGames';

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

  if (!nameChecked) return null;

  if (!name) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-[#0b141a] p-6 text-[#e9edef]">
        <div className="text-center">
          <span className="mx-auto grid w-fit place-items-center">{ui.logo(72)}</span>
          <h1 className="mt-3 text-2xl font-bold">{ui.challengeTitle}</h1>
          <p className="mt-1 text-white/60">
            Salon <span className="font-mono font-bold tracking-widest text-white">{code}</span>
          </p>
        </div>
        <div className="rounded-3xl bg-[#1f2c33] p-4">
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
    const notFound = /introuvable/i.test(joinError);
    return (
      <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
        <AppBar title={ui.roomTitle} backHref={`${ui.base}/salon`} backText="Salons" backLabel="Retour aux salons" />
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-12 text-center">
          <span className="grid size-24 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
            {notFound ? <Icon.Search size={46} /> : <Icon.Block size={46} />}
          </span>
          <h1 className="mt-5 text-[22px] font-semibold">{notFound ? 'Salon introuvable' : 'Impossible de rejoindre'}</h1>
          <p className="mt-1.5 max-w-xs text-[14.5px] text-[#8696a0]">{notFound ? `Aucun salon ouvert avec le code ${code}.` : joinError}</p>
          <div className="mt-8 flex w-full flex-col gap-2">
            <Link href={`${ui.base}/salon`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]">
              <Icon.Login size={20} />
              Entrer un autre code
            </Link>
            <Link href={`${ui.base}/rapide`} className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884]">
              <Icon.Bolt size={20} />
              Partie rapide
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
        <p className="text-[18px] font-medium">{connected ? 'Connexion au salon' : 'Serveur de jeu injoignable'}</p>
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
        <OnlineGame room={room} receivedAt={receivedAt} actions={actions} onQuit={quit} />
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
        Cagnotte <CoinAmount value={stake.pot} premium={premium} size={15} />
      </span>
      <span className="text-white/30">·</span>
      <span className="flex items-center gap-1.5">
        Gain <CoinAmount value={stake.prize} premium={premium} size={15} className="text-[#25d366]" />
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
      <AppBar title={ui.roomTitle} subtitle={room.isHost ? 'Tu es l’hôte' : 'En attente du lancement'} backHref={`${ui.base}/salon`} backText="Salons" backLabel="Quitter le salon" />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-36">
        <section className="rounded-[28px] bg-[#1f2c33] p-4 text-center">
          <p className="text-[13px] text-[#8696a0]">Code du salon</p>
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
                      <span className="truncate">{p ? p.name : 'En attente d’un adversaire…'}</span>
                      {p && room.you === i && <span className="rounded-full bg-[#00a884]/15 px-1.5 text-[11px] text-[#00a884]">Toi</span>}
                    </span>
                    <span className="block text-[12.5px] text-[#8696a0]">
                      {!p
                        ? 'Partage le code ou le lien'
                        : p.stakeIssue === 'guest'
                          ? 'Doit se connecter pour miser'
                          : p.stakeIssue === 'funds'
                            ? 'Solde insuffisant pour la mise'
                            : p.isHost
                              ? 'Hôte'
                              : p.connected
                                ? 'Prêt'
                                : 'Déconnecté'}
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
              {room.spectators} spectateur{room.spectators > 1 ? 's' : ''}
            </p>
          )}
        </section>

        {room.isHost ? (
          <section className="rounded-[28px] bg-[#1f2c33] p-4">
            <p className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">Type de partie</p>
            <StakePicker value={room.wager} onChange={actions.setWager} players={2} />
          </section>
        ) : room.wager ? (
          <p className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-[13.5px] text-amber-200">
            <Icon.Info size={20} className="shrink-0" />
            Partie avec mise : ta mise sera prise au lancement par l’hôte.
          </p>
        ) : null}
        {!room.isHost && room.wager?.startsWith('premium-') && <AdultRequiredBanner />}

        <p className="flex items-start gap-3 px-2 text-[13px] text-[#8696a0]">
          <Icon.Timer size={18} className="mt-px shrink-0" />
          {ui.clockMs / 60_000} minutes de réflexion par joueur. {ui.sidesText}
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
              {ready ? (room.wager ? 'Lancer et prendre les mises' : 'Lancer la partie') : 'En attente d’un adversaire'}
            </button>
          ) : (
            <p className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#1f2c33] text-[15px] text-[#aebac1]">
              <span className="size-4 animate-spin rounded-full border-2 border-[#00a884]/30 border-t-[#00a884]" />
              L’hôte va lancer la partie
            </p>
          )}
          <button type="button" onClick={onQuit} className="h-11 text-[14px] font-medium text-[#8696a0]">
            Quitter le salon
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineGame({ room, receivedAt, actions, onQuit }: { room: DuelRoomViewOf<DuelGame>; receivedAt: number; actions: Actions; onQuit: () => void }) {
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
    return index >= 0 ? room.players[index]?.name ?? 'Joueur parti' : 'Joueur parti';
  };
  const seatOf = (side: Side) => room.players[room.colors?.indexOf(side) ?? -1];
  const clockOf = (side: Side) => {
    if (!room.clock) return null;
    const base = room.clock[side];
    return room.clock.running === side ? base - (now - receivedAt) : base;
  };
  const names = { white: nameOf('white'), black: nameOf('black') };

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

  const banner = offerFromOpponent ? (
    <div className="pop-in flex items-center gap-2 rounded-2xl bg-[#53bdeb]/15 px-3 py-2">
      <Icon.Handshake size={20} className="shrink-0 text-[#53bdeb]" />
      <span className="min-w-0 flex-1 text-[13.5px]">{nameOf(otherSide(you!))} propose la nulle.</span>
      <button type="button" onClick={actions.declineDraw} className="h-8 rounded-full px-3 text-[13px] font-semibold text-[#aebac1]">
        Refuser
      </button>
      <button type="button" onClick={actions.draw} className="h-8 rounded-full bg-[#53bdeb] px-3 text-[13px] font-semibold text-[#0b141a]">
        Accepter
      </button>
    </div>
  ) : room.stake && playing ? (
    <div className="rounded-2xl bg-amber-500/10 px-3 py-2 text-amber-100">
      <StakeLine stake={room.stake} />
    </div>
  ) : !you && playing ? (
    <p className="flex items-center justify-center gap-2 text-[13px] text-[#8696a0]">
      <Icon.Eye size={16} />
      Tu regardes la partie
    </p>
  ) : null;

  const payout = room.stake?.payout;
  const premium = room.stake?.currency === 'premium';

  return (
    <>
      <View
        title={room.matched ? 'Partie rapide' : `Salon ${room.code}`}
        subtitle={room.spectators ? `${room.spectators} spectateur${room.spectators > 1 ? 's' : ''}` : ui.long}
        onBack={() => (playing && you ? setConfirm('quit') : onQuit())}
        backLabel="Quitter la partie"
        state={game}
        top={{ name: nameOf(otherSide(bottomSide)), side: otherSide(bottomSide), clockMs: clockOf(otherSide(bottomSide)), connected: seatOf(otherSide(bottomSide))?.connected ?? false }}
        bottom={{ name: nameOf(bottomSide), side: bottomSide, clockMs: clockOf(bottomSide), connected: seatOf(bottomSide)?.connected ?? false, you: !!you }}
        flipped={bottomSide === 'black'}
        interactive={playing && !!you && game.turn === you}
        onMove={actions.move}
        banner={banner}
        toolbar={
          playing && you ? (
            <>
              <GameButton onClick={actions.draw} disabled={youOffered} icon={<Icon.Handshake size={18} />}>
                {youOffered ? 'Nulle proposée' : offerFromOpponent ? 'Accepter la nulle' : 'Proposer la nulle'}
              </GameButton>
              <GameButton onClick={() => setConfirm('resign')} tone="danger" icon={<Icon.Flag size={18} />}>
                Abandonner
              </GameButton>
            </>
          ) : undefined
        }
        result={
          <>
            <ResultHeader winner={game.winner} viewer={you} names={names} explanation={ui.ending(game, names)} />
            {room.stake && (
              <div className="mt-4 rounded-2xl bg-[#0b141a]/60 px-4 py-3 text-center text-[14px]">
                {!payout ? (
                  'Règlement de la cagnotte…'
                ) : payout.winner ? (
                  <span className="flex flex-wrap items-center justify-center gap-1.5">
                    {payout.winner} remporte <CoinAmount value={payout.amount} premium={premium} size={16} className="text-[#25d366]" />
                  </span>
                ) : (
                  'Partie nulle : chaque mise a été remboursée.'
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
                  Rejouer à cette table
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
                    ? 'Ton adversaire est parti'
                    : rematchAsked
                      ? 'En attente de ton adversaire…'
                      : opponentAsked
                        ? 'Accepter la revanche'
                        : room.stake
                          ? `Revanche · nouvelle mise de ${room.stake.stake}`
                          : 'Revanche'}
                </button>
              ) : null}
              <button type="button" onClick={onQuit} className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold">
                <Icon.Close size={20} />
                Quitter
              </button>
            </div>
          </>
        }
      />
      <Sheet open={confirm !== null} title={confirm === 'resign' ? 'Abandonner la partie ?' : 'Quitter la partie ?'} onClose={() => setConfirm(null)}>
        <p className="text-[14px] text-[#aebac1]">
          {confirm === 'resign' ? 'Ton adversaire remportera la partie.' : 'Quitter maintenant compte comme un abandon : ton adversaire gagne.'}
          {room.stake && ' Ta mise sera perdue.'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 pb-1">
          <button type="button" onClick={() => setConfirm(null)} className="h-12 rounded-full border border-[#2a3942] text-[15px] font-semibold">
            Continuer
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
            {confirm === 'resign' ? 'Abandonner' : 'Quitter'}
          </button>
        </div>
      </Sheet>
    </>
  );
}
