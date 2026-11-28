import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  BOT_LEVELS,
  GameError,
  isColor,
  isReactionFor,
  sanitizeRules,
  type Ack,
  type ClientToServerEvents,
  type ReactionMessage,
  type ServerToClientEvents,
  type WalletChange,
  LOCAL_CODE_TTL_MS,
  COLORS,
  ADULT_REQUIRED,
  PREMIUM_CLOSED,
  stakeConfig,
  stakeTable,
  type GameId,
  parseGroupKey,
  DUEL_GAMES,
  isDuelGame,
  type DuelGame,
} from '@ludo/engine';
import {
  HttpError,
  deleteMessage,
  editMessage,
  deliverInvite,
  deliverMessage,
  forwardMessage,
  reactToMessage,
  conversationPeers, handleApi, readConversation, setPush, userIdForToken, usernameOf } from './api';
import { gameClosedReason, loadGameSettings } from './games';
import { loadStakeSettings, registerAdminRoutes, type AdminRoom } from './admin';
import {
  deleteExpiredSessions,
  findUserByUsername,
  getUser,
  getWallet,
  listFriendIds,
  notAdultConfirmed,
  onCoinsMoved,
  openPot,
  refundOpenPots,
} from './db';
import { setNotificationTransport, notify } from './notify';
import { sendPush } from './push';
import { loadPaymentSettings, settleStaleDeposits } from './payments';
import { Matchmaker } from './matchmaking';
import { RoomError, RoomManager, type Room } from './rooms';
import { DuelManager, DuelQueue, DuelRoomError, type DuelRoom } from './duel-rooms';
import { RateLimiter, cleanText, clientIp } from './security';
import { forgetOrigin, rememberOrigin } from './identity';

interface SocketData {
  code?: string;
  token?: string;
  /** Room of a two-player board game (draughts, awalé), independent from the Ludo one. */
  dcode?: string;
  dtoken?: string;
}

type LudoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

function clearLudo(socket: LudoSocket) {
  socket.data.code = undefined;
  socket.data.token = undefined;
}

function clearDraughts(socket: LudoSocket) {
  socket.data.dcode = undefined;
  socket.data.dtoken = undefined;
}

const PORT = Number(process.env.PORT ?? 4000);
const ROOM_TTL_MS = 30 * 60_000;
const MAX_CONNECTIONS_PER_IP = 20;
/** Per connection: a burst of this many events, refilled at EVENTS_PER_SECOND. */
const EVENT_BURST = 30;
const EVENTS_PER_SECOND = 10;
/** Connections that keep flooding after being throttled are closed. */
const MAX_DROPPED_EVENTS = 200;

const roomCreations = new RateLimiter(15, 10 * 60_000);
const localCodeRequests = new RateLimiter(12, 10 * 60_000);
const MAX_CODE_ATTEMPTS = 5;

/** Codes sent to players joining a shared-screen game, keyed by `${hostSocketId}:${userId}`. */
const localCodes = new Map<string, { code: string; expires: number; attempts: number }>();
/** Players each host connection has verified, ready to be seated. */
const localVerified = new Map<string, Set<number>>();
const failedJoins = new RateLimiter(20, 5 * 60_000);
const connectionsPerIp = new Map<string, number>();

const httpServer = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('LuChat server OK');
});

/** The account behind a session token, with the name to display in rooms. */
function account(auth: unknown): { userId?: number; name?: string } {
  const userId = userIdForToken(auth) ?? undefined;
  return userId ? { userId, name: usernameOf(userId) ?? undefined } : {};
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? '*' },
  maxHttpBufferSize: 16 * 1024,
});

const socketIp = (socket: LudoSocket) => clientIp(socket.handshake.headers, socket.handshake.address);

io.use((socket, next) => {
  const ip = socketIp(socket);
  const count = connectionsPerIp.get(ip) ?? 0;
  if (count >= MAX_CONNECTIONS_PER_IP) return next(new Error('Trop de connexions.'));
  connectionsPerIp.set(ip, count + 1);
  socket.on('disconnect', () => {
    const left = (connectionsPerIp.get(ip) ?? 1) - 1;
    if (left <= 0) connectionsPerIp.delete(ip);
    else connectionsPerIp.set(ip, left);
  });
  next();
});

/** Token bucket per connection: excess events are dropped (and answered with an error when they expect a reply). */
function throttle(socket: LudoSocket) {
  let tokens = EVENT_BURST;
  let last = Date.now();
  let dropped = 0;
  socket.use((packet, next) => {
    const now = Date.now();
    tokens = Math.min(EVENT_BURST, tokens + ((now - last) / 1000) * EVENTS_PER_SECOND);
    last = now;
    if (tokens >= 1) {
      tokens -= 1;
      return next();
    }
    const ack = packet[packet.length - 1];
    if (typeof ack === 'function') ack({ ok: false, error: 'Trop de requêtes, ralentis un peu.' });
    if (++dropped > MAX_DROPPED_EVENTS) socket.disconnect(true);
  });
}

loadStakeSettings();
loadGameSettings();
loadPaymentSettings();

/** Refuses to start a new game of a game the admins switched off. */
function assertGameOpen(game: GameId) {
  const reason = gameClosedReason(game);
  if (reason) throw new RoomError(reason);
}

