import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Checked against when the account doesn't exist, so response time doesn't reveal which accounts exist. */
export const dummyHash = hashPassword(randomBytes(16).toString('hex'));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PLAYER_PASSWORD = 6;
export const MAX_PASSWORD = 128;
export const MIN_ADMIN_PASSWORD = 10;

export function checkNewPlayerPassword(password: string): string | null {
  if (password.length < MIN_PLAYER_PASSWORD) return `Mot de passe : au moins ${MIN_PLAYER_PASSWORD} caractères.`;
  if (password.length > MAX_PASSWORD) return `Mot de passe : au plus ${MAX_PASSWORD} caractères.`;
  return null;
}

export function checkNewAdminPassword(password: string): string | null {
  if (password.length < MIN_ADMIN_PASSWORD) return `Mot de passe : au moins ${MIN_ADMIN_PASSWORD} caractères.`;
  if (password.length > 128) return 'Mot de passe trop long.';
  return null;
}
