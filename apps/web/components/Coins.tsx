'use client';

import Link from 'next/link';
import { useProfile } from '@/lib/profile';
import { Icon } from './Icons';
import { useLang } from '@/lib/i18n';

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

/** Purchased coin, used at Premium tables. */
export function GemIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <defs>
        <linearGradient id="gem-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#5b21b6" />
        </linearGradient>
      </defs>
      <path d="M6 3h12l4 6-10 12L2 9l4-6z" fill="url(#gem-fill)" />
      <path d="M2 9h20M8.5 3 7 9l5 12 5-12-1.5-6" fill="none" stroke="#ede9fe" strokeOpacity="0.55" strokeWidth="1" />
    </svg>
  );
}

export function CoinAmount({
  value,
  size = 18,
  className = '',
  premium = false,
}: {
  value: number;
  size?: number;
  className?: string;
  premium?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${className}`}>
      {premium ? <GemIcon size={size} /> : <CoinIcon size={size} />}
      {value.toLocaleString('fr-FR')}
    </span>
  );
}

/** Current balance, linking to the shop. */
export function CoinBadge() {
  const { profile, ready } = useProfile();
  const coins = ready ? profile.coins : 0;
  const { t } = useLang();
  return (
    <Link
      href="/boutique"
      className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1 text-sm transition active:scale-95"
      aria-label={t(`${coins} pièces, ouvrir la boutique`, `${coins} coins, open the shop`)}
    >
      <CoinAmount value={coins} size={24} />
      <Icon.Cart size={18} className="text-white/50" />
    </Link>
  );
}
