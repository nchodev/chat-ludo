import type { ReactNode } from 'react';
import { BackButton } from './BackButton';

/** Top app bar of secondary screens: back button, title and optional subtitle. */
export function AppBar({
  title,
  subtitle,
  backHref,
  backText,
  backLabel,
  trailing,
}: {
  title: string;
  subtitle?: ReactNode;
  backHref: string;
  backText: string;
  backLabel: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 bg-[#1f2c33] pt-[env(safe-area-inset-top)] shadow-md">
      <div className="mx-auto flex h-16 max-w-lg items-center gap-1 px-1">
        <BackButton href={backHref} label={backLabel} text={backText} />
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-[20px] leading-tight font-medium">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-[#8696a0]">{subtitle}</p>}
        </div>
        {trailing}
      </div>
    </header>
  );
}
