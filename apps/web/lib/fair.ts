import { dieFromDigest, fairRollMessage, type FairDice } from '@ludo/engine';

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export type FairCheck = { ok: true; rolls: number } | { ok: false; reason: string };

/** Checks on this device that the revealed seed matches the commitment and gives every roll of the game. */
export async function verifyFairDice(fair: FairDice): Promise<FairCheck> {
  if (!fair.seed) return { ok: false, reason: 'La graine n’est révélée qu’à la fin de la partie.' };
  const hash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(fair.seed)));
  if (hash !== fair.commit) return { ok: false, reason: 'La graine ne correspond pas à l’empreinte annoncée.' };
  const key = await crypto.subtle.importKey('raw', encoder.encode(fair.seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  for (let i = 0; i < fair.rolls.length; i++) {
    const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(fairRollMessage(fair.gameId, i)));
    if (dieFromDigest(new Uint8Array(digest)) !== fair.rolls[i]) {
      return { ok: false, reason: `Le lancer n°${i + 1} ne correspond pas à la graine.` };
    }
  }
  return { ok: true, rolls: fair.rolls.length };
}
