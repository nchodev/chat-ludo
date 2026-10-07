import type { IncomingHttpHeaders } from 'node:http';

/** Behind a reverse proxy (TRUST_PROXY=1), the client address comes from X-Forwarded-For. */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress: string | undefined): string {
  const forwarded = headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY && typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return remoteAddress ?? '';
}

/** Allows at most `max` hits per key within a sliding window. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Records a hit; returns false if the key is over its limit. */
  hit(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  /** Whether the key is currently over its limit, without recording a hit. */
  blocked(key: string): boolean {
    const now = Date.now();
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs).length >= this.max;
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

/** Removes control and invisible formatting characters (e.g. right-to-left overrides) from a display name. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/\p{C}/gu, '').trim().slice(0, maxLength);
}
