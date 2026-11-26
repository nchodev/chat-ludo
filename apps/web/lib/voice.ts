'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VOICE_MS, type ChatMessageView } from '@ludo/engine';
import { ApiError } from './api';
import { getSessionToken } from './profile';
import { serverUrl } from './socket';

/**
 * Opus where supported, AAC on Safari. Chrome reports AAC-in-MP4 as supported but its
 * encoder can fail at start, so it is not asked for explicitly.
 */
const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const MIN_VOICE_MS = 600;

export function formatVoiceDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function canRecordVoice() {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export async function uploadVoice(to: string, audio: Blob, durationMs: number, replyTo?: number | null): Promise<ChatMessageView> {
  const params = new URLSearchParams({ to, duration: String(Math.round(durationMs)) });
  if (replyTo) params.set('replyTo', String(replyTo));
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}/api/messages/voice?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type.split(';')[0] || 'audio/webm', Authorization: `Bearer ${getSessionToken() ?? ''}` },
      body: audio,
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifie ta connexion.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Envoi du message vocal impossible.');
  return data.message as ChatMessageView;
}

export { mediaUrl as voiceUrl, mediaBlob as voiceBlob } from './media';

let sharedContext: AudioContext | null = null;

function audioContext() {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  sharedContext ??= new AudioCtx();
  void sharedContext.resume().catch(() => {});
  return sharedContext;
}

let activePlayback: VoicePlayback | null = null;
let sharedElement: HTMLAudioElement | null = null;
let elementOwner: VoicePlayback | null = null;

/** Stops whichever voice note is playing, e.g. when the microphone starts recording. */
export function stopVoicePlayback() {
  activePlayback?.pause();
}

interface PlaybackHandlers {
  onTime: (seconds: number) => void;
  onPlaying: (playing: boolean) => void;
  onEnded: () => void;
}

/**
 * Plays a voice note with an <audio> element, falling back to Web Audio when the element
 * is refused: Android pauses media elements during a phone call, Web Audio still plays.
 */
export class VoicePlayback {
  private element: HTMLAudioElement | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private startedFrom = 0;
  private position = 0;
  private rate = 1;
  private useWebAudio = false;

  constructor(
    private readonly url: string,
    private readonly handlers: PlaybackHandlers,
  ) {}

  get playing() {
    return this.useWebAudio ? !!this.source : !!this.element && !this.element.paused;
  }

  async play() {
    if (activePlayback && activePlayback !== this) activePlayback.pause();
    activePlayback = this;
    if (!this.useWebAudio) {
      try {
        await this.playElement();
        return;
      } catch {
        this.dropElement();
        this.useWebAudio = true;
      }
    }
    await this.playWebAudio();
  }

  pause() {
    if (this.useWebAudio) this.stopSource(true);
    else this.element?.pause();
  }

  seek(seconds: number) {
    this.position = Math.max(0, seconds);
    if (this.useWebAudio) {
      if (this.source) {
        this.stopSource(false);
        this.startSource();
      }
    } else if (this.element) {
      this.element.currentTime = this.position;
    }
    this.handlers.onTime(this.position);
  }

  setRate(rate: number) {
    if (this.source) {
      this.position = this.currentTime();
      this.startedFrom = this.position;
      this.startedAt = this.source.context.currentTime;
      this.source.playbackRate.value = rate;
    }
    this.rate = rate;
    if (this.element) this.element.playbackRate = rate;
  }

  dispose() {
    this.pause();
    this.dropElement();
    if (activePlayback === this) activePlayback = null;
  }

  private async playElement() {
    if (!this.element) {
      // One element for every note: once a tap has started it, Safari lets it play the next note on its own.
      const el = (sharedElement ??= new Audio());
      if (elementOwner && elementOwner !== this) elementOwner.dropElement();
      elementOwner = this;
      el.preload = 'auto';
      el.src = this.url;
      el.ontimeupdate = () => {
        this.position = el.currentTime;
        this.handlers.onTime(el.currentTime);
      };
      el.onplay = () => this.handlers.onPlaying(true);
      el.onpause = () => this.handlers.onPlaying(false);
      el.onended = () => {
        this.position = 0;
        this.handlers.onEnded();
      };
      this.element = el;
      if (this.position) el.currentTime = this.position;
    }
    this.element.playbackRate = this.rate;
    await this.element.play();
  }

  private dropElement() {
    if (!this.element) return;
    const el = this.element;
    if (elementOwner === this) {
      el.onplay = el.onpause = el.onended = el.ontimeupdate = null;
      el.pause();
      elementOwner = null;
    }
    this.element = null;
    this.handlers.onPlaying(false);
  }

  private async playWebAudio() {
    const context = audioContext();
    if (!this.buffer) {
      const data = await fetch(this.url).then((res) => res.arrayBuffer());
      this.buffer = await context.decodeAudioData(data);
    }
    if (context.state !== 'running') await context.resume();
    if (this.position >= this.buffer.duration) this.position = 0;
    this.startSource();
  }

