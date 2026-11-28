/**
 * Quick reactions in the two-player games (draughts, awale).
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { isReactionFor, normalizeProfile, type DuelReactionMessage } from '@ludo/engine';
import { createUser } from './db';
import { DuelManager, DuelRoomError } from './duel-rooms';

const managers: DuelManager[] = [];
// Stop the game clocks so the test process can exit.
afterEach(() => {
  for (const duels of managers.splice(0)) for (const room of duels.all()) duels.delete(room);
});

function duel(kind: 'dames' | 'awale') {
  const sent: DuelReactionMessage[] = [];
  const duels = new DuelManager(
    () => {},
    (_room, message) => sent.push(message),
  );
  managers.push(duels);
  const { room, token: host } = duels.create(kind, 'Awa', 'socket-a');
  const guest = duels.join(room, 'Moussa', 'socket-b');
  duels.start(room, host);
  const spectator = duels.join(room, 'Fatou', 'socket-c');
  return { duels, room, host, guest, spectator, sent };
}

test('a player reaction reaches the room with their side; spam is ignored', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { duels, room, host, guest, sent } = duel('awale');
  duels.react(room, host, 'gg');
  duels.react(room, host, 'laugh'); // within the cooldown
  duels.react(room, guest, 'cool');
  assert.deepEqual(sent, [
    { side: duels.sideOf(room, host), reaction: 'gg' },
    { side: duels.sideOf(room, guest), reaction: 'cool' },
  ]);
  t.mock.timers.tick(2000);
  duels.react(room, host, 'laugh');
  assert.equal(sent.length, 3);
});

test('spectators cannot react', () => {
  const { duels, room, spectator, sent } = duel('dames');
  assert.throws(() => duels.react(room, spectator, 'gg'), DuelRoomError);
  assert.equal(sent.length, 0);
});

test('each game accepts the shared phrases and its own, not those of another game', () => {
  assert.equal(isReactionFor('awale', 'gg'), true);
  assert.equal(isReactionFor('awale', 'awale-harvest'), true);
  assert.equal(isReactionFor('dames', 'dames-sweep'), true);
  assert.equal(isReactionFor('dames', 'awale-harvest'), false);
  assert.equal(isReactionFor('dames', 'six'), false);
  assert.equal(isReactionFor('awale', 'bye'), false);
  assert.equal(isReactionFor('ludo', 'dames-sweep'), false);
  assert.equal(isReactionFor('dames', 'nope'), false);
});

test('the room view names the account of signed-in players only, whatever a guest calls themselves', () => {
  const duels = new DuelManager(() => {});
  managers.push(duels);
  const account = createUser('compte_awa', 'x', normalizeProfile({})).id;
  const { room, token } = duels.create('dames', 'compte_awa', 'socket-a', account);
  duels.join(room, 'compte_awa', 'socket-b');
  assert.deepEqual(
    duels.view(room, token).players.map((p) => p.username),
    ['compte_awa', null],
  );
});
