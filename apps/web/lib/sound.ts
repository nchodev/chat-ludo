'use client';

const MUTE_KEY = 'ludo:muted';

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<(muted: boolean) => void>();

export function isMuted(): boolean {
  if (muted === null) muted = typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  listeners.forEach((l) => l(value));
}

export function onMutedChange(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || isMuted()) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, { type = 'sine', gain = 0.12, delay = 0, slideTo }: {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
} = {}) {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function vibrate(pattern: number | number[]) {
  if (!isMuted() && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}

export const sfx = {
  roll() {
    for (let i = 0; i < 5; i++) tone(180 + Math.random() * 220, 0.05, { type: 'square', gain: 0.05, delay: i * 0.07 });
    vibrate(30);
  },
  step() {
    tone(720, 0.05, { type: 'triangle', gain: 0.07 });
  },
  capture() {
    tone(520, 0.25, { type: 'sawtooth', gain: 0.08, slideTo: 120 });
    vibrate([60, 40, 60]);
  },
  finish() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', delay: i * 0.09 }));
    vibrate(80);
  },
  yourTurn() {
    tone(880, 0.12, { gain: 0.08 });
    tone(1175, 0.16, { gain: 0.08, delay: 0.1 });
    vibrate(40);
  },
  reaction() {
    tone(660, 0.08, { gain: 0.06, slideTo: 990 });
  },
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.13 }));
    vibrate([100, 50, 100, 50, 200]);
  },
};
