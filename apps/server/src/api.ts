import { createHash, randomBytes } from 'node:crypto';
import { PaymentError, checkDeposit, handlePaymentWebhook, paymentSettings, paymentsView, requestWithdrawal, startDeposit } from './payments';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  COLORS,
  BOT_LEVELS,
  ProgressError,
  buyItem,
  claimLoginBonus,
  completeTutorial,
  gameResult,
  importGuestProfile,
  isColor,
  isReactionEmoji,
  chatPreviewText,
  REFERRAL_CODE,
  type NotificationsView,
  type ReferralRules,
  type ChatInvite,
  type ReferralView,
  MAX_CAPTION_LENGTH,
  MAX_FORWARD_TARGETS,
  MESSAGE_EDIT_WINDOW_MS,
  MAX_IMAGE_BYTES,
  MAX_VOICE_BYTES,
  MAX_VOICE_MS,
  isShopItem,
  levelInfo,
  newProfile,
  recordDraughtsGame,
  recordGame,
  replayGame,
  sanitizeRules,
  setAppearance,
  stakeConfig,
  utcDay,
  type Color,
  type GameState,
  type OpponentKind,
  type PlayerInfo,
  type Profile,
  type ChatMessageView,
  type ServerToClientEvents,
  MAX_GROUP_MEMBERS,
  MAX_GROUP_NAME,
  groupKey,
  parseGroupKey,
  type GroupEvent,
  type GroupView,
  type DuelGame,
} from '@ludo/engine';
import * as db from './db';
import { meaningfulIp } from './identity';
import { dummyHash, hashPassword, verifyPassword } from './passwords';
import { linkPreview, normalizePreviewUrl } from './link-preview';
import { notify } from './notify';
import { VAPID_PUBLIC_KEY, sendPush } from './push';
import { RateLimiter, cleanText, clientIp } from './security';
import { playableVoice } from './voice';

const MAX_BODY_BYTES = 256 * 1024;
const USERNAME_RE = /^[\p{L}\p{N}_-]{3,16}$/u;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
/** Games end at least this far apart for one player; quicker results are not counted. */
const MIN_GAME_INTERVAL_MS = 30_000;
/** Local games can't be fully verified (the device rolls the dice), so their rewards are capped. */
const MAX_LOCAL_GAMES_PER_DAY = 30;
const MAX_HISTORY = 5000;
const MAX_CHAT_MESSAGE = 500;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const loginLimiter = new RateLimiter(10, 5 * 60_000);
const registerLimiter = new RateLimiter(10, 60 * 60_000);
const friendRequestLimiter = new RateLimiter(30, 60 * 60_000);
const messageLimiter = new RateLimiter(120, 60 * 60_000);
const imageLimiter = new RateLimiter(40, 60 * 60_000);
const reportLimiter = new RateLimiter(20, 60 * 60_000);
const linkPreviewLimiter = new RateLimiter(120, 10 * 60_000);
const profileLookupLimiter = new RateLimiter(120, 10 * 60_000);
const paymentLimiter = new RateLimiter(10, 60 * 60_000);
const depositCheckLimiter = new RateLimiter(60, 10 * 60_000);

export function limit(limiter: RateLimiter, key: string) {
  if (!limiter.hit(key)) throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
}

const lastRewardedGame = new Map<number, number>();
const localGamesToday = new Map<string, number>();

/**
 * Whether a finished game may be credited to this player now: games can't end closer
 * than MIN_GAME_INTERVAL_MS apart, and local games are capped per day.
 */
function claimRewardSlot(userId: number, local: boolean): string | null {
  const now = Date.now();
  if (now - (lastRewardedGame.get(userId) ?? 0) < MIN_GAME_INTERVAL_MS) return 'Partie trop courte pour être comptée.';
  const key = `${userId}:${utcDay()}`;
  if (local && (localGamesToday.get(key) ?? 0) >= MAX_LOCAL_GAMES_PER_DAY) {
    return 'Limite de parties récompensées atteinte pour aujourd’hui.';
  }
  lastRewardedGame.set(userId, now);
  if (local) {
    if (localGamesToday.size > 10_000) localGamesToday.clear();
    localGamesToday.set(key, (localGamesToday.get(key) ?? 0) + 1);
  }
  return null;
}

export interface PublicProfile {
  username: string;
  profile: Profile;
  rank: number;
  /** Purchased coins, kept apart from the profile's earned coins. */
  premiumCoins: number;
  /** The player certified being 18 or older, which anything Premium requires. */
  adultConfirmed: boolean;
  /** Real name, sent only to the player themselves; null for accounts made before it was asked. */
  fullName: string | null;
}

/** The signed-in player's own account (never sent to other players: it holds their real name). */
function publicProfile(user: db.User): PublicProfile {
  return {
    username: user.username,
    profile: user.profile,
    rank: db.rankOf(user.id),
    premiumCoins: db.getWallet(user.id).premium,
    adultConfirmed: db.adultConfirmedAt(user.id) !== null,
    fullName: db.fullNameOf(user.id),
  };
}

/** First name(s) and last name: letters of any alphabet, spaces, apostrophes, hyphens and dots. */
const FULL_NAME_RE = /^\p{L}[\p{L}\p{M}'’.-]*( [\p{L}\p{M}'’.-]+)+$/u;
const MAX_FULL_NAME = 60;

function fullNameField(value: unknown): string {
  const name = typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
  if (name.length < 3 || name.length > MAX_FULL_NAME || !FULL_NAME_RE.test(name)) {
    throw new HttpError(400, `Nom complet : ton prénom et ton nom, en lettres (${MAX_FULL_NAME} caractères au plus).`);
  }
  return name;
}

function newSession(userId: number): string {
  const token = randomBytes(32).toString('base64url');
  db.createSession(token, userId);
  return token;
}

/** Resolves a session token to a user id, or null. */
export function userIdForToken(token: unknown): number | null {
  return typeof token === 'string' && token.length > 0 ? db.sessionUserId(token) : null;
}

export function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

export function requireUser(req: IncomingMessage): db.User {
  const id = userIdForToken(bearer(req));
  const user = id ? db.getUser(id) : null;
  if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
  return user;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

function credentials(body: Record<string, unknown>) {
  const username = typeof body.username === 'string' ? body.username.normalize('NFKC').trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > MAX_PASSWORD) throw new HttpError(400, `Mot de passe : au plus ${MAX_PASSWORD} caractères.`);
  return { username, password };
}

function parsePlayers(raw: unknown): PlayerInfo[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) throw new HttpError(400, 'Résultat de partie invalide.');
  return raw.map((p) => {
    if (!p || !isColor(p.color)) throw new HttpError(400, 'Résultat de partie invalide.');
    return { color: p.color, name: cleanText(p.name, 20) || 'Joueur' };
  });
}

