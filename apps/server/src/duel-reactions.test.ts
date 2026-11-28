/**
 * Quick reactions in the two-player games (draughts, awale).
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { isDuelReactionId, type DuelReactionMessage } from '@ludo/engine';
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

test('Ludo-only phrases are not accepted in the other games', () => {
  assert.equal(isDuelReactionId('gg'), true);
  assert.equal(isDuelReactionId('six'), false);
  assert.equal(isDuelReactionId('bye'), false);
  assert.equal(isDuelReactionId('nope'), false);
});
