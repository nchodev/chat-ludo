'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MatchStatus } from '@ludo/engine';
import { getSessionToken, useProfile } from '@/lib/profile';
import { getSocket, getStoredName, storeName, storeRoomToken } from '@/lib/socket';

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
  const { session } = useProfile();
  const [name, setName] = useState('');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(searching);

  useEffect(() => setName(session?.username ?? getStoredName()), [session]);

  useEffect(() => {
    if (!searching) return;
    const socket = getSocket();
    const join = () =>
      socket.emit('match:join', { name: name.trim(), auth: getSessionToken() }, (res) => {
        if (!res.ok) {
          setError(res.error ?? 'Erreur');
          setSearching(false);
        }
      });
    const onFound = ({ code, token }: { code: string; token: string }) => {
      storeRoomToken(code, token);
      router.push(`/online/${code}`);
    };
    socket.on('match:status', setStatus);
    socket.on('match:found', onFound);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('match:status', setStatus);
      socket.off('match:found', onFound);
      socket.off('connect', join);
      socket.emit('match:leave');
    };
    // The name is fixed while searching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, router]);

  const start = () => {
    if (!name.trim()) return setError('Choisis d’abord un pseudo.');
    storeName(name.trim());
    setError(null);
    setStatus(null);
    setSearching(true);
  };

  const seconds = (at: number | null) => (at ? Math.max(0, Math.ceil((at - now) / 1000)) : null);
  const startsIn = seconds(status?.startsAt ?? null);
  const botIn = seconds(status?.botAt ?? null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Menu">
          ←
        </Link>
        <h1 className="text-xl font-bold">Partie rapide</h1>
      </header>

      <section className="card flex flex-col gap-2 p-4">
        <label htmlFor="pseudo" className="text-sm font-semibold text-white/70">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          readOnly={!!session || searching}
          placeholder="Ex : Awa"
          className="rounded-2xl bg-black/25 px-4 py-3 text-lg font-medium outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
        />
        {!session && (
          <p className="text-xs text-white/50">
            <Link href="/compte" className="font-semibold text-emerald-300">
              Crée un compte
            </Link>{' '}
            pour garder tes pièces et apparaître au classement.
          </p>
        )}
      </section>

      <section className="card flex flex-col items-center gap-4 p-6 text-center">
        {searching ? (
          <>
            <div className="relative grid size-28 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
              <span className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-5xl shadow-lg">
                🎲
              </span>
            </div>
            <div>
              <p className="text-lg font-bold">
                {status && status.waiting >= 2
                  ? `${status.waiting} joueurs trouvés !`
                  : 'Recherche d’adversaires…'}
              </p>
              <p className="text-sm text-white/60">
                {startsIn !== null
                  ? `La partie commence dans ${startsIn} s`
                  : botIn !== null
                    ? `Un ordinateur te rejoint dans ${botIn} s si personne n’arrive`
                    : 'Connexion au serveur…'}
              </p>
            </div>
            <button type="button" onClick={() => setSearching(false)} className="btn btn-ghost">
              Annuler
            </button>
          </>
        ) : (
          <>
            <span className="text-5xl">⚡</span>
            <div>
              <h2 className="font-bold">Affronte des joueurs du monde entier</h2>
              <p className="text-sm text-white/60">
                Parties courtes : 2 pions chacun, sortie avec un 1 ou un 6. De 2 à 4 joueurs.
              </p>
            </div>
            <button type="button" onClick={start} className="btn btn-primary w-full">
              Trouver une partie
            </button>
          </>
        )}
      </section>

      {error && <p className="pop-in rounded-2xl bg-red-500/20 p-3 text-center text-sm font-medium text-red-200">{error}</p>}
    </main>
  );
}