function parseOpponents(raw: unknown): Partial<Record<Color, OpponentKind>> {
  const result: Partial<Record<Color, OpponentKind>> = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const color of COLORS) {
    const o = (raw as Record<string, any>)[color];
    if (o?.kind === 'bot' && BOT_LEVELS.includes(o.level)) result[color] = { kind: 'bot', level: o.level };
    else if (o?.kind === 'human') result[color] = { kind: 'human', online: false };
  }
  return result;
}

function accountByUsername(raw: unknown): db.User {
  const username = typeof raw === 'string' ? raw.normalize('NFKC').trim() : '';
  const user = username ? db.findUserByUsername(username) : null;
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
  return user;
}

function requireFriend(user: db.User, rawUsername: unknown): db.User {
  const friend = accountByUsername(rawUsername);
  if (!db.areFriends(user.id, friend.id)) throw new HttpError(403, 'Ajoute cette personne en ami avant de discuter.');
  return friend;
}

/** Where a message goes: a friend, or a group the user belongs to (`g:<id>`). */
type Conversation = { friend: db.User; group?: undefined } | { group: db.Group; friend?: undefined };

function requireGroup(user: db.User, groupId: number | null): db.Group {
  const group = groupId !== null && db.groupMembership(groupId, user.id) ? db.getGroup(groupId) : null;
  if (!group) throw new HttpError(404, 'Groupe introuvable.');
  return group;
}

function requireConversation(user: db.User, rawTo: unknown): Conversation {
  const groupId = parseGroupKey(rawTo);
  if (groupId !== null) return { group: requireGroup(user, groupId) };
  return { friend: requireFriend(user, rawTo) };
}

function storeIn(user: db.User, to: Conversation, message: db.NewMessage): db.StoredMessage {
  return to.group ? db.storeGroupMessage(user.id, to.group.id, message) : db.storeMessage(user.id, to.friend.id, message);
}

function groupView(group: db.Group): GroupView {
  return {
    id: group.id,
    key: groupKey(group.id),
    name: group.name,
    createdBy: group.createdBy,
    members: group.members.map((m) => ({ username: m.username, admin: m.admin })),
  };
}

/** `readFloor`: for group messages, the newest id every member has read (looked up when not given). */
function messageView(message: db.StoredMessage, viewerId: number, readFloor?: number): ChatMessageView {
  const inGroup = message.groupId !== null;
  const mine = message.senderId === viewerId;
  const floor = inGroup && mine ? (readFloor ?? db.groupReadFloor(message.groupId!)) : 0;
  return {
    id: message.id,
    from: message.sender,
    to: inGroup ? groupKey(message.groupId!) : message.recipient,
    group: message.groupId,
    ...(inGroup && message.groupName !== null ? { groupName: message.groupName } : {}),
    mine,
    body: message.body,
    createdAt: message.createdAt,
    readAt: inGroup ? (mine && floor >= message.id ? message.createdAt : null) : message.readAt,
    kind: message.kind,
    durationMs: message.durationMs,
    replyTo: message.replyTo,
    forwarded: message.forwarded,
    deleted: message.deleted,
    ...(message.edited ? { edited: true } : {}),
    reactions: message.reactions,
  };
}

type PushEvent = 'chat:message' | 'chat:read' | 'chat:updated' | 'chat:removed' | 'social:changed' | 'support:message';
type PushPayload<E extends PushEvent> = Parameters<ServerToClientEvents[E]>;
/** Delivers an event to every connection of a player; `exceptSocket` skips the connection that caused it. */
export type Push = <E extends PushEvent>(userId: number, event: E, args: PushPayload<E>, exceptSocket?: string) => void;

let push: Push = () => {};
let hasOpenConnection: (userId: number) => boolean = () => false;

/** Sends an event to every open app of a player (see `Push`). */
export function pushTo<E extends PushEvent>(userId: number, event: E, args: PushPayload<E>, exceptSocket?: string) {
  push(userId, event, args, exceptSocket);
}

export function setPush(fn: Push, isConnected: (userId: number) => boolean) {
  push = fn;
  hasOpenConnection = isConnected;
}

/** Only the browsers' own push services: a subscription must not make the server call arbitrary URLs. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];
const MAX_PUSH_DEVICES = 5;

function parseSubscription(raw: unknown): db.PushSubscriptionRow {
  const sub = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  let url: URL | null = null;
  try {
    url = endpoint.length <= 1000 ? new URL(endpoint) : null;
  } catch {
    url = null;
  }
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  const valid =
    url?.protocol === 'https:' &&
    PUSH_HOSTS.some((h) => h.test(url.hostname)) &&
    typeof p256dh === 'string' && /^[\w-]{20,200}$/.test(p256dh) &&
    typeof auth === 'string' && /^[\w-]{8,100}$/.test(auth);
  if (!valid) throw new HttpError(400, 'Abonnement aux notifications invalide.');
  return { endpoint, p256dh: p256dh as string, auth: auth as string };
}

function previewText(message: db.StoredMessage) {
  const text = chatPreviewText(message);
  return message.forwarded && message.kind === 'text' ? `Transféré : ${text}` : text;
}

function notifyByPush(recipient: db.User, sender: db.User, text: string) {
  if (hasOpenConnection(recipient.id)) return;
  void sendPush(recipient.id, {
    title: sender.username,
    body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
    url: `/?chat=${encodeURIComponent(sender.username)}`,
    tag: `chat-${sender.username}`,
  });
}

/** A message of a conversation the user is part of (a current member, for a group) and hasn't hidden. */
function ownMessage(user: db.User, rawId: unknown): db.StoredMessage {
  const id = typeof rawId === 'number' && Number.isInteger(rawId) ? rawId : Number.NaN;
  const message = Number.isFinite(id) ? db.getMessage(id) : null;
  const membership = message?.groupId != null ? db.groupMembership(message.groupId, user.id) : null;
  const visible =
    message &&
    (message.groupId !== null
      ? !!membership && message.id > membership.historyFrom
      : message.senderId === user.id || message.recipientId === user.id);
  if (!message || !visible || db.isHidden(message.id, user.id)) throw new HttpError(404, 'Message introuvable.');
  return message;
}

function memberIds(message: db.StoredMessage): number[] {
  return message.groupId !== null ? (db.getGroup(message.groupId)?.members.map((m) => m.userId) ?? []) : [message.senderId, message.recipientId];
}

/** Id of a message of this conversation to quote, or null. */
function replyTarget(user: db.User, to: Conversation, rawId: unknown): number | null {
  if (rawId === undefined || rawId === null) return null;
  const quoted = ownMessage(user, rawId);
  const inThread = to.group
    ? quoted.groupId === to.group.id
    : quoted.groupId === null && [quoted.senderId, quoted.recipientId].includes(to.friend.id);
  if (!inThread || quoted.kind === 'system') throw new HttpError(400, 'On ne peut répondre qu’à un message de cette discussion.');
  return quoted.id;
}

