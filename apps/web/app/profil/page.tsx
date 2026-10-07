'use client';

import Link from 'next/link';
import { ACHIEVEMENTS, levelInfo } from '@ludo/engine';
import { CoinAmount } from '@/components/Coins';
import { DailyCard } from '@/components/DailyCard';
import { LevelBar } from '@/components/LevelBar';
import { logout, useProfile } from '@/lib/profile';

export default function ProfilePage() {
  const { profile, session, rank, ready } = useProfile();
  const { level, current, needed } = levelInfo(profile.xp);
  const s = profile.stats;
  const winRate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;

  const stats: { label: string; value: string | number; icon: string }[] = [
    { label: 'Parties', value: s.games, icon: '🎲' },
    { label: 'Victoires', value: s.wins, icon: '🏆' },
    { label: 'Taux de victoire', value: `${winRate} %`, icon: '📈' },
    { label: 'Captures', value: s.captures, icon: '⚔️' },
    { label: 'Pions rentrés', value: s.pawnsHome, icon: '🏠' },
    { label: 'Meilleure série', value: s.bestWinStreak, icon: '🔥' },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Accueil">
          ←
        </Link>
        <h1 className="flex-1 text-2xl font-bold">Profil</h1>
        <CoinAmount value={ready ? profile.coins : 0} size={22} />
      </header>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-4">
          <span className="relative grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-indigo-600 text-3xl font-bold shadow-lg">
            {session ? session.username[0].toUpperCase() : '👤'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{session?.username ?? 'Invité'}</p>
            <p className="text-sm text-white/60">
              Niveau {level}
              {rank && ` · ${rank}ᵉ au classement`}
            </p>
          </div>
        </div>
        <div>
          <LevelBar xp={profile.xp} />
          <p className="mt-1 text-right text-xs text-white/50">
            {current} / {needed} XP avant le niveau {level + 1}
          </p>
        </div>
        {session ? (
          <button type="button" onClick={() => void logout()} className="btn btn-ghost text-sm">
            Se déconnecter
          </button>
        ) : (
          <div className="rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-100">
            Ta progression est enregistrée seulement sur cet appareil.{' '}
            <Link href="/compte" className="font-bold underline">
              Crée un compte
            </Link>{' '}
            pour la garder partout et apparaître au classement.
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">📊 Statistiques</h2>
        <div className="grid grid-cols-3 gap-2">
          {stats.map((st) => (
            <div key={st.label} className="rounded-2xl bg-white/5 p-2.5 text-center">
              <div className="text-lg">{st.icon}</div>
              <div className="text-lg font-bold tabular-nums">{st.value}</div>
              <div className="text-[11px] leading-tight text-white/50">{st.label}</div>
            </div>
          ))}
        </div>
      </section>

      <DailyCard />

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">🏅 Badges</h2>
          <span className="text-xs text-white/50">
            {profile.achievements.length} / {ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = profile.achievements.includes(a.id);
            return (
              <div
                key={a.id}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2.5 text-center ${
                  unlocked ? 'bg-amber-400/15 ring-1 ring-amber-300/40' : 'bg-white/5 opacity-60'
                }`}
                title={a.description}
              >
                <span className={`text-3xl ${unlocked ? '' : 'grayscale'}`}>{unlocked ? a.icon : '🔒'}</span>
                <span className="text-xs leading-tight font-semibold">{a.name}</span>
                <span className="text-[10px] leading-tight text-white/50">{a.description}</span>
                {!unlocked && <CoinAmount value={a.coins} size={12} className="text-[10px] text-amber-200" />}
              </div>
            );
          })}
        </div>
      </section>

      <Link href="/classement" className="btn btn-light">
        🏆 Voir le classement
      </Link>
    </main>
  );
}
