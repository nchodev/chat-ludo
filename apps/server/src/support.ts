import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_CAPTION_LENGTH, MAX_IMAGE_BYTES, MAX_SUPPORT_TEXT, MAX_VOICE_BYTES, MAX_VOICE_MS, type SupportMessageView } from '@ludo/engine';
import { requireAdmin } from './admin';
import {
  HttpError,
  VOICE_MIME,
  imageType,
  ip,
  limit,
  pushTo,
  readBytes,
  registerRawRoutes,
  registerRoutes,
  requireUser,
} from './api';
import * as db from './db';
import { notify } from './notify';
import { RateLimiter, cleanText } from './security';
import { playableVoice } from './voice';

/**
 * Customer support: each signed-in player has one conversation with the LuChat team, who answer
 * from the admin panel. Text, photos and voice notes go both ways.
 */

const PAGE = 60;
/** Generous for a real conversation, tight enough to stop a flood. */
const playerLimiter = new RateLimiter(60, 60 * 60_000);
const playerMediaLimiter = new RateLimiter(20, 60 * 60_000);
/** Admin photos may be larger: screenshots of the panel, receipts… */
const MAX_ADMIN_IMAGE_BYTES = 4_000_000;

function params(req: IncomingMessage) {
  return new URL(req.url ?? '', 'http://x').searchParams;
}