function notifyGroupByPush(member: db.GroupMemberRow, group: db.Group, sender: db.User, text: string) {
  if (hasOpenConnection(member.userId)) return;
  const line = `${sender.username} : ${text}`;
  void sendPush(member.userId, {
    title: group.name,
    body: line.length > 140 ? `${line.slice(0, 139)}…` : line,
    url: `/?chat=${encodeURIComponent(groupKey(group.id))}`,
    tag: `chat-${groupKey(group.id)}`,
  });
}

/** Sends a stored message live to everyone in the conversation and to the phones of those away. */
function broadcastNew(user: db.User, to: Conversation, message: db.StoredMessage, fromSocket?: string) {
  if (to.group) {
    const floor = db.groupReadFloor(to.group.id);
    for (const member of db.getGroup(to.group.id)?.members ?? []) {
      push(member.userId, 'chat:message', [messageView(message, member.userId, floor)], member.userId === user.id ? fromSocket : undefined);
      if (member.userId !== user.id && message.kind !== 'system') notifyGroupByPush(member, to.group, user, previewText(message));
    }
    return messageView(message, user.id, floor);
  }
  push(to.friend.id, 'chat:message', [messageView(message, to.friend.id)]);
  push(user.id, 'chat:message', [messageView(message, user.id)], fromSocket);
  notifyByPush(to.friend, user, previewText(message));
  return messageView(message, user.id);
}

/** Tells everyone in the conversation that a message changed (reactions, deletion). */
function broadcastUpdate(message: db.StoredMessage, fromSocket?: string) {
  const fresh = db.getMessage(message.id)!;
  for (const id of new Set(memberIds(fresh))) push(id, 'chat:updated', [messageView(fresh, id)], fromSocket);
  return fresh;
}

/** Stores a message and delivers it live to both players' other connections. */
export function deliverMessage(
  user: db.User,
  rawFriend: unknown,
  rawText: unknown,
  ipKey: string,
  fromSocket?: string,
  rawReplyTo?: unknown,
) {
  limit(messageLimiter, `${ipKey}:${user.id}`);
  const to = requireConversation(user, rawFriend);
  const text = cleanText(rawText, MAX_CHAT_MESSAGE);
  if (!text) throw new HttpError(400, 'Message vide.');
  const message = storeIn(user, to, { body: text, replyTo: replyTarget(user, to, rawReplyTo) });
  return broadcastNew(user, to, message, fromSocket);
}

/** Sends a friend a card inviting them to a room the user just created. */
export function deliverInvite(user: db.User, rawFriend: unknown, invite: ChatInvite, ipKey: string, fromSocket?: string) {
  limit(messageLimiter, `${ipKey}:${user.id}`);
  const friend = requireFriend(user, rawFriend);
  const message = db.storeMessage(user.id, friend.id, { body: JSON.stringify(invite), kind: 'invite' });
  return broadcastNew(user, { friend }, message, fromSocket);
}

export function reactToMessage(user: db.User, rawId: unknown, rawEmoji: unknown, fromSocket?: string) {
  const message = ownMessage(user, rawId);
  if (message.deleted) throw new HttpError(400, 'Ce message a été supprimé.');
  if (message.kind === 'system') throw new HttpError(400, 'On ne réagit pas à ce message.');
  if (rawEmoji !== null && !isReactionEmoji(rawEmoji)) throw new HttpError(400, 'Réaction invalide.');
  db.setReaction(message.id, user.id, rawEmoji);
  broadcastUpdate(message, fromSocket);
}

/** A moderator removes a message for both people, as if its sender had deleted it. */
export function moderateMessage(messageId: number) {
  const message = db.getMessage(messageId);
  if (!message) throw new HttpError(404, 'Message introuvable.');
  if (!message.deleted) db.deleteMessageForAll(message.id);
  broadcastUpdate(message);
}

const MAX_REPORT_REASON = 200;

/** Flags a message received from someone else for the moderators. */
export function reportMessage(user: db.User, rawId: unknown, rawReason: unknown, ipKey: string) {
  const message = ownMessage(user, rawId);
  if (message.senderId === user.id) throw new HttpError(400, 'Tu ne peux pas signaler ton propre message.');
  if (message.kind === 'system') throw new HttpError(400, 'Ce message ne peut pas être signalé.');
  if (message.deleted) throw new HttpError(400, 'Ce message a été supprimé.');
  limit(reportLimiter, `${ipKey}:${user.id}`);
  const reason = cleanText(rawReason, MAX_REPORT_REASON) || 'Sans précision';
  return { duplicate: db.reportMessage(message.id, user.id, reason) === 'duplicate' };
}

/** Its sender (or a group administrator) can delete a message for everyone; anyone can hide it for themselves. */
export function deleteMessage(user: db.User, rawId: unknown, forAll: boolean, fromSocket?: string) {
  const message = ownMessage(user, rawId);
  if (forAll) {
    const groupAdmin = message.groupId !== null && !!db.groupMembership(message.groupId, user.id)?.admin;
    if (message.kind === 'system') throw new HttpError(400, 'Ce message ne peut pas être supprimé pour tous.');
    if (message.senderId !== user.id && !groupAdmin) throw new HttpError(403, 'Tu ne peux supprimer pour tous que tes propres messages.');
    if (!message.deleted) db.deleteMessageForAll(message.id);
    broadcastUpdate(message, fromSocket);
  } else {
    db.hideMessage(message.id, user.id);
    push(user.id, 'chat:removed', [{ id: message.id }], fromSocket);
  }
}

/** Its sender corrects a text message, within MESSAGE_EDIT_WINDOW_MS of sending it. */
export function editMessage(user: db.User, rawId: unknown, rawText: unknown, ipKey: string, fromSocket?: string) {
  const message = ownMessage(user, rawId);
  if (message.senderId !== user.id) throw new HttpError(403, 'Tu ne peux modifier que tes propres messages.');
  if (message.deleted) throw new HttpError(400, 'Ce message a été supprimé.');
  if (message.kind !== 'text' || message.forwarded) throw new HttpError(400, 'Seul un texte que tu as écrit peut être modifié.');
  if (Date.now() - message.createdAt >= MESSAGE_EDIT_WINDOW_MS) {
    throw new HttpError(400, `Un message ne peut être modifié que dans les ${MESSAGE_EDIT_WINDOW_MS / 60_000} minutes après son envoi.`);
  }
  limit(messageLimiter, `${ipKey}:${user.id}`);
  const text = cleanText(rawText, MAX_CHAT_MESSAGE);
  if (!text) throw new HttpError(400, 'Message vide.');
  if (text === message.body) return;
  db.editMessage(message.id, text);
  broadcastUpdate(message, fromSocket);
}

