'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const CURRENT_KEY = 'ludo:current-path';
const PREVIOUS_KEY = 'ludo:previous-path';

const here = () => window.location.pathname + window.location.search;

/** Records each in-app page change, so a page can send the player back where they came from. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const path = here();
    const last = sessionStorage.getItem(CURRENT_KEY);
    if (last === path) return;
    if (last) sessionStorage.setItem(PREVIOUS_KEY, last);
    sessionStorage.setItem(CURRENT_KEY, path);
  }, [pathname]);
  return null;
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/(dames|awale)\/rapide/, 'Partie rapide'],
  [/^\/(dames|awale)\/salon\/./, 'Salon'],
  [/^\/(dames|awale)\/salon/, 'Salon privé'],
  [/^\/(dames|awale)\/local/, 'Sur cet écran'],
  [/^\/dames/, 'Dames'],
  [/^\/awale/, 'Awalé'],
  [/^\/rapide/, 'Partie rapide'],
  [/^\/online\/./, 'Salon'],
  [/^\/online/, 'En ligne'],
  [/^\/local/, 'Sur cet écran'],
  [/^\/ludo/, 'Ludo'],
  [/^\/profil/, 'Profil'],
  [/^\/boutique/, 'Boutique'],
  [/^\/classement/, 'Classement'],
  [/^\/tutoriel/, 'Tutoriel'],
];

/** The in-app page visited just before this one (null when the app was opened here). */
export function usePreviousPage() {
  const [previous, setPrevious] = useState<{ path: string; name: string } | null>(null);
  useEffect(() => {
    // Page effects run before the tracker's: the stored "current" page may still be the one we came from.
    const current = sessionStorage.getItem(CURRENT_KEY);
    const path = current && current !== here() ? current : sessionStorage.getItem(PREVIOUS_KEY);
    if (!path || !path.startsWith('/') || path === here()) return;
    setPrevious({ path, name: PAGE_NAMES.find(([re]) => re.test(path))?.[1] ?? 'Accueil' });
  }, []);
  return previous;
}
