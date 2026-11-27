'use client';

import { useSyncExternalStore } from 'react';
import { APP_LOCK_STORAGE_KEY as STORAGE_KEY, LOCKED_ATTRIBUTE } from './appLockScript';

/**
 * Fingerprint (or face) lock of the app on this device, like a messaging app's screen lock.
 *
 * It uses WebAuthn with the phone's own authenticator: turning it on creates a credential that only
 * this phone's fingerprint sensor can use, and unlocking asks the sensor for it. Nothing is sent to
 * the server: it hides the app from someone holding the unlocked phone, it does not replace the
 * account password. Signing out turns it off.
 */


/** Delays to lock again; `label` is [French, English]. */
export const LOCK_DELAYS = [
  { ms: 0, label: ['Immédiatement', 'Immediately'] },
  { ms: 60_000, label: ['Après 1 minute', 'After 1 minute'] },
  { ms: 5 * 60_000, label: ['Après 5 minutes', 'After 5 minutes'] },
  { ms: 30 * 60_000, label: ['Après 30 minutes', 'After 30 minutes'] },
] as const;

interface LockSettings {
  credentialId: string;
  /** How long the app may stay in the background before it locks again. */
  delayMs: number;
}

interface LockState {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  delayMs: number;
}


function readSettings(): LockSettings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<LockSettings> | null;
    if (!raw || typeof raw.credentialId !== 'string' || !raw.credentialId) return null;
    return { credentialId: raw.credentialId, delayMs: typeof raw.delayMs === 'number' ? raw.delayMs : 0 };
  } catch {
    return null;
  }
}

function writeSettings(settings: LockSettings | null) {
  try {
    if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the lock simply can't be kept.
  }
}

let state: LockState = { ready: false, enabled: false, locked: false, delayMs: 0 };
const listeners = new Set<() => void>();
const SERVER_STATE: LockState = state;

function set(patch: Partial<LockState>) {
  state = { ...state, ...patch };
  if (typeof document !== 'undefined') {
    if (state.locked) document.documentElement.setAttribute(LOCKED_ATTRIBUTE, '');
    else document.documentElement.removeAttribute(LOCKED_ATTRIBUTE);
  }
  for (const listener of listeners) listener();
}

let hiddenAt: number | null = null;
let initialized = false;
/**
 * A fingerprint prompt is open. On some phones it sends the page to the background: that must not
 * lock the app again while the owner is unlocking it.
 */
let ceremony = false;

async function withCeremony<T>(run: () => Promise<T>): Promise<T> {
  ceremony = true;
  try {
    return await run();
  } finally {
    ceremony = false;
    hiddenAt = null;
  }
}

function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const settings = readSettings();
  set({ ready: true, enabled: !!settings, locked: !!settings, delayMs: settings?.delayMs ?? 0 });
  document.addEventListener('visibilitychange', () => {
    if (!state.enabled || ceremony) return;
    if (document.visibilityState === 'hidden') {
      // Nothing to wait for: lock now, so the app switcher's preview is already hidden.
      if (state.delayMs === 0) set({ locked: true });
      hiddenAt ??= Date.now();
    } else {
      if (hiddenAt !== null && Date.now() - hiddenAt >= state.delayMs) set({ locked: true });
      hiddenAt = null;
    }
  });
}

export function useAppLock(): LockState {
  return useSyncExternalStore(
    (listener) => {
      init();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
}

/** Whether this phone has a fingerprint or face sensor the browser can use. */
export async function appLockSupported(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Turns the lock on: the phone asks for the fingerprint once to create the credential. */
export async function enableAppLock(username: string, delayMs = 0): Promise<void> {
  const credential = (await withCeremony(() => navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'LuChat' },
      user: { id: randomBytes(16), name: username, displayName: `${username} (verrouillage LuChat)` },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60_000,
    },
  }))) as PublicKeyCredential | null;
  if (!credential) throw new Error('Empreinte non enregistrée.');
  writeSettings({ credentialId: toBase64Url(credential.rawId), delayMs });
  set({ enabled: true, locked: false, delayMs });
}

/** Asks for the fingerprint; true once the phone confirmed it was really the owner. */
async function verifyOwner(): Promise<boolean> {
  const settings = readSettings();
  if (!settings) return true;
  const assertion = (await withCeremony(() => navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromBase64Url(settings.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  }))) as PublicKeyCredential | null;
  const data = assertion && (assertion.response as AuthenticatorAssertionResponse).authenticatorData;
  // Byte 32 holds the flags: 0x04 means the user was verified (fingerprint, face or phone code).
  return !!data && data.byteLength > 32 && (new Uint8Array(data)[32] & 0x04) !== 0;
}

/** Unlocks the app after a fingerprint check; returns a French error message, or null when unlocked. */
export async function unlockApp(): Promise<string | null> {
  try {
    if (!(await verifyOwner())) return 'Empreinte non reconnue.';
    set({ locked: false });
    return null;
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return 'Déverrouillage annulé.';
    return 'Empreinte indisponible sur ce téléphone.';
  }
}

/** Turns the lock off, after a fingerprint check so someone else can't just switch it off. */
export async function disableAppLock(): Promise<string | null> {
  try {
    if (!(await verifyOwner())) return 'Empreinte non reconnue.';
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return 'Vérification annulée.';
    return 'Empreinte indisponible sur ce téléphone.';
  }
  forgetAppLock();
  return null;
}

/** Drops the lock without a check: on sign-out, when the password will be needed again anyway. */
export function forgetAppLock() {
  writeSettings(null);
  set({ enabled: false, locked: false });
}

export function setAppLockDelay(delayMs: number) {
  const settings = readSettings();
  if (!settings) return;
  writeSettings({ ...settings, delayMs });
  set({ delayMs });
}
