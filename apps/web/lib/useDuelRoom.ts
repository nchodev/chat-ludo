'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DuelGame, DuelMovePayload, DuelRoomView, DuelRoomViewOf } from '@ludo/engine';
import { getSessionToken } from './profile';
import { NOT_CONNECTED } from './connectivity';
import { getDraughtsToken, getSocket, storeDraughtsToken, type LudoClientSocket } from './socket';

/**
 * Joins the two-player room `code` of game `kind`. Room codes are shared by every such game: a code of
 * another game comes back in `otherKind` so the page can send the player to the right screen.
 */
export function useDuelRoom<K extends DuelGame>(kind: K, code: string, name: string | null) {
  const [view, setView] = useState<DuelRoomView | null>(null);
  /** When the last state arrived, to run the clocks between updates. */
  const [receivedAt, setReceivedAt] = useState(0);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!name) return;
    const socket = getSocket();
    const join = () => {
      setConnected(true);
      socket.emit('draughts:join', { code, name, token: getDraughtsToken(code), auth: getSessionToken() }, (res) => {
        if (res.ok) {
          storeDraughtsToken(code, res.token);
          setJoinError(null);
        } else {
          setJoinError(res.error);
        }
      });
    };
    const onState = (next: DuelRoomView) => {
      if (next.code !== code) return;
      setView(next);
      setReceivedAt(Date.now());
    };
    const onDisconnect = () => setConnected(false);
    const onClosed = (reason: string) => {
      setView(null);
      setJoinError(reason);
    };
    socket.on('draughts:state', onState);
    socket.on('draughts:closed', onClosed);
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) join();
    else socket.connect();
    return () => {
      socket.off('draughts:state', onState);
      socket.off('draughts:closed', onClosed);
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
      move: (move: DuelMovePayload) => send((s) => s.emit('draughts:move', move, onAck)),
      start: () => send((s) => s.emit('draughts:start', onAck)),
      setWager: (table: string | null) => send((s) => s.emit('draughts:setWager', { table }, onAck)),
      resign: () => send((s) => s.emit('draughts:resign', onAck)),
      draw: () => send((s) => s.emit('draughts:draw', onAck)),
      declineDraw: () => send((s) => s.emit('draughts:declineDraw', onAck)),
      rematch: () => send((s) => s.emit('draughts:rematch', onAck)),
      leave: () => getSocket().emit('draughts:leave'),
    };
  }, []);

  const room = view?.kind === kind ? (view as DuelRoomViewOf<K>) : null;
  const otherKind = view && view.kind !== kind ? view.kind : null;
  return { room, otherKind, receivedAt, joinError, toast, connected, actions };
}

export type DuelActions = ReturnType<typeof useDuelRoom>['actions'];
