/**
 * Where each connection comes from (network address and the random id the app keeps on the
 * device), so two accounts played by the same person can't sit at the same staked table.
 */
export interface Origin {
  ip: string;
  device: string;
}

const origins = new Map<string, Origin>();

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Loopback and private networks say nothing about who is playing (proxies, same office). */
export function meaningfulIp(ip: string): string {
  const v4 = ip.replace(/^::ffff:/, '');
  if (!v4 || v4 === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(v4) || /^f[cd]/i.test(v4)) return '';
  return v4;
}

export function rememberOrigin(socketId: string, ip: string, device: unknown) {
  origins.set(socketId, { ip: meaningfulIp(ip), device: typeof device === 'string' && DEVICE_ID.test(device) ? device : '' });
}

export function forgetOrigin(socketId: string) {
  origins.delete(socketId);
}

export function originOf(socketId: string | null | undefined): Origin | undefined {
  return socketId ? origins.get(socketId) : undefined;
}

/**
 * Whether two players seem to be the same person: same device, or (with `byAddress`) same
 * public address. Friends at home share an address, so it only counts where real money is at stake.
 */
export function sameOrigin(a: Origin | undefined, b: Origin | undefined, byAddress = true): boolean {
  if (!a || !b) return false;
  return (!!a.device && a.device === b.device) || (byAddress && !!a.ip && a.ip === b.ip);
}

/** Indexes of the first pair of players that seem to be the same person, if any. */
export function linkedPlayers(players: (Origin | undefined)[], byAddress = true): [number, number] | null {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) if (sameOrigin(players[i], players[j], byAddress)) return [i, j];
  }
  return null;
}

export const LINKED_PLAYERS_ERROR = (a: string, b: string) =>
  `${a} et ${b} jouent depuis le même appareil ou la même connexion : une partie avec mise doit réunir des joueurs différents.`;
