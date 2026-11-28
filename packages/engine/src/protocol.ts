import type { BotLevel } from './ai';
import { COLORS, type Color } from './constants';
import type { DuelGame, DuelMovePayload, DuelQueueStatus, DuelRoomView } from './duel';
import { GAME_IDS, type GameId } from './games';
import type { FairDice } from './fair';
import { DEFAULT_RULES, type GameState, type Rules } from './game';
import type { ProgressSummary } from './progress';
import type { DuelReactionMessage, ReactionMessage } from './reactions';
import type { RoomStake } from './stakes';

export type SeatKind = 'empty' | 'human' | 'bot';

export interface PublicSeat {
  color: Color;
  kind: SeatKind;
  name: string;
  botLevel?: BotLevel;
  connected: boolean;
  isHost: boolean;
  /** Account of a signed-in player, so others can add them as a friend. */
  username: string | null;
  /** With a stake set, why this player couldn't put it in: no account or not enough coins. */
  stakeIssue?: 'guest' | 'funds' | null;
}

export interface RoomView {
  code: string;
  seats: PublicSeat[];
  spectators: string[];
  rules: Rules;
  game: GameState | null;
  you: Color | null;
  isHost: boolean;
  /** What you earned in the game that just ended, if you are signed in. */
  result: ProgressSummary | null;
  /** Players who asked for a rematch after the game ended. */
  rematch: Color[];
  /** Time left for the player to act, while a human has to play. */
  turnTimer: { endsIn: number; duration: number } | null;
  /** How many times each player ran out of time; at MAX_TIMEOUTS they lose. */
  timeouts: Partial<Record<Color, number>>;
  /** Player the computer is finishing the turn for, after they ran out of time. */
  autoplay: Color | null;
  /** Coins at stake in the current or last game. */
  stake: RoomStake | null;
  /** Stake table the host picked for this private room's games. */
  wager: string | null;
  /** Room made by quick match: its seats and stake are fixed. */
  matched: boolean;
  /** Every seat is played from the host's device (a staked game on one screen). */
  shared: boolean;
  /** Proof that the current or last game's dice weren't rigged. */
  fair: FairDice | null;
}

/** Time a player has for each action (rolling, then moving) in online games. */
export const TURN_TIME_MS = 15_000;
/** Missing this many turns in a row (the computer played them) loses the game. */
export const MAX_TIMEOUTS = 5;
/** Lifetime of a code proving a player is next to the shared device. */
export interface WalletChange {
  currency: 'free' | 'premium';
  delta: number;
  /** `withdrawal_paid` moves no coins (they left at the request): the money was sent on Wave. */
  reason: 'stake' | 'prize' | 'refund' | 'forfeit' | 'admin' | 'deposit' | 'referral_deposit' | 'referral_welcome' | 'withdrawal_refund' | 'withdrawal_paid';
  balance: { free: number; premium: number };
  /** Why the platform team changed the balance (`admin`) or refused a withdrawal (`withdrawal_refund`). */
  note?: string;
  /** Amount sent on Wave (`withdrawal_paid`). */
  amount?: number;
}

