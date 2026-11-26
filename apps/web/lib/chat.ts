'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatInvite, ChatMessageView } from '@ludo/engine';
import { gameRoomPath } from './games';
import { getSessionToken } from './profile';
import { getSocket, storeDraughtsToken, storeRoomToken } from './socket';

/** Conversation on screen, so its messages don't also raise a notification. */
let viewingChat: string | null = null;
const openChatListeners = new Set<(username: string) => void>();

export function setViewingChat(username: string | null) {
  viewingChat = username;
}

export function getViewingChat() {
  return viewingChat;
}

/** Lets the home screen open a conversation asked for elsewhere (notification tap). */
export function onOpenChatRequest(listener: (username: string) => void) {
  openChatListeners.add(listener);
  return () => {
    openChatListeners.delete(listener);
  };
}

/** Returns false when no screen is listening (the home screen isn't mounted). */
export function requestOpenChat(username: string) {
  for (const listener of openChatListeners) listener(username);
  return openChatListeners.size > 0;
}

const TYPING_SEND_EVERY_MS = 2000;
const TYPING_SHOWN_MS = 3500;

export interface ChatHandlers {
  onMessage: (message: ChatMessageView) => void;
  onRead: (receipt: { by: string; upTo: number; at: number }) => void;
  onSocialChanged: () => void;
  onUpdated: (message: ChatMessageView) => void;
  onRemoved: (id: number) => void;
}

