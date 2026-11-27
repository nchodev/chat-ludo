/**
 * Pending Wave deposits settled by an admin: credited once with a Wave transaction id, or closed.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeProfile } from '@ludo/engine';
import { confirmDeposit, createAdmin, createUser, failDeposit, getPayment, getWallet, openDeposit, paymentWithProviderRef } from './db';

let n = 0;
const newPlayer = () => createUser(`deposant${++n}`, 'x', normalizeProfile({})).id;
const admin = createAdmin('caisse@luchat.test', 'x').id;

test('an admin credits a pending deposit once, and the Wave transaction is recorded', () => {
  const player = newPlayer();
  openDeposit('dep-a', player, 2000, '+221770000001');
  assert.equal(getWallet(player).premium, 0);

  assert.equal(confirmDeposit('dep-a', 'T_WAVE_0001', { adminId: admin, note: 'notification Wave perdue' }), true);
  assert.equal(getWallet(player).premium, 2000);
  const paid = getPayment('dep-a')!;
  assert.equal(paid.status, 'succeeded');
  assert.equal(paid.providerRef, 'T_WAVE_0001');
  assert.equal(paid.note, 'notification Wave perdue');

  // A second click, or Wave's late notification, credits nothing more.
  assert.equal(confirmDeposit('dep-a', 'T_WAVE_0001'), false);
  assert.equal(getWallet(player).premium, 2000);
});

test('a Wave transaction already credited is spotted before crediting another deposit', () => {
  const player = newPlayer();
  openDeposit('dep-b', player, 1000, '+221770000002');
  openDeposit('dep-c', player, 1000, '+221770000002');
  confirmDeposit('dep-b', 'T_WAVE_0002', { adminId: admin, note: 'vérifié' });
  assert.equal(paymentWithProviderRef('T_WAVE_0002', 'dep-c'), 'dep-b');
  assert.equal(paymentWithProviderRef('T_WAVE_0002', 'dep-b'), null);
  assert.equal(paymentWithProviderRef('T_WAVE_9999', 'dep-c'), null);
});

test('an admin closes an unpaid deposit without crediting anything', () => {
  const player = newPlayer();
  openDeposit('dep-d', player, 500, '+221770000003');
  assert.equal(failDeposit('dep-d', 'abandonné par le joueur', admin), true);
  assert.equal(getPayment('dep-d')!.status, 'failed');
  assert.equal(getWallet(player).premium, 0);
  // Already closed: it can no longer be credited.
  assert.equal(confirmDeposit('dep-d', 'T_WAVE_0003', { adminId: admin, note: 'trop tard' }), false);
  assert.equal(getWallet(player).premium, 0);
});
