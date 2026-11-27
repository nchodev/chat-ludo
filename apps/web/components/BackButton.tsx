'use client';

import Link from 'next/link';
import { useLang } from '@/lib/i18n';
import { useState, useSyncExternalStore, type PointerEvent } from 'react';

type Platform = 'ios' | 'android';

function detectPlatform(): Platform {
  const { userAgent, maxTouchPoints, platform } = navigator;
  const iPadOS = platform === 'MacIntel' && maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(userAgent) || iPadOS ? 'ios' : 'android';
}

const noSubscribe = () => () => {};

/** iOS gets its own navigation look; everything else gets Material (Android). */
export function usePlatform(): Platform {
  return useSyncExternalStore(noSubscribe, detectPlatform, () => 'android');
}

interface BackButtonProps {
  /** Where to go; omit and pass `onClick` when leaving needs confirmation. */
  href?: string;
  onClick?: () => void;
  /** Accessible name, e.g. "Retour à l'accueil". */
  label: string;
  /** Text shown next to the chevron on iOS. */
  text?: string;
  /** Hides the iOS text, for crowded headers. */
  compact?: boolean;
  className?: string;
}

/**
 * Platform back button: a round Material icon button with a ripple on Android,
 * a chevron with a label that dims when pressed on iOS.
 */
export function BackButton({ href, onClick, label, text: givenText, compact = false, className = '' }: BackButtonProps) {
  const platform = usePlatform();
  const { t } = useLang();
  const text = givenText ?? t('Retour', 'Back');
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (platform !== 'android') return;
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() });
  };

  const content =
    platform === 'ios' ? (
      <>
        <svg viewBox="0 0 12 21" className="h-[21px] w-3 shrink-0" aria-hidden>
          <path d="M10.5 1.5 1.5 10.5l9 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!compact && <span className="max-w-28 truncate text-[17px] leading-none">{text}</span>}
      </>
    ) : (
      <>
        <svg viewBox="0 0 24 24" className="relative size-6" fill="currentColor" aria-hidden>
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        {ripple && (
          <span
            key={ripple.key}
            className="back-ripple pointer-events-none absolute size-12 rounded-full bg-current"
            style={{ left: ripple.x - 24, top: ripple.y - 24 }}
            onAnimationEnd={() => setRipple(null)}
          />
        )}
      </>
    );

  const classes =
    platform === 'ios'
      ? `-ml-1 flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-1 text-[#25d366] transition-opacity duration-150 active:opacity-40 ${className}`
      : `relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full text-current transition-colors duration-150 active:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none ${className}`;

  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={classes} onPointerDown={onPointerDown} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className={classes} onPointerDown={onPointerDown} onClick={onClick}>
      {content}
    </button>
  );
}