function idParam(value: string | null | unknown, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} invalide.`);
  return n;
}

export function supportView(m: db.SupportMessage): SupportMessageView {
  return {
    id: m.id,
    kind: m.kind,
    body: m.body,
    fromStaff: m.fromStaff,
    ...(m.width && m.height ? { width: m.width, height: m.height } : {}),
    ...(m.durationMs ? { durationMs: m.durationMs } : {}),
    createdAt: m.createdAt,
  };
}

function adminView(m: db.SupportMessage) {
  return { ...supportView(m), adminEmail: m.adminEmail };
}

function preview(m: db.SupportMessage): string {
  if (m.kind === 'voice') return '🎤 Message vocal';
  if (m.kind === 'image') return m.body ? `📷 ${m.body}` : '📷 Photo';
  return m.body.length > 140 ? `${m.body.slice(0, 139)}…` : m.body;
}

/** A new message reaches the player's open apps; a reply from support is also notified. */
function deliver(message: db.SupportMessage, exceptSocket?: string) {
  pushTo(message.userId, 'support:message', [supportView(message)], exceptSocket);
  if (message.fromStaff) {
    notify(message.userId, { kind: 'support', title: 'Réponse de l’assistance', body: preview(message), url: '/assistance' }, { tag: 'support' });
  }
}

function existingUser(rawId: unknown): db.User {
  const user = db.getUser(idParam(rawId, 'Joueur'));
  if (!user) throw new HttpError(404, 'Joueur introuvable.');
  return user;
}

/** Reads an uploaded photo or voice note from the request, checked like chat files. */
async function readUpload(req: IncomingMessage, maxImage: number) {
  const q = params(req);
  const kind = q.get('kind');
  if (kind === 'image') {
    const width = Number(q.get('width'));
    const height = Number(q.get('height'));
    const side = (n: number) => Number.isInteger(n) && n > 0 && n <= 10_000;
    if (!side(width) || !side(height)) throw new HttpError(400, 'Dimensions de la photo invalides.');
    const data = await readBytes(req, maxImage, 'Photo trop lourde.');
    const mime = imageType(data);
    if (!mime) throw new HttpError(415, 'Format de photo non pris en charge (JPEG, PNG ou WebP).');
    return {
      message: { kind: 'image' as const, body: cleanText(q.get('caption'), MAX_CAPTION_LENGTH), width, height },
      media: { mime, data },
    };
  }
  if (kind === 'voice') {
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!VOICE_MIME.test(mime)) throw new HttpError(415, 'Format audio non pris en charge.');
    const durationMs = Math.round(Number(q.get('duration')));
    if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > MAX_VOICE_MS + 1000) {
      throw new HttpError(400, 'Durée du message vocal invalide.');
    }
    const data = await readBytes(req, MAX_VOICE_BYTES, 'Message vocal trop long.');
    if (data.length < 100) throw new HttpError(400, 'Message vocal vide.');
    // Converted once here, so it plays on every phone (see voice.ts).
    const audio = await playableVoice({ mime, data });
    return { message: { kind: 'voice' as const, body: '', durationMs: Math.min(durationMs, MAX_VOICE_MS) }, media: audio };
  }
  throw new HttpError(400, 'Type de fichier inconnu.');
}

function sendFile(res: ServerResponse, media: { mime: string; data: Uint8Array } | null) {
  if (!media) throw new HttpError(404, 'Fichier introuvable.');
  res.writeHead(200, {
    'Content-Type': media.mime,
    'Content-Length': media.data.length,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.end(Buffer.from(media.data));
}

function playerThread(user: db.User, before: number | null) {
  const messages = db.supportMessages(user.id, before, PAGE + 1);
  const more = messages.length > PAGE;
  return {
    messages: (more ? messages.slice(1) : messages).map(supportView),
    unread: db.supportUnreadForUser(user.id),
    more,
  };
}

export function registerSupportRoutes() {
  registerRoutes({
    /* ---------------------------- Players ---------------------------- */

    'GET /api/support': (req) => {
      const user = requireUser(req);
      const before = params(req).get('before');
      return playerThread(user, before ? idParam(before, 'Message') : null);
    },

    'GET /api/support/unread': (req) => ({ unread: db.supportUnreadForUser(requireUser(req).id) }),

    'POST /api/support/send': (req, body) => {
      const user = requireUser(req);
      limit(playerLimiter, `${ip(req)}:${user.id}`);
      const text = cleanText(body.text, MAX_SUPPORT_TEXT);
      if (!text) throw new HttpError(400, 'Écris ton message.');
      const message = db.addSupportMessage(user.id, null, { kind: 'text', body: text });
      deliver(message, typeof body.socketId === 'string' ? body.socketId : undefined);
      return { message: supportView(message) };
    },

    'POST /api/support/read': (req) => {
      const user = requireUser(req);
      db.markSupportRead(user.id, 'user');
      return { unread: 0 };
    },

    /* ----------------------------- Admins ---------------------------- */

    'GET /api/admin/support': (req) => {
      requireAdmin(req);
      const q = params(req);
      const raw = q.get('status');
      const status = raw === 'closed' || raw === 'all' ? raw : 'open';
      return {
        threads: db.listSupportThreads(status, cleanText(q.get('q'), 40)),
        unreadThreads: db.supportUnreadThreads(),
      };
    },

    'GET /api/admin/support/unread': (req) => {
      requireAdmin(req);
      return { unreadThreads: db.supportUnreadThreads() };
    },

    /** The conversation with a player; opening it marks the player's messages read. */
    'GET /api/admin/support/thread': (req) => {
      requireAdmin(req);
      const q = params(req);
      const user = existingUser(q.get('user'));
      const before = q.get('before');
      const messages = db.supportMessages(user.id, before ? idParam(before, 'Message') : null, PAGE + 1);
      const more = messages.length > PAGE;
      if (!before) db.markSupportRead(user.id, 'admin');
      return {
        player: db.playerSummary(user.id),
        thread: db.supportThread(user.id),
        messages: (more ? messages.slice(1) : messages).map(adminView),
        more,
      };
    },

    'POST /api/admin/support/send': (req, body) => {
      const admin = requireAdmin(req);
      const user = existingUser(body.userId);
      const text = cleanText(body.text, MAX_SUPPORT_TEXT);
      if (!text) throw new HttpError(400, 'Écris ta réponse.');
      const message = db.addSupportMessage(user.id, admin.id, { kind: 'text', body: text });
      deliver(message);
      return { message: adminView(message) };
    },

    'POST /api/admin/support/status': (req, body) => {
      const admin = requireAdmin(req);
      const user = existingUser(body.userId);
      const status = body.status === 'closed' ? 'closed' : 'open';
      if (!db.setSupportStatus(user.id, status)) throw new HttpError(404, 'Conversation introuvable.');
      db.logAdminAction(admin.id, status === 'closed' ? 'support.close' : 'support.reopen', `user:${user.id}`);
      return { thread: db.supportThread(user.id) };
    },
  });

  registerRawRoutes({
    'POST /api/support/upload': async (req) => {
      const user = requireUser(req);
      limit(playerLimiter, `${ip(req)}:${user.id}`);
      limit(playerMediaLimiter, `${ip(req)}:${user.id}`);
      const { message, media } = await readUpload(req, MAX_IMAGE_BYTES);
      const saved = db.addSupportMessage(user.id, null, message, media);
      deliver(saved, params(req).get('socketId') ?? undefined);
      return { message: supportView(saved) };
    },

    'GET /api/support/media': async (req, res) => {
      const user = requireUser(req);
      const message = db.getSupportMessage(idParam(params(req).get('id'), 'Message'));
      if (!message || message.userId !== user.id) throw new HttpError(404, 'Fichier introuvable.');
      sendFile(res, db.getSupportMedia(message.id));
    },

    'POST /api/admin/support/upload': async (req) => {
      const admin = requireAdmin(req);
      const user = existingUser(params(req).get('user'));
      const { message, media } = await readUpload(req, MAX_ADMIN_IMAGE_BYTES);
      const saved = db.addSupportMessage(user.id, admin.id, message, media);
      deliver(saved);
      return { message: adminView(saved) };
    },

    'GET /api/admin/support/media': async (req, res) => {
      requireAdmin(req);
      const message = db.getSupportMessage(idParam(params(req).get('id'), 'Message'));
      if (!message) throw new HttpError(404, 'Fichier introuvable.');
      sendFile(res, db.getSupportMedia(message.id));
    },
  });
}
