'use client';

import { api } from './api';

export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on';

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.getRegistration();
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks for permission and registers this device for chat notifications. */
export async function enablePush(token: string): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) throw new Error('Notifications disponibles seulement dans l’app installée ou en HTTPS.');
  const { publicKey } = await api<{ publicKey: string }>('/push/key');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await api('/push/subscribe', { token, body: { subscription: sub.toJSON() } });
  return 'on';
}

/** Stops notifications on this device, e.g. when signing out. */
export async function disablePush(token: string | undefined) {
  if (!pushSupported()) return;
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  if (token) await api('/push/unsubscribe', { token, body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Shows a system notification from the page itself (app in the background but still running). */
export async function showLocalNotification(title: string, body: string, tag: string, url: string) {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url } });
  return true;
}
