'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { getSessionToken } from './profile';

export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  site: string;
}

const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
/** Punctuation that usually ends the sentence rather than the link. */
const TRAILING_RE = /[.,;:!?'"»)\]}]+$/;

export type TextPart = { text: string; href?: string };

function trimLink(raw: string) {
  let link = raw;
  // Keep a closing parenthesis that belongs to the link, e.g. a Wikipedia page.
  while (TRAILING_RE.test(link)) {
    const last = link[link.length - 1];
    if (last === ')' && (link.match(/\(/g)?.length ?? 0) >= (link.match(/\)/g)?.length ?? 0)) break;
    link = link.slice(0, -1);
  }
  return link;
}

const hrefOf = (link: string) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

/** The message text cut into plain parts and clickable links. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let from = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const link = trimLink(match[0]);
    const start = match.index!;
    if (start > from) parts.push({ text: text.slice(from, start) });
    parts.push({ text: link, href: hrefOf(link) });
    from = start + link.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from) });
  return parts;
}

/** The first web link in a message, the one shown as a preview. */
export function firstLink(text: string): string | null {
  const match = text.match(LINK_RE);
  if (!match) return null;
  const href = hrefOf(trimLink(match[0]));
  try {
    const url = new URL(href);
    return url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Promise<LinkPreview | null>>();

function loadPreview(url: string) {
  let pending = cache.get(url);
  if (!pending) {
    pending = api<{ preview: LinkPreview | null }>(`/link-preview?url=${encodeURIComponent(url)}`, { token: getSessionToken() })
      .then((res) => res.preview)
      .catch(() => {
        cache.delete(url);
        return null;
      });
    cache.set(url, pending);
  }
  return pending;
}

/** Preview of a shared link (title, description, image), null while loading or when the page has none. */
export function useLinkPreview(url: string | null) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!url) return;
    let active = true;
    void loadPreview(url).then((p) => {
      if (active) setPreview(p);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return preview;
}
