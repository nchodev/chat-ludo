/**
 * Notification centre (the bell): personal notifications, announcements to everyone, unread count.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeProfile } from '@ludo/engine';
import {
  addNotification,
  createUser,
  deleteAnnouncement,
  listAnnouncements,
  markNotificationsSeen,
  notificationsOf,
  unreadNotificationCount,
} from './db';
import { announce, notify, setNotificationTransport } from './notify';

let count = 0;
const newUser = () => createUser(`cloche${++count}`, 'x', normalizeProfile({})).id;

test('une notification personnelle n’est vue que par son destinataire', () => {
  const a = newUser();
  const b = newUser();
  addNotification(a, { kind: 'friend', title: 'Salut', body: 'Pour a', url: '/?tab=friends' });
  assert.equal(notificationsOf(a).filter((n) => n.title === 'Salut').length, 1);
  assert.equal(notificationsOf(b).filter((n) => n.title === 'Salut').length, 0);
  assert.equal(unreadNotificationCount(a), 1);
  assert.equal(unreadNotificationCount(b), 0);
});

test('ouvrir la cloche remet le compteur à zéro', () => {
  const a = newUser();
  addNotification(a, { kind: 'wallet', title: 'Un', body: '…' });
  addNotification(a, { kind: 'wallet', title: 'Deux', body: '…' });
  assert.equal(unreadNotificationCount(a), 2);
  markNotificationsSeen(a);
  assert.equal(unreadNotificationCount(a), 0);
  addNotification(a, { kind: 'wallet', title: 'Trois', body: '…' });
  assert.equal(unreadNotificationCount(a), 1);
  assert.deepEqual(
    notificationsOf(a).map((n) => n.title),
    ['Trois', 'Deux', 'Un'],
  );
});

test('une annonce touche les joueurs déjà inscrits, et se supprime', () => {
  const delivered: (number | null)[] = [];
  setNotificationTransport((userId) => delivered.push(userId), () => true);
  const a = newUser();
  const sent = announce({ title: 'Tournoi samedi', body: 'Inscris-toi !', url: '/ludo' }, false);
  assert.deepEqual(delivered, [null]);
  assert.equal(notificationsOf(a)[0].title, 'Tournoi samedi');
  assert.equal(notificationsOf(a)[0].kind, 'announcement');
  assert.equal(unreadNotificationCount(a), 1);
  assert.ok(listAnnouncements().some((n) => n.id === sent.id));
  assert.ok(deleteAnnouncement(sent.id));
  assert.equal(unreadNotificationCount(a), 0);
});

test('notify enregistre et prévient les applis ouvertes du joueur', () => {
  const delivered: (number | null)[] = [];
  setNotificationTransport((userId) => delivered.push(userId), () => true);
  const a = newUser();
  const saved = notify(a, { kind: 'game', title: 'Tu as gagné', body: '…', url: '/portefeuille' });
  assert.ok(saved);
  assert.deepEqual(delivered, [a]);
  assert.equal(notificationsOf(a)[0].id, saved.id);
});

test('seules les 200 dernières notifications d’un joueur sont gardées', () => {
  const a = newUser();
  for (let i = 0; i < 205; i++) addNotification(a, { kind: 'wallet', title: `n${i}`, body: '…' });
  const all = notificationsOf(a, 500);
  assert.equal(all.length, 200);
  assert.equal(all[0].title, 'n204');
  assert.equal(all.at(-1)?.title, 'n5');
});
