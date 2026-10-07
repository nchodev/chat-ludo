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
import { RoomError, RoomManager, type Room } from './rooms';

interface SocketData {
  code?: string;
  token?: string;
}

type LudoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const PORT = Number(process.env.PORT ?? 4000);
const ROOM_TTL_MS = 30 * 60_000;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ludo server OK');
});

const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' },
});

const rooms = new RoomManager(broadcast, broadcastReaction);

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
  const value = typeof name === 'string' ? name.trim().slice(0, 20) : '';
  return value || 'Joueur';
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

io.on('connection', (socket: LudoSocket) => {
  socket.on('room:create', (payload, ack) => {
    leaveCurrentRoom(socket);
    const { room, token } = rooms.create(cleanName(payload?.name), sanitizeRules(payload?.rules), socket.id);
    socket.data = { code: room.code, token };
    ack({ ok: true, code: room.code, token });
    broadcast(room);
  });

  socket.on('room:join', (payload, ack) => {
    const room = typeof payload?.code === 'string' ? rooms.get(payload.code.trim()) : undefined;
    if (!room) {
      ack({ ok: false, error: 'Salon introuvable. Vérifie le code.' });
      return;
    }
    if (socket.data.code !== room.code) leaveCurrentRoom(socket);
    const token = rooms.join(
      room,
      cleanName(payload.name),
      socket.id,
      typeof payload.token === 'string' ? payload.token : undefined,
    );
    socket.data = { code: room.code, token };
    ack({ ok: true, token });
    broadcast(room);
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

  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.all()) {
    const anyoneConnected = [...room.members.values()].some((m) => m.socketId);
    if (!anyoneConnected && now - room.lastActivity > ROOM_TTL_MS) rooms.delete(room);
  }
}, 60_000);

httpServer.listen(PORT, () => {
  console.log(`Serveur Ludo prêt sur http://localhost:${PORT}`);
});
