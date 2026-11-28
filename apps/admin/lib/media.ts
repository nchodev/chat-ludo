'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getToken, serverUrl } from './api';

/** Longest side of a photo sent to a player: sharp enough for a screenshot, light on mobile data. */
const MAX_SIDE = 1600;
const MAX_VOICE_MS = 120_000;
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

/** Uploads a photo or voice note into a player's support conversation. */
export async function uploadSupportFile<T>(
  userId: number,
  file: Blob,
  info: { kind: 'image'; width: number; height: number; caption?: string } | { kind: 'voice'; durationMs: number },
): Promise<T> {
  const params = new URLSearchParams({ user: String(userId), kind: info.kind });
  if (info.kind === 'image') {
    params.set('width', String(info.width));
    params.set('height', String(info.height));
    if (info.caption) params.set('caption', info.caption);
  } else params.set('duration', String(Math.round(info.durationMs)));
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/api/admin/support/upload?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type.split(';')[0] || 'application/octet-stream', Authorization: `Bearer ${getToken() ?? ''}` },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Envoi impossible.');
  return data.message as T;
}

const cache = new Map<number, Promise<string>>();

/** Object URL of a conversation's photo or voice note, downloaded once. */
export function supportMediaUrl(id: number): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    url = fetch(`${serverUrl()}/api/admin/support/media?id=${id}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Fichier indisponible.');
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob));
    url.catch(() => cache.delete(id));
    cache.set(id, url);
  }
  return url;
}

export function rememberSupportMedia(id: number, url: string) {
  cache.set(id, Promise.resolve(url));
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  url: string;
}

/** Shrinks a picked image and re-encodes it as JPEG (also drops its metadata). */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choisis une image.');
  const source = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Cette image ne peut pas être ouverte.'));
      el.src = source;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Image illisible.');
    return { blob, width: canvas.width, height: canvas.height, url: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface Recording {
  blob: Blob;
  durationMs: number;
}

/** Microphone recording, stopped automatically at two minutes (then handed to `onLimit`). */
export function useRecorder(onLimit: (recording: Recording) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const finish = useRef<((r: Recording | null) => void) | null>(null);
  const keep = useRef(true);
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;

  useEffect(
    () => () => {
      keep.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
    },
    [],
  );

  const start = useCallback(async () => {
    if (recorder.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      throw new Error(
        err instanceof DOMException && err.name === 'NotAllowedError' ? 'Micro bloqué : autorise-le dans le navigateur.' : 'Micro indisponible.',
      );
    }
    const mimeType = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    keep.current = true;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ticker = setInterval(() => {
      const time = Date.now() - startedAt;
      setElapsed(time);
      if (time >= MAX_VOICE_MS && rec.state === 'recording') rec.stop();
    }, 200);
    rec.onstop = () => {
      clearInterval(ticker);
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecording(false);
      setElapsed(0);
      const durationMs = Math.min(Date.now() - startedAt, MAX_VOICE_MS);
      const result = keep.current && durationMs >= 600 ? { blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), durationMs } : null;
      if (finish.current) finish.current(result);
      else if (result) onLimitRef.current(result);
      finish.current = null;
    };
    rec.start(250);
    recorder.current = rec;
    setRecording(true);
  }, []);

  const stop = useCallback(
    (save: boolean) =>
      new Promise<Recording | null>((resolve) => {
        const rec = recorder.current;
        if (!rec) return resolve(null);
        keep.current = save;
        finish.current = resolve;
        rec.stop();
      }),
    [],
  );

  return { recording, elapsed, start, stop };
}
