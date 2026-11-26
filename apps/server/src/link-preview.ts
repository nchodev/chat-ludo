import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  site: string;
}

const TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const FAILED_TTL_MS = 30 * 60_000;
const MAX_CACHE = 1000;

/** Addresses a preview must never reach: loopback, private networks, link-local, multicast… */
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return !blocked.check(address, 'ipv6');
  return false;
}

/** DNS lookup that refuses non-public addresses, checked on the address actually connected to. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as unknown as LookupAddress[];
    const allowed = list.filter((a) => isPublicAddress(a.address));
    if (!allowed.length || allowed.length !== list.length) {
      return callback(Object.assign(new Error('Adresse non autorisée'), { code: 'EBLOCKED' }), '', 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, allowed);
    callback(null, allowed[0].address, allowed[0].family);
  });
};

/** Only plain web pages on their default port, never credentials in the URL. */
export function normalizePreviewUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) ? !isPublicAddress(host) : !host.includes('.') || /\.(local|localhost|internal|lan|home|corp)$/i.test(host)) {
    return null;
  }
  url.hash = '';
  return url;
}

function fetchOnce(url: URL): Promise<{ status: number; location?: string; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LuChatBot/1.0; +link-preview)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'Accept-Language': 'fr,en;q=0.8',
          'Accept-Encoding': 'identity',
        },
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: Buffer.alloc(0) });
        }
        if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
          res.resume();
          return resolve({ status, type, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let tail = '';
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          const text = tail + chunk.toString('latin1');
          tail = text.slice(-8);
          // The <head> is all we need: stop once it is complete or the page is too big.
          if (size >= MAX_HTML_BYTES || /<\/head>/i.test(text)) {
            res.destroy();
            resolve({ status, type, body: Buffer.concat(chunks).subarray(0, MAX_HTML_BYTES) });
          }
        });
        res.on('end', () => resolve({ status, type, body: Buffer.concat(chunks) }));
        res.on('close', () => resolve({ status, type, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    const deadline = setTimeout(() => request.destroy(new Error('Délai dépassé')), TIMEOUT_MS * 2);
    request.on('timeout', () => request.destroy(new Error('Délai dépassé')));
    request.on('error', reject);
    request.on('close', () => clearTimeout(deadline));
    request.end();
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const clean = (text: string | undefined, max: number) => {
  if (!text) return null;
  const value = decodeEntities(text)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

function decodeHtml(body: Buffer, contentType: string) {
  const head = body.subarray(0, 4096).toString('latin1');
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return body.toString('utf8');
  }
}

function parseAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function parsePreview(html: string, pageUrl: URL): LinkPreview | null {
  const headEnd = html.search(/<\/head>|<body[\s>]/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html;
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(m[0]);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = attrs.content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, 140);
  if (!title) return null;

  let image: string | null = null;
  const rawImage = meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? meta['twitter:image:src'];
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage.trim()), pageUrl);
      if (resolved.protocol === 'http:') resolved.protocol = 'https:';
      image = normalizePreviewUrl(resolved.href)?.href ?? null;
    } catch {
      image = null;
    }
  }

  return {
    url: pageUrl.href,
    title,
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 240),
    image,
    site: clean(meta['og:site_name'], 60) ?? pageUrl.hostname.replace(/^www\./, ''),
  };
}

async function fetchPreview(start: URL): Promise<LinkPreview | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchOnce(url);
    if (res.location) {
      let next: URL | null = null;
      try {
        next = normalizePreviewUrl(new URL(res.location, url).href);
      } catch {
        next = null;
      }
      if (!next) return null;
      url = next;
      continue;
    }
    if (!res.body.length) return null;
    return parsePreview(decodeHtml(res.body, res.type), url);
  }
  return null;
}

const cache = new Map<string, { at: number; preview: LinkPreview | null; pending?: Promise<LinkPreview | null> }>();

/** Title, description and image of a public web page; null when it has none or can't be reached. */
export async function linkPreview(url: URL): Promise<LinkPreview | null> {
  const key = url.href;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit?.pending) return hit.pending;
  if (hit && now - hit.at < (hit.preview ? CACHE_TTL_MS : FAILED_TTL_MS)) return hit.preview;

  const pending = fetchPreview(url).catch(() => null);
  cache.set(key, { at: now, preview: null, pending });
  const preview = await pending;
  cache.delete(key);
  cache.set(key, { at: Date.now(), preview });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return preview;
}
