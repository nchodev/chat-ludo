import type { AppNotification } from '@ludo/engine';
import * as db from './db';
import { sendPush } from './push';

/**
 * The notification centre (the bell): every event worth keeping is stored, shown at once on the
 * player's open apps, and sent as a phone notification when no app of theirs is open.
 * Chat messages are not stored here: conversations already show what is unread.
 */

type Deliver = (userId: number | null, notification: AppNotification) => void;

let deliver: Deliver = () => {};
let isOnline: (userId: number) => boolean = () => false;

/** Set by the socket server: how to reach a player's open apps (`null` for every connected app). */
export function setNotificationTransport(fn: Deliver, online: (userId: number) => boolean) {
  deliver = fn;
  isOnline = online;
}

export interface NotifyOptions {
  /** Phone notifications with the same tag replace each other. */
  tag?: string;
  /** Also notify the phone when an app is open (by default only when none is). */
  pushWhenOnline?: boolean;
}

/** Stores a notification for a player, shows it on their open apps and pushes it to their phone. */
export function notify(userId: number, n: db.NewNotification, options: NotifyOptions = {}): AppNotification | null {
  try {
    const saved = db.addNotification(userId, n);
    deliver(userId, saved);
    if (options.pushWhenOnline || !isOnline(userId)) {
      void sendPush(userId, { title: n.title, body: n.body, url: n.url ?? '/', tag: options.tag ?? `notif-${saved.id}` });
    }
    return saved;
  } catch (err) {
    console.error('Notification non enregistrée', err);
    return null;
  }
}

/** An announcement from the admins to every player; `push` also sends it to their phones. */
export function announce(n: Omit<db.NewNotification, 'kind'>, push: boolean): AppNotification {
  const saved = db.addNotification(null, { ...n, kind: 'announcement' });
  deliver(null, saved);
  if (push) void pushToEveryone(saved);
  return saved;
}

/** One player after the other, so a large audience doesn't open thousands of connections at once. */
async function pushToEveryone(n: AppNotification) {
  for (const userId of db.usersWithPushSubscriptions()) {
    await sendPush(userId, { title: n.title, body: n.body, url: n.url ?? '/', tag: `announce-${n.id}` }).catch(() => {});
  }
}