const rooms = new RoomManager(broadcast, broadcastReaction);
const matchmaker = new Matchmaker(rooms, {
  status: (socketId, status) => io.sockets.sockets.get(socketId)?.emit('match:status', status),
  found: (socketId, match) => io.sockets.sockets.get(socketId)?.emit('match:found', match),
  cancelled: (socketId, reason) => io.sockets.sockets.get(socketId)?.emit('match:cancelled', reason),
  openPot: (potId, table, userIds) => openPot(potId, table.id, table.currency, table.stake, userIds),
});

const draughts = new DuelManager(broadcastDraughts, (room, message) => {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.dcode === room.code) socket.emit('draughts:reaction', message);
  }
});
const draughtsQueue = new DuelQueue(draughts, {
  status: (socketId, status) => io.sockets.sockets.get(socketId)?.emit('draughts:queue', status),
  found: (socketId, match) => io.sockets.sockets.get(socketId)?.emit('draughts:found', match),
  cancelled: (socketId, reason) => io.sockets.sockets.get(socketId)?.emit('draughts:cancelled', reason),
});

function broadcastDraughts(room: DuelRoom) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.dcode === room.code) socket.emit('draughts:state', draughts.view(room, socket.data.dtoken));
  }
}

function broadcast(room: Room) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.code === room.code) socket.emit('room:state', rooms.view(room, socket.data.token));
  }
}

function broadcastReaction(room: Room, message: ReactionMessage) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.code === room.code) socket.emit('room:reaction', message);
  }
}

/** Signed-in chat connections: socket id → account, and how many connections each account has open. */
const chatUsers = new Map<string, number>();
const openConnections = new Map<number, number>();
const userRoom = (userId: number) => `user:${userId}`;

setPush((userId, event, args, exceptSocket) => {
  const target = exceptSocket ? io.to(userRoom(userId)).except(exceptSocket) : io.to(userRoom(userId));
  (target.emit as (event: string, ...args: unknown[]) => boolean)(event, ...args);
}, (userId) => openConnections.has(userId));

setNotificationTransport(
  (userId, notification) => {
    if (userId === null) io.emit('notification:new', notification);
    else io.to(userRoom(userId)).emit('notification:new', notification);
  },
  (userId) => openConnections.has(userId),
);

const CURRENCY_LABEL = { free: 'Free', premium: 'Premium' } as const;

/** Why a stake id was refused: Premium switched off, or simply unknown. */
const stakeError = (id: unknown, unknown: string) =>
  typeof id === 'string' && id.startsWith('premium-') && !stakeConfig().premiumEnabled ? PREMIUM_CLOSED : unknown;

/** What the bell says for each kind of coin move; moves not listed here are not kept. */
function walletNotice(reason: string, amount: string): { kind: 'wallet' | 'game' | 'referral'; title: string; body: string; url: string } | null {
  switch (reason) {
    case 'prize':
      return { kind: 'game', title: `Tu as gagné ${amount} !`, body: 'La cagnotte de la partie a été créditée sur ton compte.', url: '/portefeuille' };
    case 'refund':
      return { kind: 'game', title: `${amount} remboursés`, body: 'La partie n’a pas pu se terminer : ta mise t’a été rendue.', url: '/portefeuille' };
    case 'forfeit':
      return { kind: 'game', title: `Mise de ${amount} perdue`, body: 'La partie a été quittée avant la fin sur le téléphone où elle se jouait.', url: '/portefeuille' };
    case 'deposit':
      return { kind: 'wallet', title: `${amount} crédités`, body: 'Ton dépôt Wave est arrivé sur ton compte.', url: '/portefeuille' };
    case 'referral_deposit':
      return {
        kind: 'referral',
        title: `Bonus parrainage : +${amount}`,
        body: 'Un ami que tu as invité a fait son premier dépôt. Mise ce bonus en parties pour pouvoir le retirer.',
        url: '/portefeuille',
      };
    case 'referral_welcome':
      return {
        kind: 'referral',
        title: `Bonus de bienvenue : +${amount}`,
        body: 'Merci pour ton premier dépôt ! Mise ce bonus en parties pour pouvoir le retirer.',
        url: '/portefeuille',
      };
    default:
      return null;
  }
}

// Players staking on someone else's phone see each debit, prize and refund on their own app.
onCoinsMoved(({ userId, currency, delta, reason }) => {
  if (reason !== 'stake' && !walletNotice(reason, '')) return;
  io.to(userRoom(userId)).emit('wallet:changed', { currency, delta, reason: reason as WalletChange['reason'], balance: getWallet(userId) });
  const amount = `${Math.abs(delta)} ${CURRENCY_LABEL[currency]}`;
  const notice = walletNotice(reason, amount);
  if (notice) {
    notify(userId, notice, { tag: 'wallet' });
  } else if (!openConnections.has(userId)) {
    // A stake is the player's own doing: a phone notification only, when the game runs on another device.
    void sendPush(userId, { title: `Mise de ${amount} prélevée`, body: 'Ta mise est dans la cagnotte de la partie qui commence.', url: '/compte', tag: 'wallet' });
  }
});

