'use client';

import Link from 'next/link';
import { useWallet } from '@/lib/wallet';

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-amber-900 shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: 'radial-gradient(circle at 35% 30%, #fff3b0, #f5b301 60%, #b47b00)',
      }}
    >
      ★
    </span>
  );
}

export function CoinAmount({ value, size = 18, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${className}`}>
      <CoinIcon size={size} />
      {value.toLocaleString('fr-FR')}
    </span>
  );
}

/** Current balance, linking to the shop. */
export function CoinBadge() {
  const { coins, ready } = useWallet();
  return (
    <Link
      href="/boutique"
      className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1 text-sm transition active:scale-95"
      aria-label={`${coins} pièces, ouvrir la boutique`}
    >
      <CoinAmount value={ready ? coins : 0} size={24} />
      <span className="text-white/50">🛒</span>
    </Link>
  );
}
