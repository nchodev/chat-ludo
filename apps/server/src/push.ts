import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import webpush from 'web-push';
import * as db from './db';

/** Keys identifying this server to browsers' push services; generated once and kept with the database. */
function loadVapidKeys(): { publicKey: string; privateKey: string } {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const file = join(dirname(process.env.DATABASE_PATH ?? './data/ludo.db'), 'vapid.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

const keys = loadVapidKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contact@ludo.local', keys.publicKey, keys.privateKey);

export const VAPID_PUBLIC_KEY = keys.publicKey;

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other (one per conversation). */
  tag: string;
}

/** Sends a notification to every device of a player; subscriptions the push service rejects are dropped. */
export async function sendPush(userId: number, payload: PushPayload) {
  const subs = db.listPushSubscriptions(userId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'high' },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) db.deletePushSubscription(sub.endpoint);
        else console.error('Notification push impossible', status ?? err);
      }
    }),
  );
}
