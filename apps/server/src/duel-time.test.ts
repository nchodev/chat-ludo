/**
 * Clocks of the two-player games: thinking time picked by the host, seconds added per move,
 * and a game cancelled (stakes given back) when a first move isn't played.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { DUEL_FIRST_MOVE_MS, DUEL_INCREMENT_MS, normalizeProfile, stakeTable, type DuelGame } from '@ludo/engine';
import { createUser, getWallet } from './db';
import { DuelManager, DuelRoomError, type DuelRoom } from './duel-rooms';

let n = 0;
const newUser = () => createUser(`pendule${++n}`, 'x', normalizeProfile({ coins: 1000 })).id;

const managers: DuelManager[] = [];
afterEach(() => {
  for (const duels of managers.splice(0)) for (const room of duels.all()) duels.delete(room);
  mock.timers.reset();
});

function room(kind: DuelGame, opts: { minutes?: number; stake?: boolean } = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const duels = new DuelManager(() => {});
  managers.push(duels);
  const a = opts.stake ? newUser() : undefined;
  const b = opts.stake ? newUser() : undefined;
  const { room, token: host } = duels.create(kind, 'Awa', 'socket-a', a);
  const guest = duels.join(room, 'Moussa', 'socket-b', undefined, b);
  if (opts.minutes) duels.setMinutes(room, host, opts.minutes);
  if (opts.stake) duels.setWager(room, host, stakeTable('free-100')!);
  duels.start(room, host);
  return { duels, room, host, guest, a, b };
}

const tokenToMove = (duels: DuelManager, r: DuelRoom, host: string, guest: string) =>
  duels.sideOf(r, host) === (r.game as { turn: string }).turn ? host : guest;

function playFirstLegal(duels: DuelManager, r: DuelRoom, token: string) {
  const game = r.game as { legalMoves: unknown[] };
  const move = game.legalMoves[0] as { from?: number; to?: number; captures?: number[]; pit?: number } | number;
  duels.move(r, token, typeof move === 'number' ? { pit: move } : move);
}

test('the host picks the thinking time, at least 10 minutes', () => {
  const { room: r, duels, host } = room('awale', { minutes: 20 });
  assert.deepEqual(r.clock, { white: 20 * 60_000, black: 20 * 60_000 });
  assert.equal(duels.view(r, host).minutes, 20);
  const other = duels.create('dames', 'Fatou', 'socket-c').room;
  assert.throws(() => duels.setMinutes(other, other.hostToken, 5), DuelRoomError);
  assert.throws(() => duels.setMinutes(r, host, 30), DuelRoomError, 'not during a game');
});

test('quick default is 10 minutes, and each move adds seconds to the mover’s clock', () => {
  const { duels, room: r, host, guest } = room('dames');
  assert.equal(r.clock!.white, 10 * 60_000);
  mock.timers.tick(3000);
  const token = tokenToMove(duels, r, host, guest);
  const side = duels.sideOf(r, token)!;
  playFirstLegal(duels, r, token);
  assert.equal(r.clock![side], 10 * 60_000 - 3000 + DUEL_INCREMENT_MS);
});

test('a first move not played in time cancels the game and gives both stakes back', () => {
  const { room: r, a, b } = room('awale', { stake: true });
  assert.equal(getWallet(a!).free, 900);
  mock.timers.tick(DUEL_FIRST_MOVE_MS + 100);
  const game = r.game as { status: string; winner: unknown; endReason: string };
  assert.equal(game.status, 'over');
  assert.equal(game.winner, null);
  assert.equal(game.endReason, 'aborted');
  assert.equal(getWallet(a!).free, 1000);
  assert.equal(getWallet(b!).free, 1000);
});

test('the second player also has to play their first move in time', () => {
  const { duels, room: r, host, guest } = room('dames');
  mock.timers.tick(5000);
  playFirstLegal(duels, r, tokenToMove(duels, r, host, guest));
  assert.ok(duels.view(r, host).firstMove, 'the other side has not played yet');
  mock.timers.tick(DUEL_FIRST_MOVE_MS + 100);
  assert.equal((r.game as { endReason: string }).endReason, 'aborted');
});

test('once both have played, only the clock decides', () => {
  const { duels, room: r, host, guest } = room('awale');
  playFirstLegal(duels, r, tokenToMove(duels, r, host, guest));
  playFirstLegal(duels, r, tokenToMove(duels, r, host, guest));
  assert.equal(duels.view(r, host).firstMove, null);
  mock.timers.tick(DUEL_FIRST_MOVE_MS * 4);
  assert.equal((r.game as { status: string }).status, 'playing');
});
