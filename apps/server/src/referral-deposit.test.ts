/**
 * Referral bonus on an invited friend's first deposit: the inviter and the friend each get the
 * percentage set by the admins, at most 1 000 each, locked until staked in games that went to the end.
 * Run with: npm test -w @ludo/server
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_REFERRAL_SETTINGS, normalizeProfile, referralDepositBonus, validateReferralSettings, type ReferralSettings } from '@ludo/engine';
import {
  confirmAdult,
  confirmDeposit,
  createUser,
  getWallet,
  openDeposit,
  openPot,
  premiumBonusOf,
  recordSignup,
  progressReferral,
  referralSettings,
  referralStats,
  refundPot,
  requestWithdrawal,
  saveSetting,
  setReferralSettings,
  settlePot,
} from './db';

let count = 0;
function newUser() {
  count += 1;
  const id = createUser(`parrain${count}`, 'x', normalizeProfile({})).id;
  confirmAdult(id, '');
  recordSignup(id, `10.0.0.${count}`, `dev-${count}`, null);
  return id;
}

function invitedBy(inviter: number) {
  count += 1;
  const id = createUser(`filleul${count}`, 'x', normalizeProfile({})).id;
  confirmAdult(id, '');
  recordSignup(id, `10.0.1.${count}`, `dev-f${count}`, inviter);
  return id;
}

function deposit(userId: number, amount: number) {
  const reference = `dep-${userId}-${Math.random()}`;
  openDeposit(reference, userId, amount, `77${userId}`);
  assert.ok(confirmDeposit(reference, `wave-${reference}`));
}

/** Changes only the given first-deposit settings, from the defaults. */
function setDeposit(patch: Partial<ReferralSettings['deposit']>) {
  setReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, deposit: { ...DEFAULT_REFERRAL_SETTINGS.deposit, ...patch } });
}

test('le bonus vaut le pourcentage du dépôt, plafonné', () => {
  assert.equal(DEFAULT_REFERRAL_SETTINGS.deposit.maxBonus, 1_000);
  assert.equal(referralDepositBonus(300, 10, 1_000), 30);
  assert.equal(referralDepositBonus(5_000, 10, 1_000), 500);
  assert.equal(referralDepositBonus(1_000_000, 25, 1_000), 1_000);
});

test('réglages admin validés', () => {
  assert.deepEqual(validateReferralSettings(DEFAULT_REFERRAL_SETTINGS), DEFAULT_REFERRAL_SETTINGS);
  const bad = (patch: Partial<ReferralSettings['deposit']>) =>
    validateReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, deposit: { ...DEFAULT_REFERRAL_SETTINGS.deposit, ...patch } });
  assert.equal(typeof bad({ percent: 0 }), 'string');
  assert.equal(typeof bad({ percent: 12.5 }), 'string');
  assert.equal(typeof bad({ wagerMultiplier: 0 }), 'string');
  assert.equal(typeof validateReferralSettings({ free: DEFAULT_REFERRAL_SETTINGS.free }), 'string');
  assert.equal(typeof validateReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, free: { ...DEFAULT_REFERRAL_SETTINGS.free, gamesNeeded: 0 } }), 'string');
});

test('ancien réglage (activation et pourcentage seulement) repris', () => {
  saveSetting('referral_bonus', { enabled: false, percent: 15 });
  assert.deepEqual(referralSettings().deposit, { ...DEFAULT_REFERRAL_SETTINGS.deposit, enabled: false, percent: 15 });
});

test('premier dépôt : parrain et filleul reçoivent chacun le pourcentage, une seule fois', () => {
  setDeposit({ percent: 10 });
  const inviter = newUser();
  const friend = invitedBy(inviter);
  deposit(friend, 300); // the Wave minimum counts
  assert.equal(getWallet(inviter).premium, 30);
  assert.equal(getWallet(friend).premium, 330);
  assert.deepEqual(premiumBonusOf(inviter), { locked: 30, wagerDue: 30 });
  assert.deepEqual(premiumBonusOf(friend), { locked: 30, wagerDue: 30 });

  deposit(friend, 5_000);
  assert.equal(getWallet(inviter).premium, 30);
  assert.equal(getWallet(friend).premium, 5_330);
});

