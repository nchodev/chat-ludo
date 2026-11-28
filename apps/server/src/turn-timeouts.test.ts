/**
 * Ludo online: a player out of time has their turn played by the computer, and only
 * MAX_TIMEOUTS missed turns in a row lose the game.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { DEFAULT_RULES, MAX_TIMEOUTS, TURN_TIME_MS } from '@ludo/engine';
import { RoomManager, type Room } from './rooms';

const managers: RoomManager[] = [];
afterEach(() => {
  for (const rooms of managers.splice(0)) for (const room of rooms.all()) rooms.delete(room);
  mock.timers.reset();
});

function twoPlayers() {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const rooms = new RoomManager(() => {}, () => {});
  managers.push(rooms);
  const { room, token: host } = rooms.create('Awa', DEFAULT_RULES, 'socket-a');
  rooms.join(room, 'Moussa', 'socket-b');
  rooms.start(room, host);
  return { rooms, room };
}

/** Lets time pass until the game changes (a timeout, or an action played by the computer). */
function waitForChange(room: Room) {
  const before = JSON.stringify([room.game, room.timeouts]);
  for (let i = 0; i < 100 && JSON.stringify([room.game, room.timeouts]) === before; i++) mock.timers.tick(TURN_TIME_MS / 10);
}

test('the game gives five chances: the computer plays missed turns, the fifth in a row loses', () => {
  assert.equal(MAX_TIMEOUTS, 5);
  const { room } = twoPlayers();
  const first = room.game!.players[room.game!.current].color;

  // Nobody plays: each missed turn is counted, and the computer plays it.
  let seen = 0;
  for (let i = 0; i < 2000 && room.game!.phase !== 'over'; i++) {
    waitForChange(room);
    seen = Math.max(seen, room.timeouts[first] ?? 0);
    if ((room.timeouts[first] ?? 0) < MAX_TIMEOUTS) assert.ok(!room.game!.forfeited.includes(first), 'still in the game before the fifth');
  }
  assert.equal(room.game!.phase, 'over');
  const loser = room.game!.forfeited[0];
  assert.ok(loser, 'someone lost by running out of time');
  assert.equal(room.timeouts[loser], MAX_TIMEOUTS);
  assert.ok(seen >= 1 && room.game!.history.length > 0, 'missed turns were played by the computer');
});