export const LOCAL_CODE_TTL_MS = 5 * 60_000;

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  /** `auth` is the account session token of a signed-in player. */
  'room:create': (
    payload: { name: string; rules?: Partial<Rules>; auth?: string; wager?: string | null },
    ack: Ack<{ code: string; token: string }>,
  ) => void;
  /**
   * Shared-screen staked games: sends a one-time code to another player's own app, to prove
   * they are next to the device and agree to stake.
   */
  'local:requestCode': (payload: { username: string; auth?: string }, ack: Ack<{ username: string; online: boolean }>) => void;
  'local:verifyCode': (payload: { username: string; code: string }, ack: Ack<{ username: string }>) => void;
  /** Starts a staked game played on this device by the host and verified players, run by the server. */
  'local:create': (
    payload: { auth?: string; wager: string; rules?: Partial<Rules>; seats: { color: Color; username: string }[] },
    ack: Ack<{ code: string; token: string }>,
  ) => void;
  'room:join': (payload: { code: string; name: string; token?: string; auth?: string }, ack: Ack<{ token: string }>) => void;
  'room:leave': () => void;
  'room:takeSeat': (payload: { color: Color }, ack?: Ack) => void;
  'room:setSeat': (payload: { color: Color; kind: 'empty' | 'bot'; botLevel?: BotLevel }, ack?: Ack) => void;
  'room:setRules': (payload: { rules: Partial<Rules> }, ack?: Ack) => void;
  'room:start': (ack?: Ack) => void;
  /** Host only, in the lobby: every seated player stakes this table's coins at each game start. */
  'room:setWager': (payload: { table: string | null }, ack?: Ack) => void;
  'room:backToLobby': (ack?: Ack) => void;
  'room:rematch': (ack?: Ack) => void;
  'game:roll': (ack?: Ack) => void;
  'game:move': (payload: { pawn: number }, ack?: Ack) => void;
  'game:react': (payload: { reaction: string }) => void;
  /** `table` is a STAKE_TABLES id; without it the match is a practice game with no stake. */
  'match:join': (payload: { name: string; auth?: string; table?: string }, ack?: Ack) => void;
  'match:leave': () => void;
  /** Subscribes this connection to the signed-in player's chats; answers with the friends currently online. */
  'chat:auth': (payload: { auth: string }, ack: Ack<{ online: string[] }>) => void;
  'chat:logout': () => void;
  'chat:send': (payload: { to: string; body: string; replyTo?: number }, ack: Ack<{ message: ChatMessageView }>) => void;
  /** Sets your reaction to a message, or removes it with a null emoji. */
  'chat:react': (payload: { id: number; emoji: string | null }, ack: Ack) => void;
  /** Deletes a message for everyone (only its sender) or just hides it for you. */
  'chat:delete': (payload: { id: number; forAll: boolean }, ack: Ack) => void;
  /** Replaces the text of one of your messages, within MESSAGE_EDIT_WINDOW_MS of sending it. */
  'chat:edit': (payload: { id: number; body: string }, ack: Ack) => void;
  'chat:forward': (payload: { id: number; to: string[] }, ack: Ack<{ messages: ChatMessageView[] }>) => void;
  /** Invites a friend to the room this connection just created (its current Ludo or draughts room). */
  'chat:invite': (payload: { to: string; game: ChatInvite['game'] }, ack: Ack<{ message: ChatMessageView }>) => void;
  /** `to` and `with` take a friend's username or a group's `g:<id>`. */
  'chat:typing': (payload: { to: string }) => void;
  'chat:read': (payload: { with: string }) => void;

  /*
   * Rooms of the two-player board games (draughts, awalé), separate from Ludo rooms: a connection
   * can be in one of each. `game` defaults to draughts.
   */
  'draughts:create': (payload: { name: string; auth?: string; wager?: string | null; game?: DuelGame }, ack: Ack<{ code: string; token: string }>) => void;
  'draughts:join': (payload: { code: string; name: string; token?: string; auth?: string }, ack: Ack<{ token: string }>) => void;
  'draughts:leave': () => void;
  'draughts:start': (ack?: Ack) => void;
  'draughts:setWager': (payload: { table: string | null }, ack?: Ack) => void;
  /** Host's choice of thinking time per player, in minutes (DUEL_MINUTES). */
  'draughts:setMinutes': (payload: { minutes: number }, ack?: Ack) => void;
  'draughts:move': (payload: DuelMovePayload, ack?: Ack) => void;
  'draughts:resign': (ack?: Ack) => void;
  /** Offers a draw, or accepts the one the opponent offered. */
  'draughts:draw': (ack?: Ack) => void;
  'draughts:declineDraw': (ack?: Ack) => void;
  'draughts:rematch': (ack?: Ack) => void;
  /** Quick emoji or phrase sent to the other player. */
  'draughts:react': (payload: { reaction: string }) => void;
  /** `table` is a stake table id; without it the game has no stake. */
  'draughts:queue': (payload: { name: string; auth?: string; table?: string; game?: DuelGame }, ack?: Ack) => void;
  'draughts:unqueue': () => void;
}

