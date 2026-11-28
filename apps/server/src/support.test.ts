/**
 * Customer support conversations: unread counts on both sides, reopening, and photos kept apart.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeProfile } from '@ludo/engine';
import {
  addSupportMessage,
  createAdmin,
  createUser,
  getSupportMedia,
  listSupportThreads,
  markSupportRead,
  setSupportStatus,
  supportMessages,
  supportThread,
  supportUnreadForUser,
  supportUnreadThreads,
} from './db';

let n = 0;
const newPlayer = () => createUser(`aide${++n}`, 'x', normalizeProfile({})).id;
const admin = createAdmin('support@luchat.test', 'x').id;

test('messages count as unread for the other side until they open the conversation', () => {
  const player = newPlayer();
  const before = supportUnreadThreads();
  addSupportMessage(player, null, { kind: 'text', body: 'Mon dépôt n’est pas arrivé' });
  addSupportMessage(player, null, { kind: 'text', body: 'Référence 1234' });
  assert.equal(supportUnreadThreads(), before + 1);
  assert.equal(supportThread(player)!.unread, 2);

  addSupportMessage(player, admin, { kind: 'text', body: 'Bonjour, on regarde.' });
  // Answering means the admin read what came before.
  assert.equal(supportThread(player)!.unread, 0);
  assert.equal(supportUnreadThreads(), before);
  assert.equal(supportUnreadForUser(player), 1);

  markSupportRead(player, 'user');
  assert.equal(supportUnreadForUser(player), 0);

  const messages = supportMessages(player, null, 10);
  assert.deepEqual(messages.map((m) => m.fromStaff), [false, false, true]);
  assert.equal(messages[2].adminEmail, 'support@luchat.test');
});

test('a closed conversation reopens when the player writes again, not when support does', () => {
  const player = newPlayer();
  addSupportMessage(player, null, { kind: 'text', body: 'Question' });
  assert.equal(setSupportStatus(player, 'closed'), true);
  addSupportMessage(player, admin, { kind: 'text', body: 'Dernière précision' });
  assert.equal(supportThread(player)!.status, 'closed');
  addSupportMessage(player, null, { kind: 'text', body: 'Encore moi' });
  assert.equal(supportThread(player)!.status, 'open');
  assert.ok(listSupportThreads('open', '').some((t) => t.userId === player));
});

test('photos and voice notes are stored with their message, and paging keeps order', () => {
  const player = newPlayer();
  const photo = addSupportMessage(
    player,
    null,
    { kind: 'image', body: 'capture', width: 10, height: 20 },
    { mime: 'image/png', data: new Uint8Array([1, 2, 3]) },
  );
  assert.equal(getSupportMedia(photo.id)!.mime, 'image/png');
  for (let i = 0; i < 4; i++) addSupportMessage(player, null, { kind: 'text', body: `m${i}` });
  const last = supportMessages(player, null, 2);
  assert.deepEqual(last.map((m) => m.body), ['m2', 'm3']);
  assert.deepEqual(supportMessages(player, last[0].id, 10).map((m) => m.body), ['capture', 'm0', 'm1']);
  assert.equal(listSupportThreads('all', `aide${n}`).length, 1);
  assert.equal(listSupportThreads('all', 'aide%_').length, 0);
});
