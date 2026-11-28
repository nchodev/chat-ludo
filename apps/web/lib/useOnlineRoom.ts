'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BotLevel, Color, ReactionMessage, RoomView, Rules } from '@ludo/engine';
import { enterRoom, forgetRoom } from './activeRoom';
import { getSessionToken } from './profile';
import { NOT_CONNECTED } from './connectivity';
import { getRoomToken, getSocket, storeRoomToken, type LudoClientSocket } from './socket';

export function useOnlineRoom(code: string, name: string | null) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!name) return;
    const socket = getSocket();
    const join = () => {
      setConnected(true);
      enterRoom(code);
      socket.emit('room:join', { code, name, token: getRoomToken(code), auth: getSessionToken() }, (res) => {
        if (res.ok) {
          storeRoomToken(code, res.token);
          setJoinError(null);
        } else {
          setJoinError(res.error);
        }
      });
    };
    const onState = (view: RoomView) => {
      if (view.code === code) setRoom(view);
    };
    const onDisconnect = () => setConnected(false);
    const onClosed = (reason: string) => {
      setRoom(null);
      setJoinError(reason);
    };

    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();

    return () => {
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
    };
  }, [code, name]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const actions = useMemo(() => {
    const onAck = (res: { ok: boolean; error?: string }) => {
      if (!res.ok) setToast(res.error ?? 'Erreur');
    };
    /** Not queued while disconnected: a move sent late would be played out of context. */
    const send = (emit: (socket: LudoClientSocket) => void) => {
      const socket = getSocket();
      if (socket.connected) emit(socket);
      else setToast(NOT_CONNECTED);
    };
    return {
      roll: () => send((s) => s.emit('game:roll', onAck)),
      move: (pawn: number) => send((s) => s.emit('game:move', { pawn }, onAck)),
      takeSeat: (color: Color) => send((s) => s.emit('room:takeSeat', { color }, onAck)),
      setSeat: (color: Color, kind: 'empty' | 'bot', botLevel?: BotLevel) =>
        send((s) => s.emit('room:setSeat', { color, kind, botLevel }, onAck)),
      setRules: (rules: Rules) => send((s) => s.emit('room:setRules', { rules }, onAck)),
      start: () => send((s) => s.emit('room:start', onAck)),
      setWager: (table: string | null) => send((s) => s.emit('room:setWager', { table }, onAck)),
      backToLobby: () => send((s) => s.emit('room:backToLobby', onAck)),
      rematch: () => send((s) => s.emit('room:rematch', onAck)),
      leave: () => {
        getSocket().emit('room:leave');
        forgetRoom('ludo');
      },
      react: (reaction: string) => send((s) => s.emit('game:react', { reaction })),
    };
  }, []);

  return { room, joinError, toast, connected, actions };
}

/** Calls `listener` for every reaction sent in the current room. */
export function useRoomReactions(listener: (message: ReactionMessage) => void) {
  useEffect(() => {
    const socket = getSocket();
    socket.on('room:reaction', listener);
    return () => {
      socket.off('room:reaction', listener);
    };
  }, [listener]);
}