test('pourcentage et plafond viennent de l’admin', () => {
  setDeposit({ percent: 30 });
  const inviter = newUser();
  const small = invitedBy(inviter);
  deposit(small, 2_000); // 30 % = 600 each
  assert.equal(getWallet(inviter).premium, 600);
  assert.equal(getWallet(small).premium, 2_600);
  const big = invitedBy(inviter);
  deposit(big, 20_000); // 30 % = 6 000: capped to 1 000 each
  assert.equal(getWallet(inviter).premium, 600 + 1_000);
  assert.equal(getWallet(big).premium, 20_000 + 1_000);

  setDeposit({ percent: 30, maxBonus: 2_500, wagerMultiplier: 3 });
  const other = invitedBy(inviter);
  deposit(other, 20_000);
  assert.equal(getWallet(other).premium, 20_000 + 2_500);
  assert.deepEqual(premiumBonusOf(other), { locked: 2_500, wagerDue: 7_500 });
  setDeposit({});
});

test('bonus désactivé par l’admin : rien n’est versé', () => {
  setDeposit({ enabled: false });
  const inviter = newUser();
  const friend = invitedBy(inviter);
  deposit(friend, 5_000);
  assert.equal(getWallet(inviter).premium, 0);
  assert.equal(getWallet(friend).premium, 5_000);
  setDeposit({});
});

test('bonus Free : les règles viennent de l’admin', () => {
  setReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, free: { gamesNeeded: 2, referrerCoins: 800, newcomerCoins: 0, maxRewarded: 20 } });
  const inviter = newUser();
  const friend = invitedBy(inviter);
  const rules = referralSettings().free;
  const before = { inviter: getWallet(inviter).free, friend: getWallet(friend).free };
  assert.equal(progressReferral(friend, rules), null);
  assert.deepEqual(progressReferral(friend, rules), { referrerId: inviter, referrerCoins: 800, newcomerCoins: 0 });
  assert.equal(getWallet(inviter).free, before.inviter + 800);
  assert.equal(getWallet(friend).free, before.friend);
  const stats = referralStats();
  assert.ok(stats.invited >= 1 && stats.validated >= 1);
  assert.ok(stats.topInviters.length > 0);
  setReferralSettings(DEFAULT_REFERRAL_SETTINGS);
});

test('le bonus de bienvenue ne se retire pas avant d’être misé', () => {
  const inviter = newUser();
  const friend = invitedBy(inviter);
  deposit(friend, 5_000);
  assert.match(requestWithdrawal(`wd-a-${friend}`, friend, 5_500, '77', { perDay: 100_000 }) ?? '', /pas encore retirables/);
  assert.equal(requestWithdrawal(`wd-b-${friend}`, friend, 5_000, '77', { perDay: 100_000 }), null);
});

test('une mise remboursée ne compte pas, une partie jouée débloque le bonus', () => {
  const inviter = newUser();
  const rival = newUser();
  deposit(rival, 1_000);
  deposit(invitedBy(inviter), 5_000);

  assert.deepEqual(openPot(`pot-r-${inviter}`, 't', 'premium', 500, [inviter, rival]), []);
  refundPot(`pot-r-${inviter}`);
  assert.equal(premiumBonusOf(inviter).wagerDue, 500);

  assert.deepEqual(openPot(`pot-s-${inviter}`, 't', 'premium', 500, [inviter, rival]), []);
  settlePot(`pot-s-${inviter}`, inviter, 900);
  assert.deepEqual(premiumBonusOf(inviter), { locked: 0, wagerDue: 0 });
  assert.equal(requestWithdrawal(`wd-c-${inviter}`, inviter, 900, '77', { perDay: 100_000 }), null);
});

test('un joueur qui perd sa mise voit sa part bloquée réduite à son solde', () => {
  const inviter = newUser();
  const rival = newUser();
  deposit(rival, 1_000);
  deposit(invitedBy(inviter), 10_000); // inviter: 1 000 locked
  assert.deepEqual(openPot(`pot-l-${inviter}`, 't', 'premium', 400, [inviter, rival]), []);
  settlePot(`pot-l-${inviter}`, rival, 700);
  assert.deepEqual(premiumBonusOf(inviter), { locked: 600, wagerDue: 600 });
});
