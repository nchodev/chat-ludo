'use client';

import { useEffect, useState } from 'react';
import {
  LOGIN_REWARDS,
  dailyChallenges,
  dailyState,
  loginBonusAvailable,
  nextLoginStreak,
  utcDay,
} from '@ludo/engine';
import { CoinAmount, CoinIcon } from './Coins';
import { claimDailyBonus, useProfile } from '@/lib/profile';
import { sfx } from '@/lib/sound';

function untilMidnightUtc(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.ceil((next - now.getTime()) / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
}

/** Daily login bonus and the day's three challenges. */
export function DailyCard() {
  const { profile, ready } = useProfile();
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDay(utcDay()), []);
  if (!ready || !day) return <section className="card h-48 animate-pulse p-4" />;

  const available = loginBonusAvailable(profile, day);
  const streak = available ? nextLoginStreak(profile, day) : profile.login.streak;
  const cycleDay = ((streak - 1) % LOGIN_REWARDS.length) + 1;
  const daily = dailyState(profile, day);

  const claim = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { coins } = await claimDailyBonus();
      sfx.finish();
      setMessage(`+${coins} pièces récupérées !`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">🎁 Bonus du jour</h2>
          <span className="text-xs text-white/50">Série : {available ? streak - 1 : streak} j</span>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {LOGIN_REWARDS.map((coins, i) => {
            const n = i + 1;
            const claimed = n < cycleDay || (!available && n === cycleDay);
            const today = n === cycleDay && available;
            return (
              <div
                key={n}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] ${
                  today ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-200' : claimed ? 'bg-emerald-500/25 text-emerald-100' : 'bg-white/5 text-white/60'
                }`}
              >
                <span className="font-semibold">J{n}</span>
                {claimed ? <span className="text-sm leading-[18px]">✓</span> : <CoinIcon size={18} />}
                <span className="font-bold">{coins}</span>
              </div>
            );
          })}
        </div>
        {available ? (
          <button type="button" onClick={claim} disabled={busy} className="btn btn-primary mt-3 w-full">
            Récupérer <CoinAmount value={LOGIN_REWARDS[cycleDay - 1]} size={18} />
          </button>
        ) : (
          <p className="mt-2 text-center text-xs text-white/50">Reviens demain pour continuer ta série !</p>
        )}
        {message && <p className="pop-in mt-2 text-center text-sm font-semibold text-amber-200">{message}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">🎯 Défis du jour</h2>
          <span className="text-xs text-white/50">Nouveaux dans {untilMidnightUtc()}</span>
        </div>
        <ul className="mt-2 flex flex-col gap-2">
          {dailyChallenges(day).map((c) => {
            const done = daily.done.includes(c.id);
            const progress = Math.min(c.goal, daily.progress[c.id] ?? 0);
            return (
              <li key={c.id} className={`rounded-2xl p-2.5 ${done ? 'bg-emerald-500/15' : 'bg-white/5'}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{done ? '✅' : c.icon}</span>
                  <span className={`min-w-0 flex-1 font-medium ${done ? 'text-white/60 line-through' : ''}`}>{c.label}</span>
                  <span className="text-xs text-white/60 tabular-nums">
                    {progress}/{c.goal}
                  </span>
                  <CoinAmount value={c.coins} size={14} className="text-xs text-amber-200" />
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${done ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    style={{ width: `${(progress / c.goal) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
