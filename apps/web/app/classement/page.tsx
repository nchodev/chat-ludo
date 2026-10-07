'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useProfile } from '@/lib/profile';

interface Row {
  rank: number;
  username: string;
  xp: number;
  wins: number;
  level: number;
}

interface Leaderboard {
  players: Row[];
  you: { username: string; rank: number; xp: number; level: number } | null;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const { session, ready } = useProfile();
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    api<Leaderboard>('/leaderboard', { token: session?.token })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [ready, session]);

  const youInList = data?.you && data.players.some((p) => p.username === data.you!.username);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Accueil">
          ←
        </Link>
        <h1 className="flex-1 text-2xl font-bold">Classement</h1>
      </header>

      {!session && ready && (
        <p className="card p-3 text-center text-sm text-white/70">
          <Link href="/compte" className="font-bold text-emerald-300">
            Crée un compte
          </Link>{' '}
          pour apparaître dans le classement.
        </p>
      )}

      {error && <p className="rounded-2xl bg-red-500/20 p-3 text-center text-sm text-red-200">{error}</p>}
      {!data && !error && <div className="mx-auto mt-10 size-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />}

      {data && (
        <section className="card overflow-hidden">
          {data.players.length === 0 && <p className="p-6 text-center text-white/60">Personne pour l’instant. Sois le premier !</p>}
          <ol>
            {data.players.map((p) => {
              const you = p.username === session?.username;
              return (
                <li
                  key={p.username}
                  className={`flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0 ${you ? 'bg-emerald-400/15' : ''}`}
                >
                  <span className="w-8 text-center text-lg font-bold tabular-nums">{MEDALS[p.rank - 1] ?? p.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {p.username}
                      {you && <span className="ml-1 text-xs text-emerald-300">(toi)</span>}
                    </span>
                    <span className="block text-xs text-white/50">
                      {p.wins} victoire{p.wins > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-sky-300">Niv. {p.level}</span>
                    <span className="block text-[11px] text-white/50 tabular-nums">{p.xp} XP</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {data.you && !youInList && (
            <div className="flex items-center gap-3 border-t border-white/10 bg-emerald-400/15 px-4 py-2.5">
              <span className="w-8 text-center font-bold tabular-nums">{data.you.rank}</span>
              <span className="flex-1 font-semibold">{data.you.username} (toi)</span>
              <span className="text-sm font-bold text-sky-300">Niv. {data.you.level}</span>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
