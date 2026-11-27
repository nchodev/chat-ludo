/** Shared by the root layout (server) and lib/appLock.ts (client): where the lock lives and how it hides the app. */
export const APP_LOCK_STORAGE_KEY = 'luchat.appLock';
/** Set on <html> while the app is locked; globals.css hides everything but the lock screen. */
export const LOCKED_ATTRIBUTE = 'data-app-locked';

/** Run before the first paint: hides the app at once when the lock is on. */
export const EARLY_LOCK_SCRIPT = `try{if(localStorage.getItem('${APP_LOCK_STORAGE_KEY}'))document.documentElement.setAttribute('${LOCKED_ATTRIBUTE}','')}catch(e){}`;