/** Copies a message (text, voice note or photo) into conversations with other friends. */
export function forwardMessage(user: db.User, rawId: unknown, rawTargets: unknown, ipKey: string, fromSocket?: string) {
  const original = ownMessage(user, rawId);
  if (original.deleted) throw new HttpError(400, 'Ce message a été supprimé.');
  if (original.kind === 'invite') throw new HttpError(400, 'Une invitation ne se transfère pas : défie plutôt ton ami directement.');
  const names = Array.isArray(rawTargets) ? [...new Set(rawTargets)] : [];
  if (names.length === 0 || names.length > MAX_FORWARD_TARGETS) {
    throw new HttpError(400, `Choisis entre 1 et ${MAX_FORWARD_TARGETS} amis.`);
  }
  if (original.kind === 'system') throw new HttpError(400, 'Ce message ne se transfère pas.');
  const targets = names.map((name) => requireConversation(user, name));
  const hasMedia = original.kind === 'voice' || original.kind === 'image';
  const media = hasMedia ? db.getMedia(original.id) : null;
  if (hasMedia && !media) throw new HttpError(404, original.kind === 'voice' ? 'Message vocal introuvable.' : 'Photo introuvable.');
  return targets.map((to) => {
    limit(messageLimiter, `${ipKey}:${user.id}`);
    const copy = storeIn(user, to, {
      body: original.body,
      kind: original.kind,
      durationMs: original.durationMs,
      forwarded: true,
    });
    if (media) db.storeMedia(copy.id, media.mime, media.data);
    return broadcastNew(user, to, copy, fromSocket);
  });
}

export const VOICE_MIME = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)(;.*)?$/;

export async function readBytes(req: IncomingMessage, max: number, tooBig: string): Promise<Buffer> {
  if (Number(req.headers['content-length'] ?? 0) > max) throw new HttpError(413, tooBig);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new HttpError(413, tooBig);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** The file's real type from its first bytes, whatever the client claims: only plain raster formats. */
export function imageType(data: Buffer): string | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** POST /api/messages/image?to=…&width=…&height=…&caption=…&replyTo=… with the photo as the raw body. */
async function receiveImage(req: IncomingMessage) {
  const user = requireUser(req);
  limit(messageLimiter, `${ip(req)}:${user.id}`);
  limit(imageLimiter, `${ip(req)}:${user.id}`);
  const params = new URL(req.url ?? '', 'http://x').searchParams;
  const to = requireConversation(user, params.get('to'));
  const width = Number(params.get('width'));
  const height = Number(params.get('height'));
  const side = (n: number) => Number.isInteger(n) && n > 0 && n <= 10_000;
  if (!side(width) || !side(height)) throw new HttpError(400, 'Dimensions de la photo invalides.');
  const caption = cleanText(params.get('caption'), MAX_CAPTION_LENGTH);
  const replyParam = params.get('replyTo');
  const replyTo = replyTarget(user, to, replyParam ? Number(replyParam) : null);
  const data = await readBytes(req, MAX_IMAGE_BYTES, 'Photo trop lourde.');
  const mime = imageType(data);
  if (!mime) throw new HttpError(415, 'Format de photo non pris en charge (JPEG, PNG ou WebP).');
  const message = storeIn(user, to, { body: JSON.stringify({ width, height, caption }), kind: 'image', replyTo });
  db.storeMedia(message.id, mime, data);
  return { message: broadcastNew(user, to, db.getMessage(message.id)!) };
}

/** POST /api/messages/voice?to=…&duration=…&replyTo=… with the recording as the raw body. */
async function receiveVoice(req: IncomingMessage) {
  const user = requireUser(req);
  limit(messageLimiter, `${ip(req)}:${user.id}`);
  const params = new URL(req.url ?? '', 'http://x').searchParams;
  const to = requireConversation(user, params.get('to'));
  const mime = (req.headers['content-type'] ?? '').split(';')[0].trim();
  if (!VOICE_MIME.test(mime)) throw new HttpError(415, 'Format audio non pris en charge.');
  const durationMs = Math.round(Number(params.get('duration')));
  if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > MAX_VOICE_MS + 1000) {
    throw new HttpError(400, 'Durée du message vocal invalide.');
  }
  const replyParam = params.get('replyTo');
  const replyTo = replyTarget(user, to, replyParam ? Number(replyParam) : null);
  const data = await readBytes(req, MAX_VOICE_BYTES, 'Message vocal trop long.');
  if (data.length < 100) throw new HttpError(400, 'Message vocal vide.');
  const audio = await playableVoice({ mime, data });
  const message = storeIn(user, to, { body: '', kind: 'voice', durationMs, replyTo });
  db.storeMedia(message.id, audio.mime, audio.data);
  return { message: broadcastNew(user, to, db.getMessage(message.id)!) };
}

