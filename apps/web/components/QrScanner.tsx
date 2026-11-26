'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import { appPathFromCode } from '@/lib/profileLink';
import { Icon } from './Icons';

interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

const SCAN_EVERY_MS = 180;
/** Frames are scaled down before decoding: plenty for a QR code, much faster on phones. */
const SCAN_WIDTH = 640;

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code'];
    return formats.includes('qr_code') ? new Ctor({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

function decodeCanvas(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement) {
  const scale = Math.min(1, SCAN_WIDTH / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Full-screen camera that reads a QR code: a LuChat profile opens its card, any other code is shown. */
export function QrScanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unavailable'>('starting');
  const [result, setResult] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handle = (text: string) => {
    navigator.vibrate?.(40);
    const path = appPathFromCode(text);
    if (path) {
      onClose();
      router.push(path);
    } else {
      setResult(text);
    }
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    if (result) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    canvas.current ??= document.createElement('canvas');

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (err) {
        if (!stopped) setStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
        return;
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setStatus('scanning');
      const detector = await nativeDetector();

      const tick = async () => {
        if (stopped) return;
        const el = video.current;
        if (el && el.readyState >= 2 && el.videoWidth) {
          let text: string | null = null;
          try {
            if (detector) text = (await detector.detect(el))[0]?.rawValue ?? null;
            else text = decodeCanvas(el, el.videoWidth, el.videoHeight, canvas.current!);
          } catch {
            text = null;
          }
          if (text && !stopped) {
            stopped = true;
            handleRef.current(text);
            return;
          }
        }
        timer = setTimeout(tick, SCAN_EVERY_MS);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [result]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setNotFound(false);
    try {
      const bitmap = await createImageBitmap(file);
      const text = decodeCanvas(bitmap, bitmap.width, bitmap.height, (canvas.current ??= document.createElement('canvas')));
      bitmap.close();
      if (text) handle(text);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    }
  };

  const isWebLink = result ? /^https?:\/\//i.test(result) : false;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-[#e9edef]">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />

      <div className="relative z-10 flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Fermer le scanner" className="grid size-11 place-items-center rounded-full bg-black/40 active:bg-black/60">
          <Icon.Close size={24} />
        </button>
        <h2 className="flex-1 text-[18px] font-medium drop-shadow">Scanner un QR code</h2>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8">
        {status === 'scanning' && !result && (
          <>
            <div className="relative aspect-square w-full max-w-[280px] rounded-[28px] shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]">
              {(['top-0 left-0 border-t-4 border-l-4 rounded-tl-[28px]', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-[28px]', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[28px]', 'bottom-0 right-0 border-r-4 border-b-4 rounded-br-[28px]'] as const).map((corner) => (
                <span key={corner} className={`absolute size-12 border-[#00a884] ${corner}`} />
              ))}
              <span className="qr-scan-line absolute inset-x-4 h-0.5 rounded-full bg-[#00a884] shadow-[0_0_12px_#00a884]" />
            </div>
            <p className="mt-6 text-center text-[14.5px] drop-shadow">Place le QR code d’un ami dans le cadre</p>
          </>
        )}

        {status === 'starting' && <span className="size-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />}

        {(status === 'denied' || status === 'unavailable') && !result && (
          <div className="flex max-w-xs flex-col items-center text-center">
            <span className="grid size-20 place-items-center rounded-full bg-white/10">
              <Icon.QrScan size={38} />
            </span>
            <p className="mt-4 text-[17px] font-semibold">{status === 'denied' ? 'Caméra bloquée' : 'Caméra indisponible'}</p>
            <p className="mt-1 text-[14px] text-[#aebac1]">
              {status === 'denied'
                ? 'Autorise la caméra dans les réglages du site (cadenas près de l’adresse), ou importe une photo du QR code.'
                : 'Importe plutôt une photo du QR code.'}
            </p>
          </div>
        )}

        {result && (
          <div className="w-full max-w-sm rounded-3xl bg-[#1f2c33] p-5 text-center">
            <p className="text-[13px] text-[#8696a0]">Ce QR code n’est pas une invitation LuChat</p>
            <p className="mt-2 text-[15px] break-all text-[#e9edef]">{result}</p>
            <div className="mt-4 flex flex-col gap-2">
              {isWebLink && (
                <a
                  href={result}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a]"
                >
                  <Icon.Link size={18} />
                  Ouvrir le lien
                </a>
              )}
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884]"
              >
                <Icon.Refresh size={18} />
                Scanner un autre code
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-2 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {notFound && <p className="rounded-full bg-black/60 px-3 py-1.5 text-[13px] text-[#ffb3bd]">Aucun QR code trouvé sur cette image.</p>}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-12 items-center gap-2 rounded-full bg-white/15 px-5 text-[15px] font-semibold backdrop-blur active:bg-white/25"
        >
          <Icon.Add size={20} />
          Importer une photo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void fromPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