/** A withdrawal was paid on Wave or refused (and refunded) by an admin. */
function notifyWithdrawal(userId: number, amount: number, paid: boolean, note: string) {
  const reason = paid ? 'withdrawal_paid' : 'withdrawal_refund';
  io.to(userRoom(userId)).emit('wallet:changed', { currency: 'premium', delta: paid ? 0 : amount, reason, balance: getWallet(userId), note, amount });
  notify(
    userId,
    {
      kind: 'wallet',
      title: paid ? `Retrait de ${amount} F envoyé` : `Retrait de ${amount} F refusé`,
      body: paid ? 'L’argent a été envoyé sur ton compte Wave.' : `${note} Tes pièces Premium t’ont été rendues.`,
      url: '/portefeuille',
    },
    { tag: 'wallet' },
  );
}

const BOT_LABEL = { easy: 'Ordi facile', medium: 'Ordi moyen', hard: 'Ordi difficile' } as const;

function adminRoom(room: Room): AdminRoom {
  const seatedTokens = new Set<string>();
  const players = COLORS.flatMap((color) => {
    const seat = room.seats[color];
    if (seat.kind === 'empty') return [];
    const fromGame = room.game?.players.find((p) => p.color === color)?.name;
    if (seat.kind === 'bot') return [{ name: fromGame ?? BOT_LABEL[seat.level], color, bot: true, userId: null, connected: true }];
    seatedTokens.add(seat.token);
    const member = room.members.get(seat.token);
    return [
      {
        name: fromGame ?? member?.name ?? '?',
        color,
        bot: false,
        userId: room.stake?.players[color] ?? member?.userId ?? null,
        connected: !!member?.socketId,
      },
    ];
  });
  const stake = room.stake && !room.stake.payout ? room.stake : null;
  return {
    code: room.code,
    game: 'ludo',
    kind: room.shared ? 'shared' : room.quick ? 'quick' : 'private',
    status: !room.game ? 'lobby' : room.game.phase === 'over' ? 'over' : 'playing',
    players,
    spectators: [...room.members.values()].filter((m) => !seatedTokens.has(m.token)).length,
    stake: stake
      ? {
          potId: stake.potId,
          currency: stake.table.currency,
          stake: stake.table.stake,
          pot: stake.table.stake * Object.keys(stake.players).length,
        }
      : null,
    lastActivity: room.lastActivity,
  };
}

function adminDraughtsRoom(room: DuelRoom): AdminRoom {
  const stake = room.stake && !room.stake.payout ? room.stake : null;
  return {
    code: room.code,
    game: room.kind,
    kind: room.quick ? 'quick' : 'private',
    status: !room.game ? 'lobby' : room.game.status === 'over' ? 'over' : 'playing',
    players: room.players.map((token, i) => {
      const member = room.members.get(token);
      const color = room.colors?.[i] ?? (i === 1 && room.colors?.[0] === 'white' ? 'black' : 'white');
      return {
        name: member?.name ?? '?',
        color,
        bot: false,
        userId: room.stake?.players[color] ?? member?.userId ?? null,
        connected: !!member?.socketId,
      };
    }),
    spectators: room.members.size - room.players.length,
    stake: stake ? { potId: stake.potId, currency: stake.table.currency, stake: stake.table.stake, pot: stake.table.stake * 2 } : null,
    lastActivity: room.lastActivity,
  };
}

registerAdminRoutes({
  online: () => ({
    players: openConnections.size,
    connections: io.sockets.sockets.size,
    searching: matchmaker.waiting() + draughtsQueue.waiting(),
  }),
  rooms: () => [...rooms.all().map(adminRoom), ...draughts.all().map(adminDraughtsRoom)].sort((a, b) => b.lastActivity - a.lastActivity),
  closeRoom: (code, reason) => {
    const droom = draughts.get(code);
    if (droom) {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.dcode !== droom.code) continue;
        socket.emit('draughts:closed', `Salon fermé par l’équipe LuChat : ${reason}`);
        clearDraughts(socket);
      }
      draughts.delete(droom);
      return true;
    }
    const room = rooms.get(code);
    if (!room) return false;
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.code !== room.code) continue;
      socket.emit('room:closed', `Salon fermé par l’équipe LuChat : ${reason}`);
      clearLudo(socket);
    }
    rooms.delete(room);
    return true;
  },
  disconnectPlayer: (userId, reason) => {
    matchmaker.leave('', userId);
    draughtsQueue.leave('', userId);
    for (const socket of io.sockets.sockets.values()) {
      const code = socket.data.code;
      const room = code ? rooms.get(code) : undefined;
      const member = room && socket.data.token ? room.members.get(socket.data.token) : undefined;
      const droom = socket.data.dcode ? draughts.get(socket.data.dcode) : undefined;
      const dmember = droom && socket.data.dtoken ? droom.members.get(socket.data.dtoken) : undefined;
      if (chatUsers.get(socket.id) === userId || member?.userId === userId || dmember?.userId === userId) {
        if (room) socket.emit('room:closed', reason);
        if (droom) socket.emit('draughts:closed', reason);
        socket.disconnect(true);
      }
    }
  },
  isOnline: (userId) => openConnections.has(userId),
  liveByGame: () => ({
    ludo: { playing: rooms.all().filter((r) => r.game && r.game.phase !== 'over').length, searching: matchmaker.waiting() },
    ...(Object.fromEntries(
      DUEL_GAMES.map((kind) => [kind, { playing: draughts.all().filter((r) => r.kind === kind && draughts.playing(r)).length, searching: draughtsQueue.waiting(kind) }]),
    ) as Record<DuelGame, { playing: number; searching: number }>),
  }),
  gameDisabled: (game) => {
    const reason = gameClosedReason(game) ?? 'Ce jeu est momentanément indisponible.';
    if (game === 'ludo') matchmaker.cancelAll(reason);
    else draughtsQueue.cancelAll(game, reason);
  },
  premiumDisabled: () => {
    matchmaker.cancelAll(PREMIUM_CLOSED, 'premium');
    draughtsQueue.cancelCurrency('premium', PREMIUM_CLOSED);
  },
  notifyWithdrawal,
  notifyAdjustment: (userId, currency, delta, note) => {
    io.to(userRoom(userId)).emit('wallet:changed', { currency, delta, reason: 'admin', balance: getWallet(userId), note });
    const amount = `${Math.abs(delta)} ${CURRENCY_LABEL[currency]}`;
    notify(
      userId,
      {
        kind: 'wallet',
        title: delta > 0 ? `${amount} crédités sur ton compte` : `${amount} retirés de ton compte`,
        body: note,
        url: '/portefeuille',
      },
      { tag: 'wallet' },
    );
  },
});

