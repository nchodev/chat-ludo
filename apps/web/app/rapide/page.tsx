'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  TURN_TIME_MS,
  potSplit,
  stakeTable,
  type Currency,
  type MatchStatus,
  type StakeTable,
} from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { CoinAmount, CoinIcon, GemIcon } from '@/components/Coins';
import { ColorPreference } from '@/components/ColorPreference';
import { CustomStake } from '@/components/CustomStake';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { COLOR_HEX } from '@/lib/board';
import { useAdultGate } from '@/components/AdultNotice';
import { getSessionToken, refreshProfile, useProfile } from '@/lib/profile';
import { useStakeConfig } from '@/lib/stakes';
import { getSocket, getStoredName, storeName, storeRoomToken } from '@/lib/socket';

const SLOT_COLORS = [COLOR_HEX.red, COLOR_HEX.green, COLOR_HEX.yellow, COLOR_HEX.blue];
const format = (winnerPercent: number) => [
  { icon: Icon.Groups, title: '2 à 4 joueurs', text: 'Des joueurs en ligne, au hasard' },
  { icon: Icon.Bolt, title: 'Parties courtes', text: '2 pions chacun, sortie avec un 1 ou un 6' },
  { icon: Icon.Hourglass, title: `${TURN_TIME_MS / 1000} s par tour`, text: 'Après 6 dépassements, la partie est perdue' },
  { icon: Icon.Trophy, title: `${winnerPercent} % de la cagnotte`, text: 'Pour le gagnant, le reste est la commission' },
];

/** Table the player picked before being sent to sign in, started on their return. */
const PENDING_TABLE_KEY = 'ludo:pending-table';

