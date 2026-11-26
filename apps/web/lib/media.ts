'use client';

import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, type ChatMessageView } from '@ludo/engine';
import { ApiError } from './api';
import { NO_EDITS, renderPhoto, type PhotoEdits } from './photoEdit';
import { getSessionToken } from './profile';
import { serverUrl } from './socket';

const cache = new Map<number, Promise<string>>();

/** Object URL of a voice note's recording or a photo, downloaded once per session. */
export function mediaUrl(id: number): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    url = fetch(`${serverUrl()}/api/messages/media?id=${id}`, { headers: { Authorization: `Bearer ${getSessionToken() ?? ''}` } })
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

export async function mediaBlob(id: number): Promise<Blob> {
  return fetch(await mediaUrl(id)).then((res) => res.blob());
}

/** Lets the uploaded copy reuse the picture already on screen instead of downloading it again. */
export function rememberMedia(id: number, localUrl: string) {
  cache.set(id, Promise.resolve(localUrl));
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  url: string;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cette image ne peut pas être ouverte.'));
    img.src = src;
  });
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** JPEG light enough to send, from a drawn photo. */
export async function exportCanvas(canvas: HTMLCanvasElement): Promise<PreparedImage> {
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await encode(canvas, quality);
    if (blob && blob.size <= MAX_IMAGE_BYTES) return { blob, width: canvas.width, height: canvas.height, url: URL.createObjectURL(blob) };
  }
  throw new Error('Photo trop lourde, même compressée.');
}

/** Retouched photo, at most MAX_IMAGE_SIDE long. */
export async function exportEdited(img: HTMLImageElement, edits: PhotoEdits): Promise<PreparedImage> {
  return exportCanvas(renderPhoto(img, edits, MAX_IMAGE_SIDE));
}

/**
 * Shrinks a picked photo to MAX_IMAGE_SIDE and re-encodes it as JPEG: light enough for mobile
 * data, and redrawing it drops the file's metadata (GPS position, camera model…).
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choisis une photo.');
  const url = URL.createObjectURL(file);
  try {
    return await exportEdited(await loadImage(url), NO_EDITS);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(to: string, image: Blob, size: { width: number; height: number }, caption: string, replyTo?: number | null): Promise<ChatMessageView> {
  const params = new URLSearchParams({ to, width: String(size.width), height: String(size.height) });
  if (caption) params.set('caption', caption);
  if (replyTo) params.set('replyTo', String(replyTo));
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/api/messages/image?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': image.type || 'image/jpeg', Authorization: `Bearer ${getSessionToken() ?? ''}` },
      body: image,
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifie ta connexion.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Envoi de la photo impossible.');
  return data.message as ChatMessageView;
}
