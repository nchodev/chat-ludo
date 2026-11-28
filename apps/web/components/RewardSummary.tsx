'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, DAILY_CHALLENGES, WEEKLY_QUESTS, levelInfo, type GameState, type ProgressSummary } from '@ludo/engine';
import { CoinAmount, CoinIcon } from './Coins';
import { LevelBar } from './LevelBar';
import { rewardLineLabel } from '@/lib/labels';
import { useProfile } from '@/lib/profile';
import { useLang } from '@/lib/i18n';

const COUNT_UP_MS = 900;

function useCountUp(target: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setShown(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/** What the player earned at the end of a game: coins, XP, challenges, badges and level. */
export function RewardSummary({ state, summary }: { state: GameState; summary: ProgressSummary }) {
  const { profile } = useProfile();
  const coins = useCountUp(summary.coins);
  const { t } = useLang();

  const lines: { label: string; coins: number }[] = [
    ...(summary.reward?.lines ?? []).map((line) => ({ label: rewardLineLabel(state, line), coins: line.coins })),
    ...summary.challenges.map((c) => {
      const challenge = DAILY_CHALLENGES.find((d) => d.id === c.id);
      return { label: t(`Défi réussi : ${challenge?.label ?? c.id}`, `Challenge done: ${challenge?.labelEn ?? c.id}`), coins: c.coins };
    }),
    ...(summary.quests ?? []).map((q) => {
      const quest = WEEKLY_QUESTS.find((w) => w.id === q.id);
      return { label: t(`Défi de la semaine : ${quest?.label ?? q.id}`, `Weekly challenge: ${quest?.labelEn ?? q.id}`), coins: q.coins };
    }),
    ...summary.achievements.map((a) => {
      const achievement = ACHIEVEMENTS.find((x) => x.id === a.id);
      return { label: `Badge ${achievement?.icon ?? ''} ${(achievement && t(achievement.name, achievement.nameEn)) ?? a.id}`, coins: a.coins };
    }),
    ...(summary.levelUpCoins > 0 ? [{ label: t(`Niveau ${summary.levelAfter} atteint !`, `Level ${summary.levelAfter} reached!`), coins: summary.levelUpCoins }] : []),
  ];

  return (
    <div className="mt-4 rounded-2xl bg-amber-400/10 p-3 text-left ring-1 ring-amber-300/30">
      {summary.coins > 0 ? (
        <div className="flex items-center justify-center gap-2 text-3xl font-bold text-amber-300">
          +{coins}
          <CoinIcon size={30} />
        </div>
      ) : (
        <p className="text-center text-sm text-white/60">{t('Pas de pièces cette fois : gagne pour en remporter !', 'No coins this time: win to earn some!')}</p>
      )}
      {lines.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[13px] text-white/75">
          {lines.map((line, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{line.label}</span>
              <span className="shrink-0 font-semibold text-amber-200">+{line.coins}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-white/60">
          <span>
            {t('Niveau', 'Level')} {levelInfo(profile.xp).level}
            {summary.levelAfter > summary.levelBefore && <span className="ml-1 font-bold text-emerald-300">{t('▲ niveau supérieur !', '▲ level up!')}</span>}
          </span>
          <span className="font-semibold text-sky-300">+{summary.xp} XP</span>
        </div>
        <LevelBar xp={profile.xp} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-sm">
        <span className="flex items-center gap-1.5 text-white/60">
          {t('Total :', 'Total:')} <CoinAmount value={profile.coins} size={16} className="text-white" />
        </span>
        <Link href="/boutique" className="font-semibold text-amber-300">
          {t('Boutique ›', 'Shop ›')}
        </Link>
      </div>
    </div>
  );
}