function announcePresence(userId: number, online: boolean) {
  const username = usernameOf(userId);
  if (!username) return;
  for (const friendId of listFriendIds(userId)) io.to(userRoom(friendId)).emit('chat:presence', { username, online });
}

function chatSignIn(socket: LudoSocket, userId: number) {
  if (chatUsers.get(socket.id) === userId) return;
  chatSignOut(socket);
  chatUsers.set(socket.id, userId);
  socket.join(userRoom(userId));
  const count = (openConnections.get(userId) ?? 0) + 1;
  openConnections.set(userId, count);
  if (count === 1) announcePresence(userId, true);
}

function chatSignOut(socket: LudoSocket) {
  const userId = chatUsers.get(socket.id);
  if (!userId) return;
  chatUsers.delete(socket.id);
  socket.leave(userRoom(userId));
  const left = (openConnections.get(userId) ?? 1) - 1;
  if (left > 0) {
    openConnections.set(userId, left);
  } else {
    openConnections.delete(userId);
    announcePresence(userId, false);
  }
}

function chatError(err: unknown): string {
  return err instanceof HttpError ? err.message : errorMessage(err);
}

function cleanName(name: unknown): string {
  return cleanText(name, 20) || 'Joueur';
}

function errorMessage(err: unknown): string {
  if (err instanceof RoomError || err instanceof GameError || err instanceof DuelRoomError) return err.message;
  console.error(err);
  return 'Erreur inattendue.';
}

/** Wraps a handler that needs the socket's room, reporting errors through the ack. */
function inRoom<A extends unknown[]>(
  socket: LudoSocket,
  handler: (room: Room, token: string, ...args: A) => void,
) {
  return (...args: [...A, Ack?]) => {
    const maybeAck = args[args.length - 1];
    const ack = typeof maybeAck === 'function' ? (maybeAck as Ack) : undefined;
    const { code, token } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    if (!room || !token) {
      ack?.({ ok: false, error: "Tu n'es dans aucun salon." });
      return;
    }
    try {
      handler(room, token, ...(args as unknown as A));
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: errorMessage(err) });
    }
  };
}

function inDraughts<A extends unknown[]>(socket: LudoSocket, handler: (room: DuelRoom, token: string, ...args: A) => void) {
  return (...args: [...A, Ack?]) => {
    const maybeAck = args[args.length - 1];
    const ack = typeof maybeAck === 'function' ? (maybeAck as Ack) : undefined;
    const { dcode, dtoken } = socket.data;
    const room = dcode ? draughts.get(dcode) : undefined;
    if (!room || !dtoken) {
      ack?.({ ok: false, error: "Tu n'es dans aucun salon." });
      return;
    }
    try {
      handler(room, dtoken, ...(args as unknown as A));
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: errorMessage(err) });
    }
  };
}

/**
 * Leaves the current draughts room: `leave` gives up a game in progress, `switch` (entering
 * another room) leaves a room with no game running and keeps a running game waiting for the
 * player, and `disconnect` only marks the player offline.
 */
function leaveDraughts(socket: LudoSocket, mode: 'leave' | 'switch' | 'disconnect') {
  const { dcode, dtoken } = socket.data;
  const room = dcode ? draughts.get(dcode) : undefined;
  clearDraughts(socket);
  if (!room || !dtoken) return;
  if (mode === 'leave' || (mode === 'switch' && !draughts.playing(room))) draughts.leave(room, dtoken);
  else if (room.members.get(dtoken)?.socketId === socket.id) draughts.disconnect(room, dtoken);
}

function leaveCurrentRoom(socket: LudoSocket) {
  const { code, token } = socket.data;
  const room = code ? rooms.get(code) : undefined;
  if (room && token) rooms.disconnect(room, token);
  clearLudo(socket);
}

/** Leaves the current room before entering another; a lobby left behind is closed rather than kept around. */
function leaveForNewRoom(socket: LudoSocket) {
  const { code, token } = socket.data;
  const room = code ? rooms.get(code) : undefined;
  if (room && token && !room.game) {
    clearLudo(socket);
    rooms.leave(room, token);
  } else {
    leaveCurrentRoom(socket);
  }
}

