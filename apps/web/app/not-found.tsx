'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { useLang } from '@/lib/i18n';

/** Any address the app doesn't know, e.g. a mistyped or outdated link. */
export default function NotFound() {
  const { t } = useLang();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0b141a] px-6 text-center text-[#e9edef]">
      <span className="grid size-24 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
        <Icon.Search size={46} />
      </span>
      <h1 className="mt-5 text-[22px] font-semibold">{t('Page introuvable', 'Page not found')}</h1>
      <p className="mt-1.5 max-w-xs text-[14.5px] text-[#8696a0]">
        {t('Ce lien est erroné ou n’existe plus.', 'This link is wrong or no longer exists.')}
      </p>
      <Link
        href="/"
        className="mt-8 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98]"
      >
        <Icon.Home size={20} />
        {t('Retour à l’accueil', 'Back to home')}
      </Link>
    </main>
  );
}
