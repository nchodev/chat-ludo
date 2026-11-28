'use client';

import { useSyncExternalStore } from 'react';

/**
 * Language of the app. Texts are written in both languages where they are used:
 *   const { t } = useLang();  t('Jeux', 'Games')
 * so a screen reads in context and nothing has to be kept in sync in a separate dictionary.
 * Outside React (helpers building messages), use `tr()` the same way.
 */
export type Lang = 'fr' | 'en';

export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'fr', label: 'FR', name: 'Français' },
  { id: 'en', label: 'EN', name: 'English' },
];

const KEY = 'ludo:lang';
const listeners = new Set<() => void>();
let current: Lang | null = null;
/**
 * False during the first render in the browser: pages come from the server in French, so that
 * render must be French too or React throws it away. `LangRoot` then shows the chosen language.
 */
let ready = false;

function isLang(value: unknown): value is Lang {
  return value === 'fr' || value === 'en';
}

/** The saved choice, else the phone's language: English phones get English, everyone else French. */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked: fall back to the phone's language */
  }
  return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language) ? 'en' : 'fr';
}

/** The current language (French on the server and until the page has hydrated). */
export function getLang(): Lang {
  if (typeof window === 'undefined' || !ready) return 'fr';
  if (!current) {
    current = detect();
    document.documentElement.lang = current;
  }
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* the choice just won't survive a reload */
  }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

/** Called once the page has hydrated: switches to the device's language. */
export function markLangReady() {
  if (ready) return;
  ready = true;
  if (getLang() !== 'fr') listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Picks the text of the current language, outside React. */
export function tr<T>(fr: T, en: T): T {
  return getLang() === 'en' ? en : fr;
}

/** Locale for dates and numbers. */
export function localeOf(lang: Lang): string {
  return lang === 'en' ? 'en-GB' : 'fr-FR';
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'fr' as Lang);
  return {
    lang,
    locale: localeOf(lang),
    setLang,
    /** The French or English text, whichever the app is in. Works with strings and JSX. */
    t: <T,>(fr: T, en: T): T => (lang === 'en' ? en : fr),
  };
}
