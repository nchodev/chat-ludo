'use client';

import { Fragment, useLayoutEffect, type ReactNode } from 'react';
import { markLangReady, useLang } from '@/lib/i18n';

/**
 * Shows the app in the device's language once the server's French page has hydrated, and again
 * whenever the language changes: the whole app is drawn anew, so texts picked with `tr()` change too.
 */
export function LangRoot({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  useLayoutEffect(markLangReady, []);
  return <Fragment key={lang}>{children}</Fragment>;
}