/** GET /api/messages/media?id=… : the recording or photo of a message, for the two people in the conversation. */
async function sendMedia(req: IncomingMessage, res: ServerResponse) {
  const user = requireUser(req);
  const id = Number(new URL(req.url ?? '', 'http://x').searchParams.get('id'));
  const message = ownMessage(user, Number.isInteger(id) ? id : null);
  let media = (message.kind === 'voice' || message.kind === 'image') && !message.deleted ? db.getMedia(message.id) : null;
  if (!media) throw new HttpError(404, 'Fichier introuvable.');
  // Voice notes stored before the conversion are converted the first time someone asks for them.
  if (message.kind === 'voice') {
    const audio = await playableVoice(media);
    // Deleted while converting: don't bring the recording back.
    if (audio !== media && db.getMedia(message.id)) db.storeMedia(message.id, audio.mime, audio.data);
    media = audio;
  }
  res.writeHead(200, {
    'Content-Type': media.mime,
    'Content-Length': media.data.length,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.end(Buffer.from(media.data));
}

/** Marks a thread as read and tells the friend, so their ticks turn blue. */
export function readThread(user: db.User, friend: db.User) {
  const upTo = db.markThreadRead(user.id, friend.id);
  if (upTo) push(friend.id, 'chat:read', [{ by: user.username, upTo, at: Date.now() }]);
}

/** Marks a friend's thread or a group as read; in a group, ticks turn blue once every member has read. */
export function readConversation(user: db.User, rawWith: unknown) {
  const to = requireConversation(user, rawWith);
  if (!to.group) return readThread(user, to.friend);
  const { before, after } = db.markGroupRead(to.group.id, user.id);
  if (after <= before) return;
  for (const member of to.group.members) push(member.userId, 'chat:read', [{ by: groupKey(to.group.id), upTo: after, at: Date.now() }]);
}

/** Members of a group or the friend, for typing indicators: everyone but the user. */
export function conversationPeers(userId: number, rawTo: unknown): number[] {
  const user = db.getUser(userId);
  if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
  const to = requireConversation(user, rawTo);
  return to.group ? to.group.members.map((m) => m.userId).filter((id) => id !== userId) : [to.friend.id];
}

const groupLimiter = new RateLimiter(20, 60 * 60_000);

/** Posts "awa added moussa"-style lines in the group, for every member to see live. */
function postGroupEvent(actor: db.User, groupId: number, event: GroupEvent) {
  const group = db.getGroup(groupId);
  if (!group) return;
  const message = db.storeGroupMessage(actor.id, groupId, { body: JSON.stringify(event), kind: 'system' });
  broadcastNew(actor, { group }, message);
}

function tellMembers(userIds: Iterable<number>) {
  for (const id of new Set(userIds)) push(id, 'social:changed', []);
}

function groupName(raw: unknown): string {
  const name = cleanText(raw, MAX_GROUP_NAME);
  if (!name) throw new HttpError(400, 'Donne un nom au groupe.');
  return name;
}

function requireGroupAdmin(user: db.User, rawGroup: unknown): db.Group {
  const group = requireGroup(user, parseGroupKey(rawGroup));
  if (!group.members.find((m) => m.userId === user.id)?.admin) throw new HttpError(403, 'Seuls les administrateurs du groupe peuvent faire ça.');
  return group;
}

/** Friends of the user, by username, not in the group yet. */
function newMembers(user: db.User, raw: unknown, group: db.Group | null): db.User[] {
  const names = Array.isArray(raw) ? [...new Set(raw)] : [];
  const people = names.map((name) => requireFriend(user, name)).filter((p) => !group?.members.some((m) => m.userId === p.id));
  const total = (group?.members.length ?? 1) + people.length;
  if (total > MAX_GROUP_MEMBERS) throw new HttpError(400, `Un groupe compte au plus ${MAX_GROUP_MEMBERS} membres.`);
  return people;
}

function groupMemberOf(group: db.Group, raw: unknown): db.GroupMemberRow {
  const member = group.members.find((m) => m.username === raw);
  if (!member) throw new HttpError(404, 'Cette personne n’est pas dans le groupe.');
  return member;
}

export function friendOf(userId: number, rawUsername: unknown): db.User {
  const user = db.getUser(userId);
  if (!user) throw new HttpError(401, 'Connecte-toi pour continuer.');
  return requireFriend(user, rawUsername);
}

function socialState(user: db.User) {
  const friends = db.listFriends(user.id).map((friend) => ({
    username: friend.username,
    xp: friend.xp,
    wins: friend.wins,
    level: levelInfo(friend.xp).level,
    since: friend.since,
  }));
  const conversations = friends
    .map((friend) => {
      const other = db.findUserByUsername(friend.username);
      const last = other ? db.lastThreadMessage(user.id, other.id) : null;
      return {
        friend,
        lastMessage: last ? messageView(last, user.id) : null,
        unread: other ? db.unreadCount(user.id, other.id) : 0,
      };
    })
    .sort((a, b) => {
      const latest = (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0);
      return latest || a.friend.username.localeCompare(b.friend.username, 'fr', { sensitivity: 'base' });
    });

  const groups = db
    .groupIdsOf(user.id)
    .map((id) => db.getGroup(id))
    .filter((g): g is db.Group => !!g)
    .map((group) => {
      const last = db.lastGroupMessage(group.id, user.id);
      return { group: groupView(group), lastMessage: last ? messageView(last, user.id) : null, unread: db.groupUnreadCount(group.id, user.id) };
    });

  return {
    friends,
    incoming: db.listIncomingFriendRequests(user.id),
    outgoing: db.listOutgoingFriendRequests(user.id),
    conversations,
    groups,
  };
}

/** Applies a profile change for the signed-in user and returns the updated public profile. */
function mutate<T extends object>(user: db.User, change: (p: Profile) => { profile: Profile; result: T }, reason?: string, ref?: string) {
  try {
    const result = db.updateProfile(user.id, change, reason, ref);
    const updated = db.getUser(user.id)!;
    return { ...result, ...publicProfile(updated) };
  } catch (err) {
    if (err instanceof ProgressError) throw new HttpError(400, err.message);
    throw err;
  }
}

export type Handler = (req: IncomingMessage, body: Record<string, unknown>) => Promise<unknown> | unknown;

export const ip = (req: IncomingMessage) => clientIp(req.headers, req.socket.remoteAddress);

const routes: Record<string, Handler> = {
  'POST /api/register': async (req, body) => {
    const { username, password } = credentials(body);
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'Pseudo : 3 à 16 caractères (lettres, chiffres, - ou _).');
    }
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Mot de passe : au moins ${MIN_PASSWORD} caractères.`);
    const fullName = fullNameField(body.fullName);
    limit(registerLimiter, ip(req));
    if (db.usernameTaken(username)) throw new HttpError(409, 'Ce pseudo est déjà pris.');

    const profile = body.guestProfile ? importGuestProfile(body.guestProfile) : newProfile();
    const user = db.createUser(username, await hashPassword(password), profile, fullName);
    const code = typeof body.referrer === 'string' ? body.referrer.normalize('NFKC').trim() : '';
    const referrer = REFERRAL_CODE.test(code) ? db.findUserByUsername(code) : null;
    const device = typeof body.device === 'string' && /^[\w-]{8,64}$/.test(body.device) ? body.device : '';
    const referredBy = db.recordSignup(user.id, meaningfulIp(ip(req)), device, referrer?.id ?? null);
    if (referredBy) {
      // The invitation link is also a friend request already accepted: they can chat and play at once.
      db.createFriendship(user.id, referredBy);
      push(referredBy, 'social:changed', []);
      notify(referredBy, {
        kind: 'referral',
        title: `${user.username} a rejoint LuChat avec ton lien`,
        body: 'Vous êtes maintenant amis. Suis sa progression et tes bonus dans Parrainage.',
        url: '/parrainage',
      });
    }
    return { token: newSession(user.id), ...publicProfile(user) };
  },

  'POST /api/login': async (req, body) => {
    limit(loginLimiter, ip(req));
    const { username, password } = credentials(body);
    const user = db.findUserForLogin(username);
    const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !valid) throw new HttpError(401, 'Pseudo ou mot de passe incorrect.');
    if (user.banned) throw new HttpError(403, 'Ce compte est suspendu. Contacte le support.');
    return { token: newSession(user.id), ...publicProfile(user) };
  },

  'POST /api/logout': (req) => {
    const token = bearer(req);
    if (token) db.deleteSession(token);
    return { ok: true };
  },

  'GET /api/me': (req) => publicProfile(requireUser(req)),

  /** Adds or corrects the player's real name (accounts made before it was asked have none). */
  'POST /api/account/name': (req, body) => {
    const user = requireUser(req);
    db.setFullName(user.id, fullNameField(body.fullName));
    return publicProfile(user);
  },

  'POST /api/account/adult': (req, body) => {
    const user = requireUser(req);
    if (body.accept !== true) throw new HttpError(400, 'Coche la case pour attester avoir 18 ans ou plus.');
    db.confirmAdult(user.id, ip(req));
    return publicProfile(user);
  },

  'GET /api/notifications': (req): NotificationsView => {
    const user = requireUser(req);
    const before = Number(new URL(req.url ?? '', 'http://x').searchParams.get('before')) || undefined;
    return { items: db.notificationsOf(user.id, 40, before), unread: db.unreadNotificationCount(user.id), seenUpTo: db.notificationsSeenId(user.id) };
  },

  /** The player opened the bell. */
  'POST /api/notifications/seen': (req) => {
    const user = requireUser(req);
    db.markNotificationsSeen(user.id);
    return { unread: 0 };
  },

  /** The referral rules in force, for the invitation screens (guests included). */
  'GET /api/referral/rules': (): ReferralRules => referralRules(),

  'GET /api/referrals': (req): ReferralView => {
    const user = requireUser(req);
    const by = db.referrerOf(user.id);
    return {
      invited: db.referralsOf(user.id).map((r) => ({
        username: r.username,
        games: r.games,
        rewarded: r.rewardedAt !== null,
        joinedAt: r.joinedAt,
        depositBonus: r.depositBonus,
      })),
      earned: db.referralEarnings(user.id),
      premiumEarned: db.referralPremiumEarnings(user.id),
      rules: referralRules(),
      invitedBy: by && { username: by.username, games: by.games, rewarded: by.rewardedAt !== null, welcomeBonus: by.welcomeBonus },
    };
  },

  'GET /api/wallet': (req) => {
    const user = requireUser(req);
    const before = Number(new URL(req.url ?? '', 'http://x').searchParams.get('before')) || undefined;
    return { wallet: db.getWallet(user.id), ledger: db.ledgerOf(user.id, 30, before) };
  },

  'GET /api/payments': (req) => paymentsView(requireUser(req).id),

  'POST /api/payments/deposit': (req, body) => {
    const user = requireUser(req);
    limit(paymentLimiter, `${ip(req)}:${user.id}`);
    return startDeposit(user.id, body.amount, body.phone);
  },

  'POST /api/payments/deposit/check': (req, body) => {
    const user = requireUser(req);
    limit(depositCheckLimiter, String(user.id));
    return checkDeposit(user.id, body.reference);
  },

  'POST /api/payments/withdraw': (req, body) => {
    const user = requireUser(req);
    limit(paymentLimiter, `${ip(req)}:${user.id}`);
    return requestWithdrawal(user.id, body.amount, body.phone);
  },

  'GET /api/stakes': () => stakeConfig(),

  'GET /api/link-preview': async (req) => {
    const user = requireUser(req);
    const url = normalizePreviewUrl(new URL(req.url ?? '', 'http://x').searchParams.get('url'));
    if (!url) return { preview: null };
    limit(linkPreviewLimiter, String(user.id));
    return { preview: await linkPreview(url) };
  },

  'POST /api/messages/report': (req, body) => reportMessage(requireUser(req), body.id, body.reason, ip(req)),

  'POST /api/shop/buy': (req, body) => {
    const item = body.item;
    if (!isShopItem(item)) throw new HttpError(400, 'Article inconnu.');
    return mutate(requireUser(req), (p) => ({ profile: buyItem(p, item), result: {} }), 'shop', item);
  },

  'POST /api/appearance': (req, body) => {
    const patch: Record<string, string> = {};
    for (const key of ['board', 'dice', 'pawn']) if (typeof body[key] === 'string') patch[key] = body[key] as string;
    return mutate(requireUser(req), (p) => ({ profile: setAppearance(p, patch), result: {} }));
  },

  'POST /api/daily/login': (req) =>
    mutate(requireUser(req), (p) => {
      const { profile, coins, streak } = claimLoginBonus(p, utcDay());
      return { profile, result: { coins, streak } };
    }, 'daily'),

  'POST /api/tutorial/complete': (req) =>
    mutate(requireUser(req), (p) => {
      const done = completeTutorial(p);
      return { profile: done?.profile ?? p, result: { summary: done?.summary ?? null } };
    }, 'tutorial'),

  /**
   * Result of a game played on the device (against the computer or friends on the same screen).
   * The game is replayed from its actions, so its outcome and statistics follow the rules.
   */
  'POST /api/games/local': (req, body) => {
    const user = requireUser(req);
    const color = body.color;
    const history = body.history;
    if (!isColor(color) || !Array.isArray(history) || history.length > MAX_HISTORY) {
      throw new HttpError(400, 'Résultat de partie invalide.');
    }
    const players = parsePlayers(body.players);
    const rules = sanitizeRules(body.rules);
    let state: GameState;
    try {
      state = replayGame(players, rules, history);
    } catch {
      throw new HttpError(400, 'Résultat de partie invalide.');
    }
    if (state.phase !== 'over') throw new HttpError(400, "La partie n'est pas terminée.");
    state.id = `local-${createHash('sha256').update(JSON.stringify([players, rules, history])).digest('base64url')}`;

    const opponents = parseOpponents(body.opponents);
    const result = gameResult(state, color, (c) => opponents[c] ?? { kind: 'human', online: false }, false);
    if (!result) return { ...publicProfile(user), summary: null };
    if (user.profile.rewarded.includes(result.gameId)) throw new HttpError(409, 'Partie déjà comptée.');
    const refused = claimRewardSlot(user.id, true);
    if (refused) throw new HttpError(429, refused);
    return mutate(user, (p) => {
      const recorded = recordGame(p, result, utcDay());
      return { profile: recorded?.profile ?? p, result: { summary: recorded?.summary ?? null } };
    }, 'game', 'ludo');
  },

  'GET /api/leaderboard': (req) => {
    const id = userIdForToken(bearer(req));
    const user = id ? db.getUser(id) : null;
    return {
      players: db.leaderboard().map((row, i) => ({ rank: i + 1, ...row, level: levelInfo(row.xp).level })),
      you: user ? { username: user.username, rank: db.rankOf(user.id), xp: user.profile.xp, level: levelInfo(user.profile.xp).level } : null,
    };
  },

  /** Public card of a player, opened from a shared profile link or QR code. */
  'GET /api/players/profile': (req) => {
    limit(profileLookupLimiter, ip(req));
    const player = accountByUsername(new URL(req.url ?? '', 'http://x').searchParams.get('username'));
    const viewerId = userIdForToken(bearer(req));
    let relation: 'none' | 'self' | 'friend' | 'outgoing' | 'incoming' | null = null;
    if (viewerId) {
      const same = (r: { username: string }) => r.username === player.username;
      relation =
        viewerId === player.id
          ? 'self'
          : db.areFriends(viewerId, player.id)
            ? 'friend'
            : db.listOutgoingFriendRequests(viewerId).some(same)
              ? 'outgoing'
              : db.listIncomingFriendRequests(viewerId).some(same)
                ? 'incoming'
                : 'none';
    }
    const { stats, xp } = player.profile;
    return {
      username: player.username,
      level: levelInfo(xp).level,
      rank: db.rankOf(player.id),
      games: stats.games,
      wins: stats.wins,
      relation,
    };
  },

  'GET /api/social': (req) => socialState(requireUser(req)),

  'POST /api/friends/request': (req, body) => {
    const user = requireUser(req);
    limit(friendRequestLimiter, `${ip(req)}:${user.id}`);
    const target = accountByUsername(body.username);
    if (target.id === user.id) throw new HttpError(400, 'Tu ne peux pas t’ajouter toi-même.');
    const status = db.createFriendRequest(user.id, target.id);
    if (status === 'requested' || status === 'accepted') push(target.id, 'social:changed', []);
    if (status === 'requested') {
      notify(target.id, { kind: 'friend', title: `${user.username} veut être ton ami`, body: 'Accepte son invitation pour discuter et jouer ensemble.', url: '/?tab=friends' });
    } else if (status === 'accepted') {
      notify(target.id, { kind: 'friend', title: `${user.username} a accepté ton invitation`, body: 'Vous êtes maintenant amis.', url: '/?tab=friends' });
    }
    const labels: Record<typeof status, string> = {
      requested: `Invitation envoyée à ${target.username}.`,
      pending: `Invitation déjà envoyée à ${target.username}.`,
      accepted: `${target.username} est maintenant dans tes amis.`,
      already_friends: `${target.username} est déjà dans tes amis.`,
    };
    return { status, message: labels[status], ...socialState(user) };
  },

  'POST /api/friends/respond': (req, body) => {
    const user = requireUser(req);
    const requester = accountByUsername(body.username);
    const hasRequest = db.listIncomingFriendRequests(user.id).some((request) => request.username.toLowerCase() === requester.username.toLowerCase());
    if (!hasRequest) throw new HttpError(404, 'Invitation introuvable.');
    if (body.action === 'accept') {
      db.createFriendship(user.id, requester.id);
      push(requester.id, 'social:changed', []);
      notify(requester.id, { kind: 'friend', title: `${user.username} a accepté ton invitation`, body: 'Vous êtes maintenant amis.', url: '/?tab=friends' });
      return { message: `${requester.username} est maintenant dans tes amis.`, ...socialState(user) };
    }
    if (body.action === 'decline') {
      db.declineFriendRequest(user.id, requester.id);
      push(requester.id, 'social:changed', []);
      return { message: `Invitation de ${requester.username} refusée.`, ...socialState(user) };
    }
    throw new HttpError(400, 'Action invalide.');
  },

  'POST /api/friends/cancel': (req, body) => {
    const user = requireUser(req);
    const target = accountByUsername(body.username);
    if (!db.cancelFriendRequest(user.id, target.id)) throw new HttpError(404, 'Invitation introuvable.');
    push(target.id, 'social:changed', []);
    return { message: `Invitation à ${target.username} annulée.`, ...socialState(user) };
  },

  'POST /api/friends/remove': (req, body) => {
    const user = requireUser(req);
    const target = accountByUsername(body.username);
    if (!db.removeFriendship(user.id, target.id)) throw new HttpError(404, `${target.username} n’est pas dans tes amis.`);
    push(target.id, 'social:changed', []);
    push(user.id, 'social:changed', []);
    return { message: `${target.username} a été retiré de tes amis.`, ...socialState(user) };
  },

  'POST /api/groups/create': (req, body) => {
    const user = requireUser(req);
    limit(groupLimiter, `${ip(req)}:${user.id}`);
    const name = groupName(body.name);
    const people = newMembers(user, body.members, null);
    if (people.length === 0) throw new HttpError(400, 'Choisis au moins un ami.');
    const id = db.createGroup(name, user.id, people.map((p) => p.id));
    postGroupEvent(user, id, { type: 'created', by: user.username, name });
    tellMembers([user.id, ...people.map((p) => p.id)]);
    return { group: groupView(db.getGroup(id)!), ...socialState(user) };
  },

  'POST /api/groups/add': (req, body) => {
    const user = requireUser(req);
    limit(groupLimiter, `${ip(req)}:${user.id}`);
    const group = requireGroupAdmin(user, body.group);
    const people = newMembers(user, body.members, group);
    if (people.length === 0) throw new HttpError(400, 'Ces amis sont déjà dans le groupe.');
    db.addGroupMembers(group.id, people.map((p) => p.id));
    for (const person of people) postGroupEvent(user, group.id, { type: 'added', by: user.username, target: person.username });
    tellMembers([...group.members.map((m) => m.userId), ...people.map((p) => p.id)]);
    return socialState(user);
  },

  'POST /api/groups/remove': (req, body) => {
    const user = requireUser(req);
    const group = requireGroupAdmin(user, body.group);
    const member = groupMemberOf(group, body.username);
    if (member.userId === user.id) throw new HttpError(400, 'Pour partir, quitte le groupe.');
    if (member.username === group.createdBy) throw new HttpError(403, 'Le créateur du groupe ne peut pas être retiré.');
    db.removeGroupMember(group.id, member.userId);
    postGroupEvent(user, group.id, { type: 'removed', by: user.username, target: member.username });
    tellMembers(group.members.map((m) => m.userId));
    return socialState(user);
  },

  'POST /api/groups/leave': (req, body) => {
    const user = requireUser(req);
    const group = requireGroup(user, parseGroupKey(body.group));
    db.removeGroupMember(group.id, user.id);
    postGroupEvent(user, group.id, { type: 'left', by: user.username });
    tellMembers(group.members.map((m) => m.userId));
    return socialState(user);
  },

  'POST /api/groups/rename': (req, body) => {
    const user = requireUser(req);
    const group = requireGroupAdmin(user, body.group);
    const name = groupName(body.name);
    if (name === group.name) return socialState(user);
    db.renameGroup(group.id, name);
    postGroupEvent(user, group.id, { type: 'renamed', by: user.username, name });
    tellMembers(group.members.map((m) => m.userId));
    return socialState(user);
  },

  'POST /api/groups/admin': (req, body) => {
    const user = requireUser(req);
    const group = requireGroupAdmin(user, body.group);
    const member = groupMemberOf(group, body.username);
    if (member.admin) return socialState(user);
    db.setGroupAdmin(group.id, member.userId);
    postGroupEvent(user, group.id, { type: 'promoted', by: user.username, target: member.username });
    tellMembers(group.members.map((m) => m.userId));
    return socialState(user);
  },

  'POST /api/messages/thread': (req, body) => {
    const user = requireUser(req);
    const groupId = parseGroupKey(body.username);
    if (groupId !== null) {
      const group = requireGroup(user, groupId);
      readConversation(user, groupKey(group.id));
      const floor = db.groupReadFloor(group.id);
      return {
        friend: { username: groupKey(group.id), level: null },
        group: groupView(db.getGroup(group.id)!),
        messages: db.listGroupThread(group.id, user.id).map((m) => messageView(m, user.id, floor)),
      };
    }
    const friend = requireFriend(user, body.username);
    readThread(user, friend);
    return { friend: { username: friend.username, level: levelInfo(friend.profile.xp).level }, messages: db.listThread(user.id, friend.id).map((m) => messageView(m, user.id)) };
  },

  'GET /api/push/key': () => ({ publicKey: VAPID_PUBLIC_KEY }),

  'POST /api/push/subscribe': (req, body) => {
    const user = requireUser(req);
    db.savePushSubscription(user.id, parseSubscription(body.subscription));
    db.trimPushSubscriptions(user.id, MAX_PUSH_DEVICES);
    return { ok: true };
  },

  'POST /api/push/unsubscribe': (req, body) => {
    const user = requireUser(req);
    if (typeof body.endpoint === 'string') db.deletePushSubscription(body.endpoint, user.id);
    return { ok: true };
  },

  'POST /api/messages/send': (req, body) => {
    const user = requireUser(req);
    const message = deliverMessage(user, body.username, body.message, ip(req), undefined, body.replyTo);
    return { message, ...socialState(user) };
  },
};

/** Records a finished online game for a signed-in player; null if already counted. */
export function recordOnlineGame(
  userId: number,
  state: GameState,
  color: Color,
  opponentKind: (c: Color) => OpponentKind,
  staked = false,
) {
  const found = gameResult(state, color, opponentKind, true);
  // At staked tables the pot is the prize: the game still counts for XP, stats and badges.
  const result = found && staked && found.reward ? { ...found, reward: { total: 0, lines: [] } } : found;
  if (!result || claimRewardSlot(userId, false)) return null;
  const summary = db.updateProfile(
    userId,
    (p) => {
      const recorded = recordGame(p, result, utcDay());
      return { profile: recorded?.profile ?? p, result: recorded?.summary ?? null };
    },
    'game',
    'ludo',
  );
  const againstPeople = state.players.some((p) => p.color !== color && opponentKind(p.color).kind === 'human');
  if (summary && againstPeople) advanceReferral(userId);
  return summary;
}

function referralRules(): ReferralRules {
  return { ...db.referralSettings(), minDeposit: paymentSettings('wave').deposit.min };
}

/** An invited player finished an online game against people: maybe time for both welcome bonuses. */
function advanceReferral(userId: number) {
  try {
    const rules = db.referralSettings().free;
    const reward = db.progressReferral(userId, rules);
    if (!reward) return;
    const newcomer = usernameOf(userId) ?? 'Ton filleul';
    if (reward.referrerCoins) {
      notify(reward.referrerId, {
        kind: 'referral',
        title: 'Parrainage réussi',
        body: `${newcomer} a joué ses ${rules.gamesNeeded} premières parties : +${reward.referrerCoins} pièces Free pour toi.`,
        url: '/parrainage',
      });
    }
    if (reward.newcomerCoins) {
      notify(userId, {
        kind: 'referral',
        title: `Bonus de bienvenue : +${reward.newcomerCoins} pièces`,
        body: `Tu as joué tes ${rules.gamesNeeded} premières parties en ligne. Merci d’avoir rejoint LuChat !`,
        url: '/parrainage',
      });
    }
  } catch (err) {
    console.error('Parrainage non crédité', err);
  }
}

/** Records a finished online game of draughts or awalé (XP and weekly quests); null if already counted. */
export function recordDuelOnlineGame(kind: DuelGame, userId: number, gameId: string, won: boolean, captures: number) {
  if (claimRewardSlot(userId, false)) return null;
  const summary = db.updateProfile(
    userId,
    (p) => {
      const recorded = recordDraughtsGame(p, { gameId, won, captures, online: true, kind }, utcDay());
      return { profile: recorded?.profile ?? p, result: recorded?.summary ?? null };
    },
    'game',
    kind,
  );
  if (summary) advanceReferral(userId);
  return summary;
}

export function usernameOf(userId: number): string | null {
  return db.getUser(userId)?.username ?? null;
}

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());

function setCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  const allowed = !ALLOWED_ORIGINS || (origin && ALLOWED_ORIGINS.includes(origin));
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

/** Adds routes defined elsewhere, e.g. the admin panel's. */
export function registerRoutes(extra: Record<string, Handler>) {
  Object.assign(routes, extra);
}

/**
 * A route that reads the raw request body (an uploaded file) or writes its own response (a file):
 * it returns the JSON to send, or nothing once it has answered itself.
 */
export type RawHandler = (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
const rawRoutes: Record<string, RawHandler> = {};

export function registerRawRoutes(extra: Record<string, RawHandler>) {
  Object.assign(rawRoutes, extra);
}

/** Handles /api/* requests; returns false for other paths. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith('/api/')) return false;
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method === 'POST' && (path === '/api/messages/voice' || path === '/api/messages/image')) {
    try {
      send(res, 200, await (path === '/api/messages/voice' ? receiveVoice(req) : receiveImage(req)));
    } catch (err) {
      // The rest of a rejected upload is never read, so the connection can't be reused.
      if (!req.complete) res.setHeader('Connection', 'close');
      if (err instanceof HttpError) send(res, err.status, { error: err.message });
      else {
        console.error(err);
        send(res, 500, { error: 'Erreur du serveur.' });
      }
    }
    return true;
  }
  const raw = rawRoutes[`${req.method} ${path}`];
  if (raw) {
    try {
      const data = await raw(req, res);
      if (!res.headersSent) send(res, 200, data);
    } catch (err) {
      if (!req.complete) res.setHeader('Connection', 'close');
      if (res.headersSent) res.destroy();
      else if (err instanceof HttpError) send(res, err.status, { error: err.message });
      else {
        console.error(err);
        send(res, 500, { error: 'Erreur du serveur.' });
      }
    }
    return true;
  }
  if (req.method === 'POST' && path === '/api/payments/webhook') {
    try {
      send(res, 200, await handlePaymentWebhook(req));
    } catch (err) {
      if (!req.complete) res.setHeader('Connection', 'close');
      if (err instanceof PaymentError) send(res, err.status, { error: err.message });
      else {
        console.error('Webhook de paiement en échec', err);
        send(res, 500, { error: 'Erreur du serveur.' });
      }
    }
    return true;
  }
  if (req.method === 'GET' && (path === '/api/messages/media' || path === '/api/messages/audio')) {
    try {
      await sendMedia(req, res);
    } catch (err) {
      if (err instanceof HttpError) send(res, err.status, { error: err.message });
      else {
        console.error(err);
        send(res, 500, { error: 'Erreur du serveur.' });
      }
    }
    return true;
  }
  const handler = routes[`${req.method} ${path}`];
  if (!handler) {
    send(res, 404, { error: 'Introuvable.' });
    return true;
  }
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    send(res, 200, await handler(req, body));
  } catch (err) {
    if (err instanceof HttpError || err instanceof PaymentError) send(res, err.status, { error: err.message });
    else {
      console.error(err);
      send(res, 500, { error: 'Erreur du serveur.' });
    }
  }
  return true;
}
