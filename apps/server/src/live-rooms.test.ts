/**
 * A server restart in the middle of a game: rooms saved in the database must come back as they
 * were, stakes included, and the game must go on once the players' apps reconnect.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { DEFAULT_RULES, normalizeProfile, stakeTable } from '@ludo/engine';
import { createUser, getWallet, listLiveRooms, refundOpenPots, saveLiveRoom } from './db';
import { DISCONNECT_FORFEIT_MS, RoomManager, type Room } from './rooms';
import { DUEL_DISCONNECT_FORFEIT_MS, DuelManager, type DuelRoom } from './duel-rooms';

let userCount = 0;
function newUser(coins = 1000) {
  userCount += 1;
  return createUser(`joueur${userCount}`, 'x', normalizeProfile({ coins })).id;
}

/** What a crash leaves behind: the database, but no timers or memory. */
function crash(manager: RoomManager | DuelManager) {
  for (const room of manager.all() as (Room | DuelRoom)[]) {
    if (room.timer) clearTimeout(room.timer);
    for (const m of room.members.values()) clearTimeout(m.forfeitTimer);
  }
}

const tokenOf = (room: Room, color: 'red' | 'yellow') => {
  const seat = room.seats[color];
  assert.equal(seat.kind, 'human');
  return seat.kind === 'human' ? seat.token : '';
};