const CURRENCY_TABS: { id: Currency; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'premium', label: 'Premium' },
];

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export default function QuickMatchPage() {
  const router = useRouter();
  const { session, profile, premiumCoins, ready } = useProfile();
  const stakes = useStakeConfig();
  const { gate, notice } = useAdultGate();
  const [name, setName] = useState('');
  const [pickedCurrency, setCurrency] = useState<Currency>('free');
  const currency: Currency = stakes.premiumEnabled ? pickedCurrency : 'free';
  /** Table being searched: null for practice, undefined when not searching. */
  const [searching, setSearching] = useState<StakeTable | null | undefined>(undefined);
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(searching !== undefined);
  const autoStarted = useRef(false);
  const [askName, setAskName] = useState(false);
  const [askLogin, setAskLogin] = useState<StakeTable | null>(null);

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
    setStatus(null);
    setSearching(table);
  };

  // "Rejouer" after a staked game comes back here with ?table=…
  useEffect(() => {
    if (!ready || autoStarted.current) return;
    autoStarted.current = true;
    const pending = sessionStorage.getItem(PENDING_TABLE_KEY);
    sessionStorage.removeItem(PENDING_TABLE_KEY);
    const requested = new URLSearchParams(window.location.search).get('table') ?? (session ? pending : null);
    if (!requested) return;
    window.history.replaceState(null, '', '/rapide');
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
      socket.emit('match:join', { name: name.trim(), auth: getSessionToken(), table: searching?.id }, (res) => {
        if (!res.ok) {
          setError(res.error ?? 'Erreur');
          setSearching(undefined);
        }
      });
    const onFound = ({ code, token }: { code: string; token: string }) => {
      storeRoomToken(code, token);
      void refreshProfile();
      router.push(`/online/${code}`);
    };
    const onCancelled = (reason: string) => {
      setError(reason);
      setSearching(undefined);
      void refreshProfile();
    };
    socket.on('match:status', setStatus);
    socket.on('match:found', onFound);
    socket.on('match:cancelled', onCancelled);
    socket.on('connect', join);
    if (socket.connected) join();
    else socket.connect();
    return () => {
      socket.off('match:status', setStatus);
      socket.off('match:found', onFound);
      socket.off('match:cancelled', onCancelled);
      socket.off('connect', join);
      socket.emit('match:leave');
    };
    // The name and table are fixed while searching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingKey, router]);

  const seconds = (at: number | null) => (at ? Math.max(0, Math.ceil((at - now) / 1000)) : null);
  const startsIn = seconds(status?.startsAt ?? null);
  const botIn = seconds(status?.botAt ?? null);
  const found = Math.max(1, status?.waiting ?? 1);

  if (searching !== undefined) {
    const premium = searching?.currency === 'premium';
    return (
      <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
        <AppBar
          title="Partie rapide"
          subtitle={searching ? `Table ${searching.currency === 'premium' ? 'Premium' : 'Free'} · mise ${searching.stake}` : 'Entraînement sans mise'}
          backHref="/ludo"
          backText="Ludo"
          backLabel="Retour à Ludo"
        />
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-8 pb-32 text-center">
          <div className="relative grid size-56 place-items-center">
            <span className="radar-ring absolute inset-0 rounded-full border-2 border-[#00a884]/50" />
            <span className="radar-ring absolute inset-0 rounded-full border-2 border-[#00a884]/50 [animation-delay:0.8s]" />
            <span className="radar-ring absolute inset-0 rounded-full border-2 border-[#00a884]/50 [animation-delay:1.6s]" />
            <span className="absolute inset-8 rounded-full bg-[#00a884]/10" />
            <span className="relative grid size-24 place-items-center rounded-full bg-gradient-to-br from-[#00a884] to-teal-700 text-[38px] font-semibold text-white shadow-2xl shadow-[#00a884]/30">
              {name.trim()[0]?.toUpperCase() ?? <Icon.Person size={44} />}
            </span>
          </div>

          <h2 className="mt-6 text-[22px] font-semibold">{startsIn !== null ? 'Adversaires trouvés' : 'Recherche d’adversaires'}</h2>
          <p className="mt-1 min-h-5 text-[14.5px] text-[#8696a0]">
            {startsIn !== null
              ? `La partie commence dans ${startsIn} s`
              : botIn !== null
                ? `Un ordinateur te rejoint dans ${botIn} s si personne n’arrive`
                : searching
                  ? 'En attente d’autres joueurs à cette table…'
                  : 'Connexion au serveur…'}
          </p>

          <div className="mt-8 flex w-full max-w-xs justify-center gap-4">
            {SLOT_COLORS.map((hex, i) => {
              const filled = i < found;
              return (
                <div key={hex} className="flex flex-col items-center gap-1.5">
                  <span
                    className={`grid size-14 place-items-center rounded-full transition-all duration-500 ${filled ? 'scale-100 text-white shadow-lg' : 'scale-90 border-2 border-dashed'}`}
                    style={filled ? { background: hex } : { borderColor: `${hex}66`, color: `${hex}99` }}
                  >
                    {filled ? i === 0 ? name.trim()[0]?.toUpperCase() : <Icon.Person size={26} /> : <Icon.Search size={22} className="animate-pulse" />}
                  </span>
                  <span className="text-[12px] text-[#8696a0]">{i === 0 ? 'Toi' : filled ? 'Trouvé' : '…'}</span>
                </div>
              );
            })}
          </div>

          {searching && (
            <div className="mt-8 grid w-full grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#1f2c33] p-3">
                <p className="text-[12px] text-[#8696a0]">Cagnotte</p>
                <CoinAmount value={potSplit(searching.stake, Math.max(2, found)).pot} premium={premium} size={20} className="mt-1 text-[18px]" />
              </div>
              <div className="rounded-2xl bg-[#1f2c33] p-3">
                <p className="text-[12px] text-[#8696a0]">Gain du vainqueur</p>
                <CoinAmount
                  value={potSplit(searching.stake, Math.max(2, found)).prize}
                  premium={premium}
                  size={20}
                  className="mt-1 text-[18px] text-[#25d366]"
                />
              </div>
              <p className="col-span-2 text-[12.5px] text-[#8696a0]">
                Ta mise n’est prise qu’au lancement de la partie. Annuler avant ne coûte rien.
              </p>
            </div>
          )}
        </main>

        <BottomBar error={error}>
          <button
            type="button"
            onClick={() => setSearching(undefined)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[16px] font-semibold text-[#e9edef] transition active:bg-white/5"
          >
            <Icon.Close size={22} />
            Annuler la recherche
          </button>
        </BottomBar>
      </div>
    );
  }

  const tables = stakes.tables.filter((t) => t.currency === currency);
  const premium = currency === 'premium';

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title="Partie rapide" subtitle="Tables avec mise" backHref="/ludo" backText="Ludo" backLabel="Retour à Ludo" />

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
                className={`relative flex h-12 flex-1 items-center justify-center gap-2 text-[14.5px] font-semibold uppercase tracking-wide transition ${
                  active ? 'text-[#00a884]' : 'text-[#8696a0]'
                }`}
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
          className={`mx-4 flex items-center gap-4 rounded-[28px] p-4 ${
            premium ? 'bg-gradient-to-br from-violet-600/35 to-indigo-700/15' : 'bg-gradient-to-br from-amber-500/30 to-orange-600/10'
          }`}
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-black/25">
            {premium ? <GemIcon size={34} /> : <CoinIcon size={34} />}
          </span>
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

        {premium && (
          <p className="mx-4 flex items-start gap-3 rounded-2xl bg-[#1f2c33] px-4 py-3 text-[13.5px] text-[#d1d7db]">
            <Icon.Info size={20} className="mt-px shrink-0 text-[#53bdeb]" />
            Les pièces Premium s’achètent et se retirent avec Wave, depuis ton Portefeuille. Les pièces Free ne peuvent pas être utilisées ici.
          </p>
        )}

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
                  title="Entraînement"
                  subtitle="Sans mise · un ordinateur complète si besoin"
                  action="Jouer"
                  onPlay={() => start(null)}
                />
              </li>
            )}
            {tables.map((table) => {
              const low = potSplit(table.stake, 2).prize;
              const high = potSplit(table.stake, 4).prize;
              const affordable = !!session && balance(table.currency) >= table.stake;
              return (
                <li key={table.id}>
                  <TableRow
                    leading={
                      <span
                        className={`grid size-12 place-items-center rounded-2xl ${premium ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}
                      >
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
                        Gain <span className="font-medium text-[#25d366]">{low.toLocaleString('fr-FR')}</span> à{' '}
                        <span className="font-medium text-[#25d366]">{high.toLocaleString('fr-FR')}</span> · 2 à 4 joueurs
                      </>
                    }
                    action={affordable ? 'Jouer' : session ? 'Solde bas' : 'Jouer'}
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
              players={[2, 4]}
              action="Jouer"
              onSubmit={(id) => start(stakeTable(id) ?? null)}
            />
            <p className="px-1 pt-1.5 text-[12px] text-[#8696a0]">Tu joueras contre ceux qui ont choisi le même montant.</p>
          </div>
        </section>

        <section>
          <h2 className="px-5 pt-2 pb-2 text-[13px] font-medium tracking-wide text-[#00a884]">Ta couleur</h2>
          <div className="mx-4 rounded-[28px] bg-[#1f2c33] p-4">
            <ColorPreference />
          </div>
        </section>

        <section>
          <h2 className="px-5 pt-2 pb-2 text-[13px] font-medium tracking-wide text-[#00a884]">Comment ça marche</h2>
          <ul className="mx-4 overflow-hidden rounded-[28px] bg-[#1f2c33]">
            {format(Math.round(stakes.winnerShare * 100)).map(({ icon: FormatIcon, title, text }, i) => (
              <li key={title} className="flex items-center gap-4 px-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-400">
                  <FormatIcon size={22} />
                </span>
                <span className={`min-w-0 flex-1 py-3.5 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="block text-[13px] text-[#8696a0]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="px-5 pt-3 text-[12.5px] leading-relaxed text-[#8696a0]">
            Quitter une partie ou dépasser le temps 6 fois fait perdre ta mise. Si une partie est interrompue par le serveur, chaque
            mise est remboursée.
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
          <p className="text-[14px] text-[#8696a0]">C’est le nom que verront les autres joueurs pendant la partie.</p>
          <label className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#2a3942] text-[20px] font-semibold text-[#aebac1]">
              {name.trim()[0]?.toUpperCase() ?? <Icon.Person size={24} />}
            </span>
            <input
              autoFocus
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Awa"
              autoComplete="nickname"
              enterKeyHint="go"
              className="h-12 min-w-0 flex-1 border-b-2 border-[#2a3942] bg-transparent px-1 text-[18px] text-[#e9edef] outline-none placeholder:text-[#8696a0]/60 focus:border-[#00a884]"
            />
          </label>
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:bg-[#2a3942] disabled:text-[#8696a0]"
          >
            <Icon.Play size={22} />
            Jouer
          </button>
          <Link href="/compte" className="text-center text-[13px] text-[#8696a0]">
            <span className="font-medium text-[#00a884]">Crée un compte</span> pour garder tes pièces et apparaître au classement.
          </Link>
        </form>
      </Sheet>

      <Sheet open={!!askLogin} title="Connexion requise" onClose={() => setAskLogin(null)}>
        {askLogin && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-2xl ${askLogin.currency === 'premium' ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}
              >
                {askLogin.currency === 'premium' ? <GemIcon size={24} /> : <CoinIcon size={24} />}
              </span>
              <span className="min-w-0 flex-1 text-[14px] text-[#d1d7db]">
                <span className="flex items-center gap-1.5 text-[15px] font-medium text-[#e9edef]">
                  Table à <CoinAmount value={askLogin.stake} premium={askLogin.currency === 'premium'} size={16} />
                </span>
                La mise est prise sur les pièces de ton compte.
              </span>
            </div>
            <p className="text-[14px] text-[#8696a0]">
              Connecte-toi ou crée un compte : tu reviendras ici et la recherche de joueurs démarrera pour cette table.
            </p>
            <Link
              href="/compte?mode=login"
              onClick={() => sessionStorage.setItem(PENDING_TABLE_KEY, askLogin.id)}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]"
            >
              <Icon.Login size={22} />
              Se connecter
            </Link>
            <Link
              href="/compte"
              onClick={() => sessionStorage.setItem(PENDING_TABLE_KEY, askLogin.id)}
              className="flex h-12 items-center justify-center rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#e9edef]"
            >
              Créer un compte
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

function BottomBar({ error, children }: { error: string | null; children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#222d34] bg-[#0b141a] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-lg">
        {error && (
          <p className="pop-in mb-2 flex items-center justify-center gap-1.5 text-center text-[13px] text-[#f15c6d]">
            <Icon.Info size={16} className="shrink-0" />
            {error}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
