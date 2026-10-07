'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BotLevel, Color, ReactionMessage, RoomView, Rules } from '@ludo/engine';
import { getRoomToken, getSocket, storeRoomToken } from './socket';

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
      socket.emit('room:join', { code, name, token: getRoomToken(code) }, (res) => {
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

    socket.on('room:state', onState);
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();

    return () => {
      socket.off('room:state', onState);
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
    return {
      roll: () => getSocket().emit('game:roll', onAck),
      move: (pawn: number) => getSocket().emit('game:move', { pawn }, onAck),
      takeSeat: (color: Color) => getSocket().emit('room:takeSeat', { color }, onAck),
      setSeat: (color: Color, kind: 'empty' | 'bot', botLevel?: BotLevel) =>
        getSocket().emit('room:setSeat', { color, kind, botLevel }, onAck),
      setRules: (rules: Rules) => getSocket().emit('room:setRules', { rules }, onAck),
      start: () => getSocket().emit('room:start', onAck),
      backToLobby: () => getSocket().emit('room:backToLobby', onAck),
      leave: () => getSocket().emit('room:leave'),
      react: (reaction: string) => getSocket().emit('game:react', { reaction }),
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