export type ChatMessageKind = 'text' | 'voice' | 'invite' | 'image' | 'system';

export const MAX_GROUP_MEMBERS = 32;
export const MAX_GROUP_NAME = 40;

/** A group conversation is addressed as `g:<id>` wherever a friend's username would go (usernames have no colon). */
export function groupKey(id: number) {
  return `g:${id}`;
}

export function parseGroupKey(value: unknown): number | null {
  const match = typeof value === 'string' ? /^g:(\d{1,10})$/.exec(value) : null;
  return match ? Number(match[1]) : null;
}

export interface GroupMember {
  username: string;
  admin: boolean;
}

export interface GroupView {
  id: number;
  /** `g:<id>`, the conversation's address. */
  key: string;
  name: string;
  createdBy: string;
  members: GroupMember[];
}

/** Body of a `system` message: something that happened to the group. */
export type GroupEvent =
  | { type: 'created'; by: string; name: string }
  | { type: 'added'; by: string; target: string }
  | { type: 'removed'; by: string; target: string }
  | { type: 'left'; by: string }
  | { type: 'renamed'; by: string; name: string }
  | { type: 'promoted'; by: string; target: string };

export function parseGroupEvent(body: string): GroupEvent | null {
  try {
    const e = JSON.parse(body) as GroupEvent;
    const str = (v: unknown) => typeof v === 'string' && v.length > 0;
    if (!str(e?.by)) return null;
    if ((e.type === 'created' || e.type === 'renamed') && str(e.name)) return e;
    if ((e.type === 'added' || e.type === 'removed' || e.type === 'promoted') && str(e.target)) return e;
    if (e.type === 'left') return e;
  } catch {
    /* not an event */
  }
  return null;
}

/** "awa a ajouté moussa"; with `me`, the viewer's own actions read "Tu as ajouté…" / "…t’a ajouté". */
export function describeGroupEvent(e: GroupEvent, me?: string): string {
  const who = e.by === me ? 'Tu' : e.by;
  const has = e.by === me ? 'as' : 'a';
  const target = 'target' in e ? (e.target === me ? 'toi' : e.target) : '';
  switch (e.type) {
    case 'created':
      return `${who} ${has} créé le groupe « ${e.name} »`;
    case 'added':
      return e.target === me ? `${e.by} t’a ajouté` : `${who} ${has} ajouté ${target}`;
    case 'removed':
      return e.target === me ? `${e.by} t’a retiré` : `${who} ${has} retiré ${target}`;
    case 'left':
      return e.by === me ? 'Tu as quitté le groupe' : `${e.by} a quitté le groupe`;
    case 'renamed':
      return `${who} ${has} renommé le groupe en « ${e.name} »`;
    case 'promoted':
      return e.target === me ? `${e.by} t’a nommé administrateur` : `${who} ${has} nommé ${target} administrateur`;
  }
}

/** Body of an `image` message: its size, for laying the bubble out before it loads, and a caption. */
export interface ChatImage {
  width: number;
  height: number;
  caption: string;
}

export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_IMAGE_SIDE = 1600;
export const MAX_CAPTION_LENGTH = 500;

export function parseChatImage(body: string): ChatImage | null {
  try {
    const value = JSON.parse(body) as Partial<ChatImage>;
    const side = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 10_000;
    if (side(value.width) && side(value.height)) {
      return { width: value.width!, height: value.height!, caption: typeof value.caption === 'string' ? value.caption : '' };
    }
  } catch {
    /* not an image */
  }
  return null;
}

/** Body of an `invite` message: a room the sender created for this friend. */
export interface ChatInvite {
  game: GameId;
  code: string;
}

const INVITE_CODE = /^[A-Z0-9]{4,8}$/;

