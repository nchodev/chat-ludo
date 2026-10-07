import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  BOT_LEVELS,
  GameError,
  isColor,
  isReactionId,
  sanitizeRules,
  type Ack,
  type ClientToServerEvents,
  type ReactionMessage,
  type ServerToClientEvents,
} from '@ludo/engine';
import { handleApi, userIdForToken, usernameOf } from './api';
import { deleteExpiredSessions } from './db';
import { Matchmaker } from './matchmaking';
import { RoomError, RoomManager, type Room } from './rooms';
import { RateLimiter, cleanText, clientIp } from './security';

interface SocketData {
  code?: string;
  token?: string;
}

type LudoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const PORT = Number(process.env.PORT ?? 4000);
const ROOM_TTL_MS = 30 * 60_000;
const MAX_CONNECTIONS_PER_IP = 20;
/** Per connection: a burst of this many events, refilled at EVENTS_PER_SECOND. */
const EVENT_BURST = 30;
const EVENTS_PER_SECOND = 10;
/** Connections that keep flooding after being throttled are closed. */
const MAX_DROPPED_EVENTS = 200;

const roomCreations = new RateLimiter(15, 10 * 60_000);
const failedJoins = new RateLimiter(20, 5 * 60_000);
const connectionsPerIp = new Map<string, number>();

const httpServer = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ludo server OK');
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

const rooms = new RoomManager(broadcast, broadcastReaction);
const matchmaker = new Matchmaker(rooms, {
  status: (socketId, status) => io.sockets.sockets.get(socketId)?.emit('match:status', status),
  found: (socketId, match) => io.sockets.sockets.get(socketId)?.emit('match:found', match),
});

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

function cleanName(name: unknown): string {
  return cleanText(name, 20) || 'Joueur';
}

function errorMessage(err: unknown): string {
  if (err instanceof RoomError || err instanceof GameError) return err.message;
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

function leaveCurrentRoom(socket: LudoSocket) {
  const { code, token } = socket.data;
  const room = code ? rooms.get(code) : undefined;
  if (room && token) rooms.disconnect(room, token);
  socket.data = {};
}

/** Leaves the current room before entering another; a lobby left behind is closed rather than kept around. */
function leaveForNewRoom(socket: LudoSocket) {
  const { code, token } = socket.data;
  const room = code ? rooms.get(code) : undefined;
  if (room && token && !room.game) {
    socket.data = {};
    rooms.leave(room, token);
  } else {
    leaveCurrentRoom(socket);
  }
}

io.on('connection', (socket: LudoSocket) => {
  throttle(socket);

  socket.on('room:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (!roomCreations.hit(socketIp(socket))) {
      ack({ ok: false, error: 'Tu as créé trop de salons. Réessaie dans quelques minutes.' });
      return;
    }
    try {
      const { userId, name } = account(payload?.auth);
      leaveForNewRoom(socket);
      const { room, token } = rooms.create(name ?? cleanName(payload?.name), sanitizeRules(payload?.rules), socket.id, userId);
      socket.data = { code: room.code, token };
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
      socket.data = { code: room.code, token };
      ack({ ok: true, token });
      broadcast(room);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on('room:leave', () => {
    const { code, token } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    socket.data = {};
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

  socket.on('room:start', inRoom(socket, (room, token) => rooms.start(room, token)));
  socket.on('room:backToLobby', inRoom(socket, (room, token) => rooms.backToLobby(room, token)));
  socket.on('room:rematch', inRoom(socket, (room, token) => rooms.rematch(room, token)));
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
      if (!isReactionId(payload?.reaction)) throw new RoomError('Réaction inconnue.');
      rooms.react(room, token, payload.reaction);
    }),
  );

  socket.on('match:join', (payload, ack) => {
    const { userId, name } = account(payload?.auth);
    matchmaker.join({ socketId: socket.id, name: name ?? cleanName(payload?.name), userId });
    ack?.({ ok: true });
  });
  socket.on('match:leave', () => matchmaker.leave(socket.id));

  socket.on('disconnect', () => {
    matchmaker.leave(socket.id);
    leaveCurrentRoom(socket);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.all()) {
    const anyoneConnected = [...room.members.values()].some((m) => m.socketId);
    if (!anyoneConnected && now - room.lastActivity > ROOM_TTL_MS) rooms.delete(room);
  }
}, 60_000);

deleteExpiredSessions();
setInterval(deleteExpiredSessions, 60 * 60_000);

httpServer.listen(PORT, () => {
  console.log(`Serveur Ludo prêt sur http://localhost:${PORT}`);
});
