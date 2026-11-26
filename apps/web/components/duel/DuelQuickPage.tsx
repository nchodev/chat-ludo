'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { potSplit, stakeTable, type Currency, type DuelGame, type StakeTable } from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { CoinAmount, CoinIcon, GemIcon } from '@/components/Coins';
import { CustomStake } from '@/components/CustomStake';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { useAdultGate } from '@/components/AdultNotice';
import { getSessionToken, refreshProfile, useProfile } from '@/lib/profile';
import { useStakeConfig } from '@/lib/stakes';
import { getSocket, getStoredName, storeDraughtsToken, storeName } from '@/lib/socket';
import { DUEL_UI } from './duelGames';

const CURRENCY_TABS: { id: Currency; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'premium', label: 'Premium' },
];

/** Quick match of a two-player game: pick a table, wait for an opponent, go to the room. */
export function DuelQuickPage({ kind }: { kind: DuelGame }) {
  const ui = DUEL_UI[kind];
  const PENDING_TABLE_KEY = `luchat:${kind}:pending-table`;
  const router = useRouter();
  const { session, profile, premiumCoins, ready } = useProfile();
  const stakes = useStakeConfig();
  const { gate, notice } = useAdultGate();
  const [name, setName] = useState('');
  const [pickedCurrency, setCurrency] = useState<Currency>('free');
  const currency: Currency = stakes.premiumEnabled ? pickedCurrency : 'free';
  /** Table being searched: null for a game without stake, undefined when not searching. */
  const [searching, setSearching] = useState<StakeTable | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);
  const [askLogin, setAskLogin] = useState<StakeTable | null>(null);
  const autoStarted = useRef(false);

  const balance = (c: Currency) => (c === 'premium' ? premiumCoins : profile.coins);

  useEffect(() => setName(session?.username ?? getStoredName()), [session]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const start = (table: StakeTable | null, chosenName = name) => {
    if (table && !session) return setAskLogin(table);
    if (!table && !session && !askName && chosenName === name) return setAskName(true);
    const player = (session?.username ?? chosenName).trim();
    if (!player) return setError('Choisis d’abord un pseudo.');
    if (table && balance(table.currency) < table.stake) return setError('Solde insuffisant pour cette mise.');
    setAskName(false);
    if (player !== name) setName(player);
    storeName(player);
    setError(null);
    setSearching(table);
  };

  // "Rejouer à cette table" comes back here with ?table=…
  useEffect(() => {
    if (!ready || autoStarted.current) return;
    autoStarted.current = true;
    const pending = sessionStorage.getItem(PENDING_TABLE_KEY);
    sessionStorage.removeItem(PENDING_TABLE_KEY);
    const requested = new URLSearchParams(window.location.search).get('table') ?? (session ? pending : null);
    if (!requested) return;
    window.history.replaceState(null, '', `${ui.base}/rapide`);
    const table = stakeTable(requested);
    if (!table) return;
    const resume = () => {
      setCurrency(table.currency);
      start(table);
    };
    if (table.currency === 'premium') gate(resume);
    else resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const searchingKey = searching === undefined ? undefined : (searching?.id ?? 'practice');
  useEffect(() => {
    if (searching === undefined) return;
    const socket = getSocket();
    const join = () =>
      socket.emit('draughts:queue', { game: kind, name: name.trim(), auth: getSessionToken(), table: searching?.id }, (res) => {
        if (!res.ok) {
          setError(res.error ?? 'Erreur');
          setSearching(undefined);
        }
      });
    const onFound = ({ code, token }: { code: string; token: string }) => {
      storeDraughtsToken(code, token);
      void refreshProfile();
      router.push(`${ui.base}/salon/${code}`);
    };
    const onCancelled = (reason: string) => {
      setError(reason);
      setSearching(undefined);
      void refreshProfile();
    };
    socket.on('draughts:found', onFound);
    socket.on('draughts:cancelled', onCancelled);
    socket.on('connect', join);
    if (socket.connected) join();
    else socket.connect();
    return () => {
      socket.off('draughts:found', onFound);
      socket.off('draughts:cancelled', onCancelled);
      socket.off('connect', join);
      socket.emit('draughts:unqueue');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingKey, router, kind]);

  if (searching !== undefined) {
    const premium = searching?.currency === 'premium';
    const split = searching ? potSplit(searching.stake, 2, stakes.winnerShare) : null;
    return (
      <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
        <AppBar
          title="Partie rapide"
          subtitle={searching ? `Table ${premium ? 'Premium' : 'Free'} · mise ${searching.stake}` : 'Sans mise'}
          backHref={ui.base}
          backText={ui.name}
          backLabel={`Retour : ${ui.name}`}
        />
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-8 pb-32 text-center">
          <div className="relative grid size-56 place-items-center">
            <span className="radar-ring absolute inset-0 rounded-full border-2 border-amber-400/50" />
            <span className="radar-ring absolute inset-0 rounded-full border-2 border-amber-400/50 [animation-delay:0.8s]" />
            <span className="radar-ring absolute inset-0 rounded-full border-2 border-amber-400/50 [animation-delay:1.6s]" />
            <span className="absolute inset-8 rounded-full bg-amber-500/10" />
            {ui.searchArt}
          </div>
          <h2 className="mt-6 text-[22px] font-semibold">Recherche d’un adversaire</h2>
          <p className="mt-1 text-[14.5px] text-[#8696a0]">La partie commence dès qu’un joueur rejoint cette table.</p>

          {split && (
            <div className="mt-8 grid w-full grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#1f2c33] p-3">
                <p className="text-[12px] text-[#8696a0]">Cagnotte</p>
                <CoinAmount value={split.pot} premium={premium} size={20} className="mt-1 text-[18px]" />
              </div>
              <div className="rounded-2xl bg-[#1f2c33] p-3">
                <p className="text-[12px] text-[#8696a0]">Gain du vainqueur</p>
                <CoinAmount value={split.prize} premium={premium} size={20} className="mt-1 text-[18px] text-[#25d366]" />
              </div>
              <p className="col-span-2 text-[12.5px] text-[#8696a0]">Ta mise n’est prise qu’au lancement de la partie. Annuler avant ne coûte rien.</p>
            </div>
          )}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-lg">
            {error && (
              <p className="mb-2 flex items-center justify-center gap-1.5 text-[13px] text-[#f15c6d]">
                <Icon.Info size={16} />
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => setSearching(undefined)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[16px] font-semibold transition active:bg-white/5"
            >
              <Icon.Close size={22} />
              Annuler la recherche
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tables = stakes.tables.filter((t) => t.currency === currency);
  const premium = currency === 'premium';
  const winnerPercent = Math.round(stakes.winnerShare * 100);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title="Partie rapide" subtitle={`${ui.name} · un contre un`} backHref={ui.base} backText={ui.name} backLabel={`Retour : ${ui.name}`} />

      <div className={`sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 bg-[#1f2c33] shadow-md ${stakes.premiumEnabled ? '' : 'hidden'}`}>
        <div className="mx-auto flex max-w-lg">
          {CURRENCY_TABS.map((tab) => {
            const active = currency === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => (tab.id === 'premium' ? gate(() => setCurrency('premium')) : setCurrency(tab.id))}
                aria-pressed={active}
                className={`relative flex h-12 flex-1 items-center justify-center gap-2 text-[14.5px] font-semibold tracking-wide uppercase transition ${active ? 'text-[#00a884]' : 'text-[#8696a0]'}`}
              >
                {tab.id === 'premium' ? <GemIcon size={18} /> : <CoinIcon size={18} />}
                {tab.label}
                {active && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-t-full bg-[#00a884]" />}
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto flex max-w-lg flex-col gap-4 pt-4 pb-10">
        <section
          className={`mx-4 flex items-center gap-4 rounded-[28px] p-4 ${premium ? 'bg-gradient-to-br from-violet-600/35 to-indigo-700/15' : 'bg-gradient-to-br from-amber-500/30 to-orange-600/10'}`}
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-black/25">{premium ? <GemIcon size={34} /> : <CoinIcon size={34} />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-[#d1d7db]">{premium ? 'Pièces Premium (achetées)' : 'Pièces Free (gagnées en jouant)'}</span>
            {session ? (
              <CoinAmount value={balance(currency)} premium={premium} size={22} className="text-[24px]" />
            ) : (
              <span className="block text-[15px] font-medium">Connecte-toi pour miser</span>
            )}
          </span>
          {!session && (
            <Link href="/compte" className="h-10 shrink-0 rounded-full bg-[#00a884] px-4 text-[14px] leading-10 font-semibold text-[#0b141a]">
              Compte
            </Link>
          )}
        </section>

        <section>
          <h2 className="px-5 pb-2 text-[13px] font-medium tracking-wide text-[#00a884]">Tables</h2>
          <ul className="divide-y divide-[#222d34]">
            {!premium && (
              <li>
                <TableRow
                  leading={
                    <span className="grid size-12 place-items-center rounded-2xl bg-[#2a3942] text-[#aebac1]">
                      <Icon.School size={24} />
                    </span>
                  }
                  title="Sans mise"
                  subtitle="Pour le plaisir, sans pièces en jeu"
                  action="Jouer"
                  onPlay={() => start(null)}
                />
              </li>
            )}
            {tables.map((table) => {
              const prize = potSplit(table.stake, 2, stakes.winnerShare).prize;
              const affordable = !!session && balance(table.currency) >= table.stake;
              return (
                <li key={table.id}>
                  <TableRow
                    leading={
                      <span className={`grid size-12 place-items-center rounded-2xl ${premium ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}>
                        {premium ? <GemIcon size={26} /> : <CoinIcon size={26} />}
                      </span>
                    }
                    title={
                      <span className="flex items-center gap-1.5">
                        Mise <CoinAmount value={table.stake} premium={premium} size={16} />
                      </span>
                    }
                    subtitle={
                      <>
                        Le gagnant remporte <span className="font-medium text-[#25d366]">{prize.toLocaleString('fr-FR')}</span>
                      </>
                    }
                    action={session && !affordable ? 'Solde bas' : 'Jouer'}
                    disabled={!!session && !affordable}
                    onPlay={() => start(table)}
                  />
                </li>
              );
            })}
          </ul>
          <div className="mx-4 mt-3">
            <CustomStake
              key={currency}
              currency={currency}
              balance={session ? balance(currency) : null}
              players={2}
              action="Jouer"
              onSubmit={(id) => start(stakeTable(id) ?? null)}
            />
            <p className="px-1 pt-1.5 text-[12px] text-[#8696a0]">Tu joueras contre un joueur qui a choisi le même montant.</p>
          </div>
        </section>

        <section>
          <h2 className="px-5 pt-2 pb-2 text-[13px] font-medium tracking-wide text-[#00a884]">Comment ça marche</h2>
          <ul className="mx-4 overflow-hidden rounded-[28px] bg-[#1f2c33]">
            {[
              { icon: Icon.Groups, title: 'Un contre un', text: 'Le premier joueur qui arrive à la même table' },
              { icon: Icon.Timer, title: `${ui.clockMs / 60_000} minutes chacun`, text: 'Temps écoulé : la partie est perdue' },
              { icon: Icon.Trophy, title: `${winnerPercent} % de la cagnotte`, text: 'Pour le gagnant, le reste est la commission' },
              { icon: Icon.Handshake, title: 'Match nul', text: 'Chacun récupère sa mise' },
            ].map(({ icon: RowIcon, title, text }, i) => (
              <li key={title} className="flex items-center gap-4 px-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-400">
                  <RowIcon size={22} />
                </span>
                <span className={`min-w-0 flex-1 py-3.5 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="block text-[13px] text-[#8696a0]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="px-5 pt-3 text-[12.5px] leading-relaxed text-[#8696a0]">
            Quitter la partie ou rester déconnecté plus de 30 secondes fait perdre ta mise. Si le serveur interrompt une partie, chaque mise est remboursée.
          </p>
        </section>
      </main>
      {notice}

      <Sheet open={askName} title="Ton pseudo" onClose={() => setAskName(false)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) start(null, name.trim());
          }}
        >
          <p className="text-[14px] text-[#8696a0]">C’est le nom que verra ton adversaire.</p>
          <input
            autoFocus
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Awa"
            autoComplete="nickname"
            className="h-12 border-b-2 border-[#2a3942] bg-transparent px-1 text-[18px] outline-none placeholder:text-[#8696a0]/60 focus:border-[#00a884]"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:bg-[#2a3942] disabled:text-[#8696a0]"
          >
            <Icon.Play size={22} />
            Jouer
          </button>
        </form>
      </Sheet>

      <Sheet open={!!askLogin} title="Connexion requise" onClose={() => setAskLogin(null)}>
        {askLogin && (
          <div className="flex flex-col gap-4">
            <p className="text-[14px] text-[#8696a0]">
              La mise est prise sur les pièces de ton compte. Connecte-toi : tu reviendras ici et la recherche démarrera pour cette table.
            </p>
            <Link
              href="/compte?mode=login"
              onClick={() => sessionStorage.setItem(PENDING_TABLE_KEY, askLogin.id)}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]"
            >
              <Icon.Login size={22} />
              Se connecter
            </Link>
          </div>
        )}
      </Sheet>

      {error && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="pop-in mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-[#e9edef] px-4 py-3.5 text-[14px] font-medium text-[#0b141a] shadow-2xl">
            <Icon.Info size={20} className="shrink-0 text-[#f15c6d]" />
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

function TableRow({
  leading,
  title,
  subtitle,
  action,
  disabled,
  onPlay,
}: {
  leading: React.ReactNode;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  action: string;
  disabled?: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-4 px-5 py-2">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium">{title}</span>
        <span className="block truncate text-[13px] text-[#8696a0]">{subtitle}</span>
      </span>
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        className="h-9 shrink-0 rounded-full bg-[#00a884] px-4 text-[14px] font-semibold text-[#0b141a] transition active:scale-95 disabled:bg-[#2a3942] disabled:text-[#8696a0]"
      >
        {action}
      </button>
    </div>
  );
}
