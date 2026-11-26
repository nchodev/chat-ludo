import { chatPreviewText, type ChatMessageKind } from '@ludo/engine';

const DAY_MS = 86_400_000;

const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function startOfDay(value: number) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole days between the day of `value` and today. */
function daysAgo(value: number) {
  return Math.round((startOfDay(Date.now()) - startOfDay(value)) / DAY_MS);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatTime(value: number) {
  return time.format(value);
}

export function sameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

/** Separator shown above the first message of each day in a conversation. */
export function dayLabel(value: number) {
  const days = daysAgo(value);
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  if (days < 7) return capitalize(weekday.format(value));
  return longDate.format(value);
}

/** Time shown next to a conversation in the list. */
export function listStamp(value: number) {
  const days = daysAgo(value);
  if (days === 0) return time.format(value);
  if (days === 1) return 'Hier';
  if (days < 7) return capitalize(weekday.format(value));
  return shortDate.format(value);
}

/** One-line summary of a message for the chat list and notifications. */
export function messagePreview(message: { kind: ChatMessageKind; body: string; deleted: boolean; durationMs: number | null }) {
  if (message.deleted) return 'Message supprimé';
  return chatPreviewText(message);
}