io.on('connection', (socket: LudoSocket) => {
  throttle(socket);
  rememberOrigin(socket.id, socketIp(socket), (socket.handshake.auth as { device?: unknown } | undefined)?.device);

  socket.on('room:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (!roomCreations.hit(socketIp(socket))) {
      ack({ ok: false, error: 'Tu as créé trop de salons. Réessaie dans quelques minutes.' });
      return;
    }
    try {
      assertGameOpen('ludo');
      const { userId, name } = account(payload?.auth);
      leaveForNewRoom(socket);
      const wager = payload?.wager ? stakeTable(payload.wager) : null;
      if (wager === undefined) throw new RoomError(stakeError(payload?.wager, 'Mise inconnue.'));
      if (wager && !userId) throw new RoomError('Connecte-toi pour créer un salon avec mise.');
      const { room, token } = rooms.create(name ?? cleanName(payload?.name), sanitizeRules(payload?.rules), socket.id, userId);
      if (wager) rooms.setWager(room, token, wager);
      Object.assign(socket.data, { code: room.code, token });
      ack({ ok: true, code: room.code, token });
      broadcast(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:join', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const ip = socketIp(socket);
    if (failedJoins.blocked(ip)) {
      ack({ ok: false, error: 'Trop de codes incorrects. Réessaie dans quelques minutes.' });
      return;
    }
    const room = typeof payload?.code === 'string' ? rooms.get(payload.code.trim()) : undefined;
    if (!room) {
      failedJoins.hit(ip);
      ack({ ok: false, error: 'Salon introuvable. Vérifie le code.' });
      return;
    }
    try {
      if (socket.data.code !== room.code) leaveForNewRoom(socket);
      const { userId, name } = account(payload.auth);
      const token = rooms.join(
        room,
        name ?? cleanName(payload.name),
        socket.id,
        typeof payload.token === 'string' ? payload.token : undefined,
        userId,
      );
      Object.assign(socket.data, { code: room.code, token });
      ack({ ok: true, token });
      broadcast(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('local:requestCode', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const { userId: hostId, name: hostName } = account(payload?.auth);
    if (!hostId || !hostName) return ack({ ok: false, error: 'Connecte-toi pour créer une partie avec mise.' });
    if (!localCodeRequests.hit(`${hostId}`)) return ack({ ok: false, error: 'Trop de codes demandés. Réessaie dans quelques minutes.' });
    const name = typeof payload?.username === 'string' ? payload.username.normalize('NFKC').trim() : '';
    const target = name ? findUserByUsername(name) : null;
    if (!target) return ack({ ok: false, error: 'Aucun compte LuChat avec ce pseudo.' });
    if (target.id === hostId) return ack({ ok: false, error: 'C’est ton propre compte : choisis « C’est moi ».' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    localCodes.set(`${socket.id}:${target.id}`, { code, expires: Date.now() + LOCAL_CODE_TTL_MS, attempts: 0 });
    io.to(userRoom(target.id)).emit('local:code', { from: hostName, code, expiresIn: LOCAL_CODE_TTL_MS });
    const online = openConnections.has(target.id);
    if (!online) {
      void sendPush(target.id, {
        title: `Code LuChat : ${code}`,
        body: `${hostName} veut t’ajouter à une partie avec mise sur son téléphone. Donne ce code seulement si tu es à côté.`,
        url: '/',
        tag: 'local-code',
      });
    }
    ack({ ok: true, username: target.username, online });
  });

  socket.on('local:verifyCode', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const name = typeof payload?.username === 'string' ? payload.username.normalize('NFKC').trim() : '';
    const target = name ? findUserByUsername(name) : null;
    const key = target ? `${socket.id}:${target.id}` : '';
    const entry = key ? localCodes.get(key) : undefined;
    if (!target || !entry) return ack({ ok: false, error: 'Demande d’abord un code.' });
    if (entry.expires < Date.now()) {
      localCodes.delete(key);
      return ack({ ok: false, error: 'Code expiré : demandes-en un nouveau.' });
    }
    if (typeof payload.code !== 'string' || payload.code.trim() !== entry.code) {
      entry.attempts += 1;
      if (entry.attempts >= MAX_CODE_ATTEMPTS) {
        localCodes.delete(key);
        return ack({ ok: false, error: 'Trop d’essais : demande un nouveau code.' });
      }
      return ack({ ok: false, error: `Code incorrect (${MAX_CODE_ATTEMPTS - entry.attempts} essai(s) restant(s)).` });
    }
    localCodes.delete(key);
    const verified = localVerified.get(socket.id) ?? new Set<number>();
    verified.add(target.id);
    localVerified.set(socket.id, verified);
    ack({ ok: true, username: target.username });
  });

  socket.on('local:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      assertGameOpen('ludo');
      const { userId: hostId } = account(payload?.auth);
      if (!hostId) throw new RoomError('Connecte-toi pour créer une partie avec mise.');
      const table = stakeTable(payload?.wager);
      if (!table) throw new RoomError(stakeError(payload?.wager, 'Mise inconnue.'));
      // One device plays every seat: nothing stops one person playing all of them, so no real money here.
      if (table.currency === 'premium') throw new RoomError('Sur un seul écran, seules les pièces Free peuvent être misées.');
      const seats = Array.isArray(payload?.seats) ? payload.seats : [];
      if (seats.length < 2 || seats.length > 4) throw new RoomError('Il faut de 2 à 4 joueurs.');
      const verified = localVerified.get(socket.id) ?? new Set<number>();
      const usedColors = new Set<string>();
      const usedIds = new Set<number>();
      const players = seats.map((seat) => {
        if (!isColor(seat?.color) || usedColors.has(seat.color)) throw new RoomError('Couleurs invalides.');
        const user = typeof seat.username === 'string' ? findUserByUsername(seat.username.normalize('NFKC').trim()) : null;
        if (!user || usedIds.has(user.id)) throw new RoomError('Joueurs invalides.');
        if (user.id !== hostId && !verified.has(user.id)) throw new RoomError(`${user.username} doit d’abord valider son code.`);
        usedColors.add(seat.color);
        usedIds.add(user.id);
        return { color: seat.color, name: user.username, userId: user.id };
      });
      players.sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
      leaveForNewRoom(socket);
      const { room, token } = rooms.createShared(players, hostId, sanitizeRules(payload.rules), table, socket.id);
      localVerified.delete(socket.id);
      Object.assign(socket.data, { code: room.code, token });
      ack({ ok: true, code: room.code, token });
      broadcast(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:leave', () => {
    const { code, token } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    clearLudo(socket);
    if (room && token) rooms.leave(room, token);
  });

  socket.on(
    'room:takeSeat',
    inRoom(socket, (room, token, payload: { color: unknown }) => {
      if (!isColor(payload?.color)) throw new RoomError('Couleur invalide.');
      rooms.takeSeat(room, token, payload.color);
    }),
  );

  socket.on(
    'room:setSeat',
    inRoom(socket, (room, token, payload: { color: unknown; kind: unknown; botLevel?: unknown }) => {
      if (!isColor(payload?.color)) throw new RoomError('Couleur invalide.');
      if (payload.kind !== 'empty' && payload.kind !== 'bot') throw new RoomError('Type de place invalide.');
      const level = BOT_LEVELS.find((l) => l === payload.botLevel) ?? 'medium';
      rooms.setSeat(room, token, payload.color, payload.kind, level);
    }),
  );

  socket.on(
    'room:setRules',
    inRoom(socket, (room, token, payload: { rules: unknown }) => {
      rooms.setRules(room, token, sanitizeRules(payload?.rules));
    }),
  );

  socket.on(
    'room:start',
    inRoom(socket, (room, token) => {
      assertGameOpen('ludo');
      rooms.start(room, token);
    }),
  );
  socket.on(
    'room:setWager',
    inRoom(socket, (room, token, payload: { table: unknown }) => {
      const table = payload?.table === null ? null : stakeTable(payload?.table);
      if (table === undefined) throw new RoomError(stakeError(payload?.table, 'Mise inconnue.'));
      rooms.setWager(room, token, table);
    }),
  );
  socket.on('room:backToLobby', inRoom(socket, (room, token) => rooms.backToLobby(room, token)));
  socket.on(
    'room:rematch',
    inRoom(socket, (room, token) => {
      assertGameOpen('ludo');
      rooms.rematch(room, token);
    }),
  );
  socket.on('game:roll', inRoom(socket, (room, token) => rooms.roll(room, token)));

  socket.on(
    'game:move',
    inRoom(socket, (room, token, payload: { pawn: unknown }) => {
      if (typeof payload?.pawn !== 'number') throw new RoomError('Pion invalide.');
      rooms.move(room, token, payload.pawn);
    }),
  );

  socket.on(
    'game:react',
    inRoom(socket, (room, token, payload: { reaction: unknown }) => {
      if (!isReactionFor('ludo', payload?.reaction)) throw new RoomError('Réaction inconnue.');
      rooms.react(room, token, payload.reaction);
    }),
  );

  socket.on('match:join', (payload, ack) => {
    const closed = gameClosedReason('ludo');
    if (closed) return ack?.({ ok: false, error: closed });
    const { userId, name } = account(payload?.auth);
    const table = payload?.table ? stakeTable(payload.table) : null;
    if (table === undefined) return ack?.({ ok: false, error: stakeError(payload.table, 'Table inconnue.') });
    if (table && !userId) return ack?.({ ok: false, error: 'Connecte-toi pour jouer avec une mise.' });
    if (table?.currency === 'premium' && notAdultConfirmed([userId!]).length) return ack?.({ ok: false, error: ADULT_REQUIRED });
    if (table && userId && getWallet(userId)[table.currency] < table.stake) {
      return ack?.({ ok: false, error: 'Solde insuffisant pour cette mise.' });
    }
    matchmaker.join({ socketId: socket.id, name: name ?? cleanName(payload?.name), userId }, table);
    ack?.({ ok: true });
  });
  socket.on('match:leave', () => matchmaker.leave(socket.id));

  socket.on('chat:auth', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const userId = userIdForToken(payload?.auth);
    if (!userId) {
      ack({ ok: false, error: 'Connecte-toi pour discuter.' });
      return;
    }
    chatSignIn(socket, userId);
    const online = listFriendIds(userId)
      .filter((id) => openConnections.has(id))
      .map((id) => usernameOf(id))
      .filter((name): name is string => !!name);
    ack({ ok: true, online });
  });

  socket.on('chat:logout', () => chatSignOut(socket));

  socket.on('chat:send', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const userId = chatUsers.get(socket.id);
    const user = userId ? getUser(userId) : null;
    if (!user) {
      ack({ ok: false, error: 'Connecte-toi pour discuter.' });
      return;
    }
    try {
      ack({ ok: true, message: deliverMessage(user, payload?.to, payload?.body, socketIp(socket), socket.id, payload?.replyTo) });
    } catch (err) {
      ack({ ok: false, error: chatError(err) });
    }
  });

  const chatUser = () => {
    const userId = chatUsers.get(socket.id);
    return userId ? getUser(userId) : null;
  };

  socket.on('chat:react', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const user = chatUser();
    if (!user) return reply({ ok: false, error: 'Connecte-toi pour discuter.' });
    try {
      reactToMessage(user, payload?.id, payload?.emoji ?? null);
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: chatError(err) });
    }
  });

  socket.on('chat:delete', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const user = chatUser();
    if (!user) return reply({ ok: false, error: 'Connecte-toi pour discuter.' });
    try {
      deleteMessage(user, payload?.id, payload?.forAll === true);
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: chatError(err) });
    }
  });

  socket.on('chat:edit', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const user = chatUser();
    if (!user) return reply({ ok: false, error: 'Connecte-toi pour discuter.' });
    try {
      editMessage(user, payload?.id, payload?.body, socketIp(socket));
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: chatError(err) });
    }
  });

  socket.on('chat:forward', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const user = chatUser();
    if (!user) return ack({ ok: false, error: 'Connecte-toi pour discuter.' });
    try {
      ack({ ok: true, messages: forwardMessage(user, payload?.id, payload?.to, socketIp(socket)) });
    } catch (err) {
      ack({ ok: false, error: chatError(err) });
    }
  });

  socket.on('chat:invite', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const user = chatUser();
    if (!user) return ack({ ok: false, error: 'Connecte-toi pour défier un ami.' });
    try {
      const game = payload?.game;
      // Only the room this connection is in, and only as its host: nobody can invite to someone else's room.
      const code = game === 'ludo' ? socket.data.code : isDuelGame(game) ? socket.data.dcode : undefined;
      const duel = isDuelGame(game) && code ? draughts.get(code) : undefined;
      const room = game === 'ludo' ? (code ? rooms.get(code) : undefined) : duel?.kind === game ? duel : undefined;
      const token = game === 'ludo' ? socket.data.token : socket.data.dtoken;
      if (!code || !room || room.hostToken !== token) throw new RoomError('Crée d’abord le salon à partager.');
      // Every connection of the sender gets the card too, this one included: its thread shows it like a received message.
      ack({ ok: true, message: deliverInvite(user, payload?.to, { game, code: room.code }, socketIp(socket)) });
    } catch (err) {
      ack({ ok: false, error: err instanceof RoomError ? err.message : chatError(err) });
    }
  });

  socket.on('chat:typing', (payload) => {
    const userId = chatUsers.get(socket.id);
    const from = userId ? usernameOf(userId) : null;
    if (!userId || !from) return;
    try {
      const group = parseGroupKey(payload?.to) !== null ? (payload.to as string) : undefined;
      for (const peer of conversationPeers(userId, payload?.to)) io.to(userRoom(peer)).emit('chat:typing', group ? { from, group } : { from });
    } catch {
      /* not a friend or not in the group: nothing to tell */
    }
  });

  socket.on('chat:read', (payload) => {
    const userId = chatUsers.get(socket.id);
    const user = userId ? getUser(userId) : null;
    if (!user) return;
    try {
      readConversation(user, payload?.with);
    } catch {
      /* not a friend or not in the group: nothing to mark */
    }
  });

  socket.on('draughts:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (!roomCreations.hit(socketIp(socket))) {
      ack({ ok: false, error: 'Tu as créé trop de salons. Réessaie dans quelques minutes.' });
      return;
    }
    try {
      const kind = payload?.game ?? 'dames';
      if (!isDuelGame(kind)) throw new DuelRoomError('Jeu inconnu.');
      assertGameOpen(kind);
      const { userId, name } = account(payload?.auth);
      const wager = payload?.wager ? stakeTable(payload.wager) : null;
      if (wager === undefined) throw new DuelRoomError(stakeError(payload?.wager, 'Mise inconnue.'));
      if (wager && !userId) throw new DuelRoomError('Connecte-toi pour créer un salon avec mise.');
      leaveDraughts(socket, 'switch');
      const { room, token } = draughts.create(kind, name ?? cleanName(payload?.name), socket.id, userId);
      if (wager) draughts.setWager(room, token, wager);
      Object.assign(socket.data, { dcode: room.code, dtoken: token });
      ack({ ok: true, code: room.code, token });
      broadcastDraughts(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('draughts:join', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const ip = socketIp(socket);
    if (failedJoins.blocked(ip)) {
      ack({ ok: false, error: 'Trop de codes incorrects. Réessaie dans quelques minutes.' });
      return;
    }
    const room = typeof payload?.code === 'string' ? draughts.get(payload.code.trim()) : undefined;
    if (!room) {
      failedJoins.hit(ip);
      ack({ ok: false, error: 'Salon introuvable. Vérifie le code.' });
      return;
    }
    try {
      if (socket.data.dcode !== room.code) leaveDraughts(socket, 'switch');
      const { userId, name } = account(payload.auth);
      const token = draughts.join(room, name ?? cleanName(payload.name), socket.id, typeof payload.token === 'string' ? payload.token : undefined, userId);
      Object.assign(socket.data, { dcode: room.code, dtoken: token });
      ack({ ok: true, token });
      broadcastDraughts(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('draughts:leave', () => leaveDraughts(socket, 'leave'));
  socket.on(
    'draughts:start',
    inDraughts(socket, (room, token) => {
      assertGameOpen(room.kind);
      draughts.start(room, token);
    }),
  );
  socket.on(
    'draughts:setWager',
    inDraughts(socket, (room, token, payload: { table: unknown }) => {
      const table = payload?.table === null ? null : stakeTable(payload?.table);
      if (table === undefined) throw new DuelRoomError(stakeError(payload?.table, 'Mise inconnue.'));
      draughts.setWager(room, token, table);
    }),
  );
  socket.on(
    'draughts:setMinutes',
    inDraughts(socket, (room, token, payload: { minutes: unknown }) => draughts.setMinutes(room, token, payload?.minutes as number)),
  );
  socket.on(
    'draughts:move',
    inDraughts(socket, (room, token, payload: unknown) => draughts.move(room, token, payload)),
  );
  socket.on(
    'draughts:react',
    inDraughts(socket, (room, token, payload: { reaction: unknown }) => {
      if (!isReactionFor(room.kind, payload?.reaction)) throw new DuelRoomError('Réaction inconnue.');
      draughts.react(room, token, payload.reaction);
    }),
  );
  socket.on('draughts:resign', inDraughts(socket, (room, token) => draughts.resign(room, token)));
  socket.on('draughts:draw', inDraughts(socket, (room, token) => draughts.draw(room, token)));
  socket.on('draughts:declineDraw', inDraughts(socket, (room, token) => draughts.declineDraw(room, token)));
  socket.on(
    'draughts:rematch',
    inDraughts(socket, (room, token) => {
      assertGameOpen(room.kind);
      draughts.rematch(room, token);
    }),
  );

  socket.on('draughts:queue', (payload, ack) => {
    const kind = payload?.game ?? 'dames';
    if (!isDuelGame(kind)) return ack?.({ ok: false, error: 'Jeu inconnu.' });
    const closed = gameClosedReason(kind);
    if (closed) return ack?.({ ok: false, error: closed });
    const { userId, name } = account(payload?.auth);
    const table = payload?.table ? stakeTable(payload.table) : null;
    if (table === undefined) return ack?.({ ok: false, error: stakeError(payload.table, 'Table inconnue.') });
    if (table && !userId) return ack?.({ ok: false, error: 'Connecte-toi pour jouer avec une mise.' });
    if (table?.currency === 'premium' && notAdultConfirmed([userId!]).length) return ack?.({ ok: false, error: ADULT_REQUIRED });
    if (table && userId && getWallet(userId)[table.currency] < table.stake) {
      return ack?.({ ok: false, error: 'Solde insuffisant pour cette mise.' });
    }
    draughtsQueue.join(kind, { socketId: socket.id, name: name ?? cleanName(payload?.name), userId }, table);
    ack?.({ ok: true });
  });
  socket.on('draughts:unqueue', () => draughtsQueue.leave(socket.id));

  socket.on('disconnect', () => {
    forgetOrigin(socket.id);
    localVerified.delete(socket.id);
    for (const key of localCodes.keys()) if (key.startsWith(`${socket.id}:`)) localCodes.delete(key);
    matchmaker.leave(socket.id);
    draughtsQueue.leave(socket.id);
    leaveDraughts(socket, 'disconnect');
    leaveCurrentRoom(socket);
    chatSignOut(socket);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.all()) {
    const anyoneConnected = [...room.members.values()].some((m) => m.socketId);
    if (!anyoneConnected && now - room.lastActivity > ROOM_TTL_MS) rooms.delete(room);
  }
  for (const room of draughts.all()) {
    const anyoneConnected = [...room.members.values()].some((m) => m.socketId);
    if (!anyoneConnected && now - room.lastActivity > ROOM_TTL_MS) draughts.delete(room);
  }
}, 60_000);

deleteExpiredSessions();
// Games saved before the restart go on; only the stakes of games that can't be resumed are given back.
const resumedPots = new Set([...rooms.restore(), ...draughts.restore()]);
const resumed = rooms.all().length + draughts.all().length;
if (resumed) console.log(`${resumed} salon(s) repris après le redémarrage`);
const refunded = refundOpenPots(resumedPots);
if (refunded) console.log(`${refunded} cagnotte(s) de parties interrompues remboursée(s)`);
setInterval(deleteExpiredSessions, 60 * 60_000);
void settleStaleDeposits();
setInterval(() => void settleStaleDeposits(), 5 * 60_000);

httpServer.listen(PORT, () => {
  console.log(`Serveur LuChat prêt sur http://localhost:${PORT}`);
});

/**
 * On a deploy or restart: saves every room one last time (clocks charged to the second) and stops.
 * Players' apps reconnect on their own to the new server, which resumes the games.
 */
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} reçu : sauvegarde des salons avant l’arrêt`);
  try {
    rooms.persistAll();
    draughts.persistAll();
  } catch (err) {
    console.error('Sauvegarde finale impossible', err);
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