export function parseChatInvite(body: string): ChatInvite | null {
  try {
    const value = JSON.parse(body) as Partial<ChatInvite>;
    if (GAME_IDS.includes(value.game as GameId) && typeof value.code === 'string' && INVITE_CODE.test(value.code)) {
      return { game: value.game as GameId, code: value.code };
    }
  } catch {
    /* not an invite */
  }
  return null;
}

export const INVITE_GAME_NAME: Record<ChatInvite['game'], string> = { ludo: 'Ludo', dames: 'Dames', awale: 'Awalé' };
const PARTY_OF: Record<ChatInvite['game'], string> = { ludo: 'de Ludo', dames: 'de Dames', awale: 'd’Awalé' };

/** One line describing a message, for conversation lists and notifications. */
export function chatPreviewText(message: { kind: ChatMessageKind; body: string; durationMs: number | null }): string {
  if (message.kind === 'voice') {
    const s = Math.round((message.durationMs ?? 0) / 1000);
    return `Message vocal (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
  }
  if (message.kind === 'invite') {
    const invite = parseChatInvite(message.body);
    return `Défi : une partie ${invite ? PARTY_OF[invite.game] : 'de jeu'}`;
  }
  if (message.kind === 'image') {
    const caption = parseChatImage(message.body)?.caption;
    return caption ? `Photo : ${caption}` : 'Photo';
  }
  if (message.kind === 'system') {
    const event = parseGroupEvent(message.body);
    return event ? describeGroupEvent(event) : '';
  }
  return message.body;
}

/** The message a reply quotes, shown above the reply. */
export interface ChatReplyPreview {
  id: number;
  from: string;
  kind: ChatMessageKind;
  body: string;
  durationMs: number | null;
  deleted: boolean;
}

export interface ChatReaction {
  from: string;
  emoji: string;
}

export interface ChatMessageView {
  id: number;
  from: string;
  /** The friend's username, or `g:<id>` for a group message. */
  to: string;
  /** Group the message was posted in, null in a private conversation. */
  group: number | null;
  /** Name of that group, for notifications. */
  groupName?: string;
  mine: boolean;
  /** Text of a text message, JSON for invites and images; empty for voice notes and deleted messages. */
  body: string;
  createdAt: number;
  readAt: number | null;
  kind: ChatMessageKind;
  /** Length of a voice note. */
  durationMs: number | null;
  replyTo: ChatReplyPreview | null;
  forwarded: boolean;
  /** Deleted for everyone by its sender: only a placeholder remains. */
  deleted: boolean;
  /** Its sender changed the text after sending it. */
  edited?: boolean;
  /** At most one reaction per person. */
  reactions: ChatReaction[];
}

/** A text message can be corrected by its sender for this long after sending it. */
export const MESSAGE_EDIT_WINDOW_MS = 5 * 60_000;

/** Whether `message` can still be corrected by the viewer at time `now`. */
export function canEditMessage(message: Pick<ChatMessageView, 'mine' | 'kind' | 'deleted' | 'forwarded' | 'createdAt' | 'id'>, now: number) {
  return message.mine && message.id > 0 && message.kind === 'text' && !message.deleted && !message.forwarded && now - message.createdAt < MESSAGE_EDIT_WINDOW_MS;
}

/** Reactions offered first; any single emoji is accepted. */
export const CHAT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const MAX_VOICE_MS = 120_000;
export const MAX_VOICE_BYTES = 1_200_000;
/** A message can be forwarded to this many friends at once. */
export const MAX_FORWARD_TARGETS = 5;

export function isReactionEmoji(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 16 &&
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\uFE0F|\u200D|\u20E3)+$/u.test(value) &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
  );
}

export interface MatchStatus {
  waiting: number;
  /** When the game will start (ms timestamp), or null while waiting for opponents. */
  startsAt: number | null;
  /** When a computer will join a lone player (ms timestamp); never at staked tables. */
  botAt: number | null;
  /** Staked table being searched, or null for a practice game. */
  table: string | null;
}

/** What a notification is about: sets its icon in the notification centre. */
export type NotificationKind = 'wallet' | 'game' | 'referral' | 'friend' | 'announcement' | 'support';

/** A message of a player's conversation with customer support. */
export interface SupportMessageView {
  id: number;
  kind: 'text' | 'image' | 'voice';
  /** The text, or a photo's caption. */
  body: string;
  /** Sent by the support team (false: by the player). */
  fromStaff: boolean;
  /** Photo size, to reserve its space before it loads. */
  width?: number;
  height?: number;
  /** Length of a voice note. */
  durationMs?: number;
  createdAt: number;
}

/** The player's support conversation. */
export interface SupportThreadView {
  messages: SupportMessageView[];
  /** Replies from support not read yet. */
  unread: number;
  /** Older messages exist before the first one returned. */
  more: boolean;
}

export const MAX_SUPPORT_TEXT = 2000;

/** An entry of the notification centre (the bell). Announcements are sent by the admins to everyone. */
export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Opened when the notification is tapped; null when it only informs. */
  url: string | null;
  createdAt: number;
}

export interface NotificationsView {
  items: AppNotification[];
  /** Notifications newer than the last time the player opened the bell. */
  unread: number;
  /** Ids up to this one were already seen when the list was loaded. */
  seenUpTo: number;
}

export interface ServerToClientEvents {
  /** A new entry in the notification centre. */
  'notification:new': (notification: AppNotification) => void;
  'room:state': (room: RoomView) => void;
  'room:closed': (reason: string) => void;
  'room:reaction': (message: ReactionMessage) => void;
  'match:status': (status: MatchStatus) => void;
  'match:found': (match: { code: string; token: string }) => void;
  /** The search stopped without a game, e.g. the stake could no longer be paid. */
  'match:cancelled': (reason: string) => void;
  'chat:message': (message: ChatMessageView) => void;
  /** Someone wants to add you to a staked game on their device: give them this code if you are with them. */
  'local:code': (payload: { from: string; code: string; expiresIn: number }) => void;
  /** A stake was taken, won or given back on this account (wherever the game was played). */
  'wallet:changed': (payload: WalletChange) => void;
  /** A message changed: new reactions, or deleted for everyone. */
  'chat:updated': (message: ChatMessageView) => void;
  /** You hid a message from another of your devices. */
  'chat:removed': (removed: { id: number }) => void;
  /** `by` has read your messages up to `upTo`; for a group (`by` = `g:<id>`), every member has. */
  'chat:read': (receipt: { by: string; upTo: number; at: number }) => void;
  /** `group` is set (`g:<id>`) when the typing happens in a group. */
  'chat:typing': (typing: { from: string; group?: string }) => void;
  'chat:presence': (presence: { username: string; online: boolean }) => void;
  /** Friends or friend requests changed; the social state should be reloaded. */
  'social:changed': () => void;
  /** A new message in the player's support conversation (from support, or sent from another device). */
  'support:message': (message: SupportMessageView) => void;
  'draughts:state': (room: DuelRoomView) => void;
  'draughts:closed': (reason: string) => void;
  'draughts:reaction': (message: DuelReactionMessage) => void;
  'draughts:found': (match: { code: string; token: string }) => void;
  'draughts:queue': (status: DuelQueueStatus) => void;
  'draughts:cancelled': (reason: string) => void;
}

export const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

/** Keeps only valid rule fields from untrusted input. */
export function sanitizeRules(input: unknown): Rules {
  const rules: Rules = { ...DEFAULT_RULES };
  if (!input || typeof input !== 'object') return rules;
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_RULES) as (keyof Rules)[]) {
    const value = raw[key];
    if (key === 'exitOn') {
      if (value === 'six' || value === 'oneOrSix') rules.exitOn = value;
    } else if (key === 'pawnsPerPlayer') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        rules.pawnsPerPlayer = Math.min(4, Math.max(1, Math.round(value)));
      }
    } else if (typeof value === 'boolean') {
      rules[key] = value;
    }
  }
  return rules;
}
