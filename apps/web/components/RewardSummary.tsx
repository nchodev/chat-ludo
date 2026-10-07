'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { GameState, Reward } from '@ludo/engine';
import { CoinAmount, CoinIcon } from './Coins';
import { rewardLineLabel } from '@/lib/labels';
import { useWallet } from '@/lib/wallet';

const COUNT_UP_MS = 900;

/** Coins earned at the end of a game, counting up, with the detail of each bonus. */
export function RewardSummary({ state, reward }: { state: GameState; reward: Reward }) {
  const { coins } = useWallet();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setShown(Math.round(reward.total * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [reward.total]);

  return (
    <div className="mt-4 rounded-2xl bg-amber-400/10 p-3 ring-1 ring-amber-300/30">
      <div className="flex items-center justify-center gap-2 text-3xl font-bold text-amber-300">
        +{shown}
        <CoinIcon size={30} />
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-left text-[13px] text-white/75">
        {reward.lines.map((line, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{rewardLineLabel(state, line)}</span>
            <span className="shrink-0 font-semibold text-amber-200">+{line.coins}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-sm">
        <span className="flex items-center gap-1.5 text-white/60">
          Total : <CoinAmount value={coins} size={16} className="text-white" />
        </span>
        <Link href="/boutique" className="font-semibold text-amber-300">
          Boutique ›
        </Link>
      </div>
    </div>
  );
}
