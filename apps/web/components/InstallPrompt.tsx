'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const HIDE_KEY = 'ludo:install-hide';
const HIDE_MS = 14 * 24 * 60 * 60_000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function hiddenRecently() {
  const at = Number(localStorage.getItem(HIDE_KEY) ?? 0);
  return Date.now() - at < HIDE_MS;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isMobile() {
  return isIos() || /android/i.test(navigator.userAgent);
}

function isInstalled() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** Offers to install LuChat on the home screen. Android gets the system dialog; iPhone gets the Share steps. */
export function InstallPrompt() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled() || hiddenRecently()) return;
    if (isIos()) {
      setIos(true);
      setVisible(true);
    } else if (isMobile()) {
      setVisible(true);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!visible || pathname !== '/') return null;

  const hide = () => {
    localStorage.setItem(HIDE_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === 'accepted') setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-md px-3">
      <div className="relative flex min-w-0 items-center gap-3 rounded-2xl bg-[#1f2c33] py-3 pr-10 pl-3 shadow-xl ring-1 ring-white/10">
        <img src="/icon-192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#e9edef]">Installer LuChat</p>
          <p className="text-xs leading-snug text-[#8696a0]">
            {ios
              ? 'Dans Safari : Partager, puis « Sur l’écran d’accueil ».'
              : prompt
                ? 'Ajoute le jeu à ton écran d’accueil, comme une application.'
                : 'Menu du navigateur, puis « Installer l’application ».'}
          </p>
        </div>
        {prompt && !ios && (
          <button type="button" onClick={install} className="shrink-0 rounded-full bg-[#00a884] px-3 py-1.5 text-sm font-semibold text-[#0b141a]">
            Installer
          </button>
        )}
        <button type="button" onClick={hide} aria-label="Plus tard" className="absolute top-1.5 right-1.5 grid size-8 place-items-center text-[#e9edef]">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