function emitWithAck<T>(run: (done: (err: Error | null, res: { ok: true } & T | { ok: false; error: string }) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    run((err, res) => {
      if (err) reject(new Error('Pas de connexion. Réessaie.'));
      else if (!res.ok) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

/**
 * Creates a room of `game` and sends `friend` a card inviting them to it; resolves with the
 * room's page, where the challenger waits in the lobby.
 */
export async function challengeFriend(friend: string, game: ChatInvite['game'], name: string): Promise<string> {
  const socket = getSocket();
  const auth = getSessionToken() ?? undefined;
  const created = await emitWithAck<{ code: string; token: string }>((done) =>
    game === 'ludo'
      ? socket.timeout(10_000).emit('room:create', { name, auth }, done)
      : socket.timeout(10_000).emit('draughts:create', { game, name, auth }, done),
  );
  if (game === 'ludo') storeRoomToken(created.code, created.token);
  else storeDraughtsToken(created.code, created.token);
  await emitWithAck<{ message: ChatMessageView }>((done) => socket.timeout(10_000).emit('chat:invite', { to: friend, game }, done));
  return gameRoomPath(game, created.code);
}

/**
 * Live chat over the game socket: incoming messages, read receipts, who is typing and who is online.
 * Inactive while signed out.
 */
export function useChat(signedIn: boolean, handlers: ChatHandlers) {
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  /** Who is typing, by conversation (friend's username or group key). */
  const [typing, setTyping] = useState<Map<string, string[]>>(() => new Map());
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(new Map<string, number>());

  /** Without `where`, `from` stops typing everywhere (went offline). */
  const stopTyping = useCallback((from: string, where?: string) => {
    for (const [timerKey, timer] of typingTimers.current) {
      if (timerKey === `${where}|${from}` || (!where && timerKey.endsWith(`|${from}`))) {
        clearTimeout(timer);
        typingTimers.current.delete(timerKey);
      }
    }
    setTyping((current) => {
      let next: Map<string, string[]> | null = null;
      for (const [key, people] of current) {
        if ((where && key !== where) || !people.includes(from)) continue;
        next ??= new Map(current);
        const left = people.filter((p) => p !== from);
        if (left.length) next.set(key, left);
        else next.delete(key);
      }
      return next ?? current;
    });
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setConnected(false);
      setOnline(new Set());
      setTyping(new Map());
      return;
    }
    const socket = getSocket();
    const timers = typingTimers.current;

    const auth = () => {
      const token = getSessionToken();
      if (!token) return;
      socket.emit('chat:auth', { auth: token }, (res) => {
        if (!res.ok) return;
        setConnected(true);
        setOnline(new Set(res.online));
      });
    };
    const onDisconnect = () => setConnected(false);
    const onMessage = (message: ChatMessageView) => {
      if (!message.mine) stopTyping(message.from, message.group ? message.to : message.from);
      handlersRef.current.onMessage(message);
    };
    const onRead = (receipt: { by: string; upTo: number; at: number }) => handlersRef.current.onRead(receipt);
    const onSocialChanged = () => handlersRef.current.onSocialChanged();
    const onUpdated = (message: ChatMessageView) => handlersRef.current.onUpdated(message);
    const onRemoved = ({ id }: { id: number }) => handlersRef.current.onRemoved(id);
    const onPresence = ({ username, online: isOnline }: { username: string; online: boolean }) => {
      setOnline((current) => {
        const next = new Set(current);
        if (isOnline) next.add(username);
        else next.delete(username);
        return next;
      });
      if (!isOnline) stopTyping(username);
    };
    const onTyping = ({ from, group }: { from: string; group?: string }) => {
      const where = group ?? from;
      const timerKey = `${where}|${from}`;
      clearTimeout(timers.get(timerKey));
      timers.set(
        timerKey,
        setTimeout(() => stopTyping(from, where), TYPING_SHOWN_MS),
      );
      setTyping((current) => {
        const people = current.get(where) ?? [];
        return people.includes(from) ? current : new Map(current).set(where, [...people, from]);
      });
    };

    socket.on('connect', auth);
    socket.on('disconnect', onDisconnect);
    socket.on('chat:message', onMessage);
    socket.on('chat:read', onRead);
    socket.on('chat:presence', onPresence);
    socket.on('chat:typing', onTyping);
    socket.on('social:changed', onSocialChanged);
    socket.on('chat:updated', onUpdated);
    socket.on('chat:removed', onRemoved);
    if (socket.connected) auth();

    return () => {
      socket.off('connect', auth);
      socket.off('disconnect', onDisconnect);
      socket.off('chat:message', onMessage);
      socket.off('chat:read', onRead);
      socket.off('chat:presence', onPresence);
      socket.off('chat:typing', onTyping);
      socket.off('social:changed', onSocialChanged);
      socket.off('chat:updated', onUpdated);
      socket.off('chat:removed', onRemoved);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      setTyping(new Map());
    };
  }, [signedIn, stopTyping]);

  const send = useCallback(
    (to: string, body: string, replyTo?: number | null) =>
      emitWithAck<{ message: ChatMessageView }>((done) =>
        getSocket()
          .timeout(10_000)
          .emit('chat:send', { to, body, ...(replyTo ? { replyTo } : {}) }, done),
      ).then((res) => res.message),
    [],
  );

  const react = useCallback(
    (id: number, emoji: string | null) =>
      emitWithAck<object>((done) => getSocket().timeout(10_000).emit('chat:react', { id, emoji }, done)),
    [],
  );

  const remove = useCallback(
    (id: number, forAll: boolean) =>
      emitWithAck<object>((done) => getSocket().timeout(10_000).emit('chat:delete', { id, forAll }, done)),
    [],
  );

  const edit = useCallback(
    (id: number, body: string) => emitWithAck<object>((done) => getSocket().timeout(10_000).emit('chat:edit', { id, body }, done)),
    [],
  );

  const forward = useCallback(
    (id: number, to: string[]) =>
      emitWithAck<{ messages: ChatMessageView[] }>((done) => getSocket().timeout(15_000).emit('chat:forward', { id, to }, done)).then(
        (res) => res.messages,
      ),
    [],
  );

  const notifyTyping = useCallback((to: string) => {
    const now = Date.now();
    if (now - (lastTypingSent.current.get(to) ?? 0) < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current.set(to, now);
    getSocket().emit('chat:typing', { to });
  }, []);

  const markRead = useCallback((withUser: string) => {
    getSocket().emit('chat:read', { with: withUser });
  }, []);

  return { connected, online, typing, send, react, remove, edit, forward, notifyTyping, markRead };
}