/** Plays human turns (roll, then the first legal move) until `count` actions were made. */
function playActions(manager: RoomManager, room: Room, count: number) {
  for (let i = 0; i < count; i++) {
    const game = room.game!;
    if (game.phase === 'over') return;
    const token = tokenOf(room, game.players[game.current].color as 'red' | 'yellow');
    if (game.phase === 'roll') manager.roll(room, token);
    else manager.move(room, token, game.legalMoves[0].pawn);
  }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('Ludo: restart in the middle of a staked game', () => {
  function stakedGame() {
    const a = newUser();
    const b = newUser();
    const before = 1000;
    const rooms = new RoomManager(() => {}, () => {});
    const { room, token: hostToken } = rooms.create('Awa', DEFAULT_RULES, 'socket-a', a);
    rooms.setWager(room, hostToken, stakeTable('free-100')!);
    const guestToken = rooms.join(room, 'Moussa', 'socket-b', undefined, b);
    rooms.start(room, hostToken);
    playActions(rooms, room, 6);
    return { a, b, before, rooms, room, hostToken, guestToken };
  }

  test('the game, its dice and its pot come back unchanged', () => {
    const { a, b, before, rooms, room, hostToken } = stakedGame();
    assert.equal(getWallet(a).free, before - 100);
    const snapshot = structuredClone(room.game);
    const rolls = [...room.fair!.rolls];
    crash(rooms);

    const restarted = new RoomManager(() => {}, () => {});
    const pots = restarted.restore();
    assert.equal(refundOpenPots(pots), 0, 'the pot of a resumed game is not refunded');
    const back = restarted.get(room.code)!;
    assert.ok(back, 'room resumed');
    assert.deepEqual(back.game, snapshot);
    assert.deepEqual(back.fair!.rolls, rolls);
    assert.equal(back.stake!.potId, room.stake!.potId);
    assert.equal(back.stake!.payout, null);
    assert.equal(back.hostToken, hostToken);
    assert.ok([...back.members.values()].every((m) => m.socketId === null), 'everyone offline until they reconnect');
    assert.equal(getWallet(a).free, before - 100);
    assert.equal(getWallet(b).free, before - 100);
    crash(restarted);
  });

  test('players who reconnect keep playing, and the pot goes to the winner', () => {
    const { a, b, before, rooms, room, hostToken, guestToken } = stakedGame();
    crash(rooms);
    const restarted = new RoomManager(() => {}, () => {});
    refundOpenPots(restarted.restore());
    const back = restarted.get(room.code)!;
    assert.equal(restarted.join(back, 'Awa', 'socket-a2', hostToken, a), hostToken);
    assert.equal(restarted.join(back, 'Moussa', 'socket-b2', guestToken, b), guestToken);
    const length = back.game!.history.length;
    playActions(restarted, back, 4);
    assert.ok(back.game!.history.length > length, 'the game goes on');

    // Moussa leaves: Awa wins the pot.
    restarted.leave(back, guestToken);
    assert.equal(back.game!.phase, 'over');
    assert.ok(back.stake!.payout?.winner);
    assert.ok(getWallet(a).free > before - 100);
    assert.equal(getWallet(b).free, before - 100);
    crash(restarted);
  });

  test('a player who never comes back loses after the disconnect delay', () => {
    const { a, b, before, rooms, room, hostToken } = stakedGame();
    crash(rooms);
    const restarted = new RoomManager(() => {}, () => {});
    refundOpenPots(restarted.restore());
    const back = restarted.get(room.code)!;
    restarted.join(back, 'Awa', 'socket-a2', hostToken, a);

    mock.timers.tick(DISCONNECT_FORFEIT_MS - 1000);
    assert.notEqual(back.game!.forfeited.length, 1, 'still time to come back');
    mock.timers.tick(2000);
    assert.equal(back.game!.phase, 'over');
    assert.ok(back.stake!.payout?.winner);
    assert.equal(getWallet(b).free, before - 100);
    assert.ok(getWallet(a).free > before - 100);
    crash(restarted);
  });

  test('the turn in progress gets extra time after a restart', () => {
    const { rooms, room } = stakedGame();
    crash(rooms);
    const restarted = new RoomManager(() => {}, () => {});
    refundOpenPots(restarted.restore());
    const back = restarted.get(room.code)!;
    const view = restarted.view(back, undefined);
    assert.ok(view.turnTimer && view.turnTimer.endsIn > view.turnTimer.duration, 'more than a normal turn');
    crash(restarted);
  });

  test('a save that can no longer be read is dropped and its stakes refunded', () => {
    const { a, b, before, rooms, room } = stakedGame();
    crash(rooms);
    const row = listLiveRooms('ludo').find((r) => r.code === room.code)!;
    saveLiveRoom('ludo', room.code, row.version + 1, row.data);

    const restarted = new RoomManager(() => {}, () => {});
    const pots = restarted.restore();
    assert.equal(restarted.get(room.code), undefined);
    assert.ok(!listLiveRooms('ludo').some((r) => r.code === room.code), 'unreadable save deleted');
    assert.ok(refundOpenPots(pots) >= 1);
    assert.equal(getWallet(a).free, before);
    assert.equal(getWallet(b).free, before);
    for (const r of restarted.all()) restarted.delete(r);
  });

  test('a closed room is no longer saved', () => {
    const rooms = new RoomManager(() => {}, () => {});
    const { room } = rooms.create('Awa', DEFAULT_RULES, 'socket-a');
    assert.ok(listLiveRooms('ludo').some((r) => r.code === room.code));
    rooms.delete(room);
    assert.ok(!listLiveRooms('ludo').some((r) => r.code === room.code));
  });
});

describe('Dames: restart in the middle of a staked game', () => {
  function stakedDuel() {
    const a = newUser();
    const b = newUser();
    const duels = new DuelManager(() => {});
    const { room, token: hostToken } = duels.create('dames', 'Awa', 'socket-a', a);
    duels.setWager(room, hostToken, stakeTable('free-100')!);
    const guestToken = duels.join(room, 'Moussa', 'socket-b', undefined, b);
    duels.start(room, hostToken);
    // A few moves, always the first legal one.
    for (let i = 0; i < 4; i++) {
      const game = room.game as { turn: 'white' | 'black'; legalMoves: { from: number; to: number; captures: number[]; path: number[] }[] };
      const token = duels.sideOf(room, hostToken) === game.turn ? hostToken : guestToken;
      const move = game.legalMoves[0];
      duels.move(room, token, { from: move.from, to: move.to, captures: move.captures });
    }
    return { a, b, duels, room, hostToken, guestToken };
  }

  test('the board and both clocks come back; the clock is stopped while the server is down', () => {
    const { a, duels, room } = stakedDuel();
    const game = structuredClone(room.game);
    const turn = (room.game as { turn: 'white' | 'black' }).turn;
    const clockBefore = room.clock![turn];
    crash(duels);

    const restarted = new DuelManager(() => {});
    assert.equal(refundOpenPots(restarted.restore()), 0);
    const back = restarted.get(room.code)!;
    assert.deepEqual(back.game, game);
    assert.equal(back.stake!.payout, null);
    assert.ok(back.clock![turn] <= clockBefore && back.clock![turn] > clockBefore - 1000, 'no time lost while down');
    assert.equal(getWallet(a).free, 900);
    crash(restarted);
  });

  test('an absent player loses after the disconnect delay, and the winner gets the pot', () => {
    const { a, b, duels, room, hostToken } = stakedDuel();
    crash(duels);
    const restarted = new DuelManager(() => {});
    refundOpenPots(restarted.restore());
    const back = restarted.get(room.code)!;
    restarted.join(back, 'Awa', 'socket-a2', hostToken, a);
    mock.timers.tick(DUEL_DISCONNECT_FORFEIT_MS + 1000);
    assert.equal(back.game!.status, 'over');
    assert.ok(getWallet(a).free > 900);
    assert.equal(getWallet(b).free, 900);
    crash(restarted);
  });
});