  private currentTime() {
    if (!this.source) return this.position;
    return this.startedFrom + (this.source.context.currentTime - this.startedAt) * this.rate;
  }

  private startSource() {
    const context = audioContext();
    if (!this.buffer) return;
    const source = context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    source.connect(context.destination);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.clearTicker();
      this.position = 0;
      this.handlers.onPlaying(false);
      this.handlers.onEnded();
    };
    this.source = source;
    this.startedAt = context.currentTime;
    this.startedFrom = this.position;
    source.start(0, this.position);
    this.handlers.onPlaying(true);
    this.clearTicker();
    this.ticker = setInterval(() => this.handlers.onTime(this.currentTime()), 100);
  }

  private stopSource(notify: boolean) {
    const source = this.source;
    if (!source) return;
    this.position = this.currentTime();
    this.source = null;
    this.clearTicker();
    try {
      source.stop();
    } catch {
      // already stopped
    }
    if (notify) this.handlers.onPlaying(false);
  }

  private clearTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
}

export type RecorderState = 'idle' | 'starting' | 'recording' | 'paused';

export interface Recording {
  blob: Blob;
  durationMs: number;
}

/** Microphone recording capped at MAX_VOICE_MS, with a live level meter for the waveform. */
export function useVoiceRecorder(onLimit: (recording: Recording) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  /** Recorded time before the current segment, and when that segment began (pauses excluded). */
  const recordedMs = useRef(0);
  const segmentStart = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const finish = useRef<((recording: Recording | null) => void) | null>(null);
  const cancelled = useRef(false);
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;

  const cleanup = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => {});
    audioContext.current = null;
    recorder.current = null;
    setState('idle');
    setElapsed(0);
    setLevels([]);
  }, []);

  useEffect(() => () => {
    cancelled.current = true;
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    cleanup();
  }, [cleanup]);

  const stop = useCallback(
    (keep: boolean) =>
      new Promise<Recording | null>((resolve) => {
        const current = recorder.current;
        if (!current || current.state === 'inactive') {
          cancelled.current = true;
          cleanup();
          resolve(null);
          return;
        }
        cancelled.current = !keep;
        finish.current = resolve;
        current.stop();
      }),
    [cleanup],
  );

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    cancelled.current = false;
    stopVoicePlayback();
    setState('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (cancelled.current) {
        media.getTracks().forEach((track) => track.stop());
        setState('idle');
        return;
      }
      stream.current = media;
      const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const durationMs = recordedMs.current + (segmentStart.current ? Date.now() - segmentStart.current : 0);
        const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || 'audio/webm' });
        const keep = !cancelled.current && durationMs >= MIN_VOICE_MS;
        cleanup();
        const recording = keep ? { blob, durationMs: Math.min(durationMs, MAX_VOICE_MS) } : null;
        if (finish.current) finish.current(recording);
        else if (recording) onLimitRef.current(recording);
        finish.current = null;
      };

      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      audioContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(media).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      rec.start(250);
      recordedMs.current = 0;
      segmentStart.current = Date.now();
      setState('recording');
      navigator.vibrate?.(30);
      ticker.current = setInterval(() => {
        if (rec.state !== 'recording') return;
        const time = recordedMs.current + Date.now() - segmentStart.current;
        setElapsed(time);
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const s of samples) peak = Math.max(peak, Math.abs(s - 128));
        setLevels((l) => [...l.slice(-59), Math.min(1, peak / 64)]);
        if (time >= MAX_VOICE_MS && rec.state === 'recording') rec.stop();
      }, 100);
    } catch (err) {
      cleanup();
      throw err instanceof DOMException && err.name === 'NotAllowedError'
        ? new Error('Micro bloqué. Touche le cadenas à gauche de l’adresse du site, autorise le micro, puis réessaie.')
        : new Error('Micro indisponible sur cet appareil.');
    }
  }, [cleanup, state]);

  const pause = useCallback(() => {
    const rec = recorder.current;
    if (rec?.state !== 'recording') return;
    recordedMs.current += Date.now() - segmentStart.current;
    segmentStart.current = 0;
    rec.pause();
    rec.requestData();
    setElapsed(recordedMs.current);
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    const rec = recorder.current;
    if (rec?.state !== 'paused' || recordedMs.current >= MAX_VOICE_MS) return;
    segmentStart.current = Date.now();
    rec.resume();
    setState('recording');
    navigator.vibrate?.(20);
  }, []);

  /** What has been recorded so far, to listen back while paused. */
  const preview = useCallback(
    () => (chunks.current.length ? new Blob(chunks.current, { type: recorder.current?.mimeType || 'audio/webm' }) : null),
    [],
  );

  return { state, elapsed, levels, start, stop, pause, resume, preview };
}
