'use client';

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  CHAT_QUICK_REACTIONS,
  MAX_FORWARD_TARGETS,
  MAX_VOICE_MS,
  chatPreviewText,
  canEditMessage,
  describeGroupEvent,
  parseChatImage,
  parseGroupEvent,
  type ChatReplyPreview,
  type GroupView,
} from '@ludo/engine';
import type { ChatMessage } from '@/lib/social';
import { VoicePlayback, canRecordVoice, formatVoiceDuration, useVoiceRecorder, voiceBlob, voiceUrl, type Recording } from '@/lib/voice';
import { mediaBlob, prepareImage, type PreparedImage } from '@/lib/media';
import { firstLink, splitLinks, useLinkPreview, type LinkPreview } from '@/lib/links';
import { BackButton } from '../BackButton';
import { Icon } from '../Icons';
import { Sheet } from '../Sheet';
import { Avatar, colorFor } from './Avatar';
import { ChallengeSheet } from './ChallengeSheet';
import { InviteCard } from './InviteCard';
import { MAX_PHOTOS, PhotoComposer, type OutgoingPhoto } from './PhotoComposer';
import { PhotoAlbum, PhotoInBubble } from './Photos';
import { Ticks } from './Ticks';
import { dayLabel, formatTime, sameDay } from './format';

export type ThreadItem = ChatMessage & {
  pending?: boolean;
  failed?: boolean;
  /** Recording of a voice note not uploaded yet. */
  localBlob?: Blob;
  localUrl?: string;
};

const MAX_LENGTH = 500;
const QUICK_EMOJIS = ['😂', '❤️', '👍', '🔥', '😮', '😢', '🙏', '🎲', '🏆', '😎', '🤣', '😡', '👏', '💪', '🎉', '😅', '🤔', '😴'];
const MORE_REACTIONS = [
  ...CHAT_QUICK_REACTIONS,
  '🔥', '🎉', '👏', '💪', '😎', '🤣', '😅', '🤔', '😡', '😴', '🥳', '😍', '🤩', '😇', '🙌', '👌', '✌️', '🤝',
  '💯', '⭐', '🏆', '🎲', '👀', '😱', '🥲', '😬', '🙈', '💀', '🤯', '😤', '🫡', '👎',
];
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+$/u;
/** How close to the bottom (px) still counts as "reading the latest messages". */
const STICK_TO_BOTTOM_PX = 120;
const LONG_PRESS_MS = 420;
const SWIPE_REPLY_PX = 56;
const CANCEL_RECORDING_PX = 120;
const LOCK_RECORDING_PX = 90;

function bigEmoji(body: string) {
  if (!EMOJI_ONLY.test(body)) return false;
  const count = [...body.matchAll(/\p{Extended_Pictographic}/gu)].length;
  return count > 0 && count <= 3;
}

function tickState(message: ThreadItem) {
  if (message.failed) return 'failed';
  if (message.pending) return 'pending';
  return message.readAt ? 'read' : 'sent';
}

function quoteOf(message: ThreadItem): ChatReplyPreview {
  return {
    id: message.id,
    from: message.from,
    kind: message.kind,
    body: message.body.slice(0, 200),
    durationMs: message.durationMs,
    deleted: message.deleted,
  };
}

/** Same bars for a given voice note every time it is drawn. */
function waveform(seed: number, count = 30) {
  let x = Math.abs(Math.floor(seed)) % 233280;
  return Array.from({ length: count }, () => {
    x = (x * 9301 + 49297) % 233280;
    return 0.22 + (x / 233280) * 0.78;
  });
}

/** Voice notes on screen, so the one that follows can start when a note ends. */
const voicePlayers = new Map<number, () => void>();

function VoicePlayer({ message, sender, nextVoiceId }: { message: ThreadItem; sender: string; nextVoiceId?: number }) {
  const playback = useRef<VoicePlayback | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const nextRef = useRef(nextVoiceId);
  nextRef.current = nextVoiceId;
  const [url, setUrl] = useState<string | null>(message.localUrl ?? null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  const total = message.durationMs ?? 0;
  const bars = waveform(message.id > 0 ? message.id : message.createdAt);

  // Downloaded ahead so that a tap starts playback right away, inside the tap itself.
  useEffect(() => {
    if (url || message.id <= 0) return;
    let alive = true;
    voiceUrl(message.id)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [message.id, url]);

  useEffect(() => () => playback.current?.dispose(), []);

  const player = (source: string) => {
    playback.current ??= new VoicePlayback(source, {
      onTime: (seconds) => total && setProgress(Math.min(1, (seconds * 1000) / total)),
      onPlaying: setPlaying,
      onEnded: () => {
        setPlaying(false);
        setProgress(0);
        if (nextRef.current) voicePlayers.get(nextRef.current)?.();
      },
    });
    return playback.current;
  };

  const start = async () => {
    setLoading(true);
    setError(false);
    try {
      const p = player(url ?? (await voiceUrl(message.id)));
      p.setRate(rate);
      await p.play();
    } catch {
      playback.current?.dispose();
      playback.current = null;
      setPlaying(false);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (playing) playback.current?.pause();
    else void start();
  };

  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (message.id <= 0) return;
    const id = message.id;
    const play = () => {
      root.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      void startRef.current();
    };
    voicePlayers.set(id, play);
    return () => {
      if (voicePlayers.get(id) === play) voicePlayers.delete(id);
    };
  }, [message.id]);

  const seek = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setProgress(ratio);
    playback.current?.seek((ratio * total) / 1000);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    playback.current?.setRate(next);
  };

  const shown = playing || progress > 0 ? progress * total : total;

  return (
    <div ref={root} className="flex w-[248px] items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={toggle}
        className="grid size-10 shrink-0 place-items-center rounded-full text-[#e9edef] active:bg-white/10"
        aria-label={playing ? 'Pause' : 'Écouter le message vocal'}
      >
        {loading ? (
          <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : playing ? (
          <Icon.Pause size={28} />
        ) : (
          <Icon.Play size={30} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-7 cursor-pointer items-center gap-[2px]" onPointerDown={seek} role="slider" aria-label="Position" aria-valuenow={Math.round(progress * 100)}>
          {bars.map((h, i) => (
            <span
              key={i}
              className={`w-[3px] shrink-0 rounded-full ${i / bars.length < progress ? 'bg-[#53bdeb]' : 'bg-[#8696a0]/70'}`}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#53bdeb]"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <span className="block text-[11px] text-[#ffffff99]">{error ? 'Échec de lecture, réessaie' : formatVoiceDuration(shown)}</span>
      </div>
      {playing || progress > 0 ? (
        <button
          type="button"
          onClick={cycleRate}
          className="h-7 shrink-0 rounded-full bg-black/25 px-2 text-[12.5px] font-semibold text-[#e9edef]"
          aria-label="Vitesse de lecture"
        >
          {rate}×
        </button>
      ) : (
        <span className="relative shrink-0">
          <Avatar name={sender} size={40} />
          <span className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full text-[#53bdeb]">
            <Icon.Mic size={16} />
          </span>
        </span>
      )}
    </div>
  );
}

/** Listening back to a paused recording before resuming or sending it. */
function RecordingPreview({ blob, durationMs, levels }: { blob: Blob | null; durationMs: number; levels: number[] }) {
  const playback = useRef<VoicePlayback | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [url] = useState(() => (blob ? URL.createObjectURL(blob) : null));
  const bars = levels.length > 1 ? levels : waveform(durationMs, 40);

  useEffect(
    () => () => {
      playback.current?.dispose();
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const toggle = () => {
    if (!url) return;
    if (playing) {
      playback.current?.pause();
      return;
    }
    playback.current ??= new VoicePlayback(url, {
      onTime: (seconds) => setPosition(seconds * 1000),
      onPlaying: setPlaying,
      onEnded: () => {
        setPlaying(false);
        setPosition(0);
      },
    });
    playback.current.play().catch(() => setPlaying(false));
  };

  const progress = durationMs ? Math.min(1, position / durationMs) : 0;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'Pause' : 'Écouter l’enregistrement'}
        className="grid size-9 shrink-0 place-items-center rounded-full text-[#e9edef] active:bg-white/10 disabled:opacity-40"
      >
        {playing ? <Icon.Pause size={24} /> : <Icon.Play size={26} />}
      </button>
      <span className="w-11 shrink-0 text-[15px] text-[#e9edef] tabular-nums">
        {formatVoiceDuration(playing || position ? position : durationMs)}
      </span>
      <span className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
        {bars.map((l, i) => (
          <span
            key={i}
            className={`w-[3px] shrink-0 rounded-full ${i / bars.length < progress ? 'bg-[#53bdeb]' : 'bg-[#8696a0]'}`}
            style={{ height: `${Math.max(12, l * 100)}%` }}
          />
        ))}
      </span>
      <span className="shrink-0 text-[12px] font-medium text-[#f15c6d]">En pause</span>
    </div>
  );
}

function QuoteBlock({ quote, me, onClick, compact }: { quote: ChatReplyPreview; me: string; onClick?: () => void; compact?: boolean }) {
  const fromMe = quote.from === me;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-w-0 overflow-hidden rounded-md bg-black/20 text-left ${compact ? '' : 'mb-1'}`}
    >
      <span className={`w-1 shrink-0 ${fromMe ? 'bg-[#06cf9c]' : 'bg-[#a5b337]'}`} />
      <span className="min-w-0 flex-1 px-2 py-1.5">
        <span className={`block truncate text-[12.5px] font-medium ${fromMe ? 'text-[#06cf9c]' : 'text-[#a5b337]'}`}>
          {fromMe ? 'Toi' : quote.from}
        </span>
        <span className="flex items-center gap-1 text-[13px] text-[#d1d7db]/80">
          {quote.deleted ? (
            <>
              <Icon.Ban size={14} />
              <span className="italic">Message supprimé</span>
            </>
          ) : quote.kind === 'voice' ? (
            <>
              <Icon.Mic size={15} className="text-[#53bdeb]" />
              Message vocal ({formatVoiceDuration(quote.durationMs ?? 0)})
            </>
          ) : quote.kind === 'invite' ? (
            <>
              <Icon.Bolt size={15} className="text-[#ffd279]" />
              {chatPreviewText(quote)}
            </>
          ) : quote.kind === 'image' ? (
            <>
              <Icon.Image size={15} className="shrink-0 text-[#53bdeb]" />
              <span className="truncate">{chatPreviewText(quote)}</span>
            </>
          ) : (
            <span className="line-clamp-2 break-words">{quote.body}</span>
          )}
        </span>
      </span>
    </button>
  );
}

function ReactionPills({ message, me, onOpen }: { message: ThreadItem; me: string; onOpen: () => void }) {
  if (message.reactions.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of message.reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const mineToo = message.reactions.some((r) => r.from === me);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`absolute -bottom-[18px] z-[1] flex items-center gap-0.5 rounded-full border-2 border-[#0b141a] px-1.5 py-[1px] text-[14px] leading-5 ${
        mineToo ? 'bg-[#005c4b]' : 'bg-[#202c33]'
      } ${message.mine ? 'right-2' : 'left-2'}`}
      aria-label="Voir les réactions"
    >
      {[...counts.keys()].slice(0, 3).map((emoji) => (
        <span key={emoji}>{emoji}</span>
      ))}
      {message.reactions.length > 1 && <span className="pl-0.5 text-[12px] text-[#8696a0]">{message.reactions.length}</span>}
    </button>
  );
}

const stopPress = (e: ReactPointerEvent) => e.stopPropagation();

function LinkedText({ text }: { text: string }) {
  return splitLinks(text).map((part, i) =>
    part.href ? (
      <a
        key={i}
        href={part.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onPointerDown={stopPress}
        className="text-[#53bdeb] underline decoration-[#53bdeb]/50 underline-offset-2"
      >
        {part.text}
      </a>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    ),
  );
}

/** Shared web page: image, site, title and description, opening the page on tap. */
function LinkCard({ preview, mine }: { preview: LinkPreview; mine: boolean }) {
  const [imageOk, setImageOk] = useState(true);
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onPointerDown={stopPress}
      className={`-mx-1 mb-1.5 block overflow-hidden rounded-md ${mine ? 'bg-[#025144]' : 'bg-[#1d282f]'} transition active:opacity-80`}
    >
      {preview.image && imageOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageOk(false)}
          className="aspect-[1.91/1] w-full bg-black/20 object-cover"
        />
      )}
      <span className="flex flex-col gap-0.5 border-l-4 border-[#00a884] px-2.5 py-2">
        <span className="line-clamp-2 text-[14px] leading-snug font-semibold text-[#e9edef]">{preview.title}</span>
        {preview.description && <span className="line-clamp-2 text-[12.5px] leading-snug text-[#aebac1]">{preview.description}</span>}
        <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-[#8696a0]">
          <Icon.Link size={13} />
          {preview.site}
        </span>
      </span>
    </a>
  );
}

function Bubble({
  message,
  me,
  first,
  onRetry,
  onQuoteClick,
  onReactionsOpen,
  nextVoiceId,
  showSender,
}: {
  message: ThreadItem;
  me: string;
  first: boolean;
  /** In groups, the author's name on top of their first message in a row. */
  showSender?: boolean;
  /** Voice note right after this one, played when it ends. */
  nextVoiceId?: number;
  onRetry: (message: ThreadItem) => void;
  onQuoteClick: (id: number) => void;
  onReactionsOpen: (message: ThreadItem) => void;
}) {
  const mine = message.mine;
  const emoji = message.kind === 'text' && !message.deleted && !message.replyTo && !message.forwarded && bigEmoji(message.body);
  const preview = useLinkPreview(message.kind === 'text' && !message.deleted ? firstLink(message.body) : null);
  const meta = (
    <span className="flex items-center gap-1 text-[11px] leading-none whitespace-nowrap text-[#ffffff99]">
      {message.edited && !message.deleted && <span className="italic">Modifié</span>}
      {formatTime(message.createdAt)}
      {mine && !message.deleted && <Ticks state={tickState(message)} />}
    </span>
  );

  let content: ReactNode;
  if (message.deleted) {
    content = (
      <>
        <span className="flex items-center gap-1.5 text-[14px] text-[#8696a0] italic">
          <Icon.Ban size={16} />
          {mine && !message.group ? 'Tu as supprimé ce message' : 'Ce message a été supprimé'}
        </span>
        <span className="inline-block w-[44px]" aria-hidden />
        <span className="absolute right-2 bottom-1.5">{meta}</span>
      </>
    );
  } else if (message.kind === 'voice') {
    content = (
      <>
        <VoicePlayer message={message} sender={message.from} nextVoiceId={nextVoiceId} />
        <span className="absolute right-2 bottom-1.5">{meta}</span>
      </>
    );
  } else if (message.kind === 'image') {
    content = (
      <PhotoInBubble id={message.id} body={message.body} localUrl={message.localUrl} sender={mine ? 'Toi' : message.from} createdAt={message.createdAt} meta={meta} />
    );
  } else if (message.kind === 'invite') {
    content = (
      <>
        <InviteCard body={message.body} mine={mine} from={message.from} />
        <span className="mt-1 flex justify-end">{meta}</span>
      </>
    );
  } else {
    content = (
      <>
        {preview && <LinkCard preview={preview} mine={mine} />}
        <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          <LinkedText text={message.body} />
        </span>
        <span className={`inline-block ${message.edited ? (mine ? 'w-[116px]' : 'w-[92px]') : mine ? 'w-[68px]' : 'w-[44px]'}`} aria-hidden />
        <span className="absolute right-2 bottom-1.5">{meta}</span>
      </>
    );
  }

  return (
    <div
      className={`relative max-w-[82%] ${preview ? 'w-[300px]' : ''} ${message.kind === 'image' && !message.deleted ? 'w-[268px]' : ''} ${message.failed ? 'cursor-pointer' : ''} ${message.reactions.length ? 'mb-[18px]' : ''}`}
      onClick={message.failed ? () => onRetry(message) : undefined}
    >
      {first && !emoji && (
        <svg
          viewBox="0 0 8 13"
          className={`absolute top-0 h-[13px] w-2 ${mine ? '-right-2 text-[#005c4b]' : '-left-2 -scale-x-100 text-[#202c33]'}`}
          aria-hidden
        >
          <path d="M0 0h8L1.5 9.5A2 2 0 0 1 0 10.3z" fill="currentColor" />
        </svg>
      )}
      {emoji ? (
        <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
          <p className="text-[40px] leading-tight">{message.body}</p>
          <span className="rounded-full bg-[#0b141a]/70 px-2 py-1">{meta}</span>
        </div>
      ) : (
        <div
          className={`relative ${message.kind === 'image' && !message.deleted ? 'p-1' : 'px-2 pt-1.5 pb-2'} text-[14.5px] leading-[1.35] text-[#e9edef] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
            mine ? 'bg-[#005c4b]' : 'bg-[#202c33]'
          } ${first ? (mine ? 'rounded-lg rounded-tr-none' : 'rounded-lg rounded-tl-none') : 'rounded-lg'} ${message.pending ? 'opacity-80' : ''} ${
            message.kind === 'voice' && !message.deleted ? 'pb-4' : ''
          }`}
        >
          {showSender && (
            <span className={`block truncate text-[13px] font-medium ${message.kind === 'image' && !message.deleted ? 'px-1 pb-1' : ''}`} style={{ color: colorFor(message.from) }}>
              {message.from}
            </span>
          )}
          {message.forwarded && !message.deleted && (
            <span className="mb-0.5 flex items-center gap-1 text-[12px] text-[#8696a0] italic">
              <Icon.Forward size={14} />
              Transféré
            </span>
          )}
          {message.replyTo && !message.deleted && (
            <QuoteBlock quote={message.replyTo} me={me} onClick={() => onQuoteClick(message.replyTo!.id)} />
          )}
          {content}
        </div>
      )}
      <ReactionPills message={message} me={me} onOpen={() => onReactionsOpen(message)} />
      {message.failed && <p className="mt-0.5 text-right text-[11px] text-[#f15c6d]">Non envoyé · touche pour réessayer</p>}
    </div>
  );
}

/** Photos sent by the same person within this time of each other make one album. */
const ALBUM_GAP_MS = 60_000;

function albumable(message: ThreadItem) {
  return message.kind === 'image' && !message.deleted && !message.failed && !parseChatImage(message.body)?.caption;
}

/** The thread cut into what is drawn: single messages, and runs of photos sent together. */
function threadUnits(messages: ThreadItem[]): ThreadItem[][] {
  const units: ThreadItem[][] = [];
  for (const message of messages) {
    const unit = units[units.length - 1];
    const last = unit?.[unit.length - 1];
    const joins =
      !!last &&
      albumable(message) &&
      albumable(last) &&
      message.from === last.from &&
      message.mine === last.mine &&
      !message.replyTo &&
      !!message.forwarded === !!last.forwarded &&
      message.createdAt - last.createdAt <= ALBUM_GAP_MS &&
      sameDay(last.createdAt, message.createdAt);
    if (joins) unit.push(message);
    else units.push([message]);
  }
  return units;
}

/** Several photos in one bubble; each stays a message of its own, selected by a long press. */
function AlbumBubble({
  photos,
  me,
  first,
  showSender,
  selectedId,
  highlighted,
  onSelect,
  onQuoteClick,
  onReactionsOpen,
}: {
  photos: ThreadItem[];
  me: string;
  first: boolean;
  showSender: boolean;
  selectedId: number | null;
  highlighted: number | null;
  onSelect: (id: number) => void;
  onQuoteClick: (id: number) => void;
  onReactionsOpen: (message: ThreadItem) => void;
}) {
  const head = photos[0];
  const last = photos[photos.length - 1];
  const mine = head.mine;
  const meta = (
    <span className="flex items-center gap-1 text-[11px] leading-none whitespace-nowrap text-[#ffffff99]">
      {formatTime(last.createdAt)}
      {mine && <Ticks state={tickState(last)} />}
    </span>
  );
  return (
    <div className={`relative flex ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : 'mt-0.5'} px-2 py-px`}>
      <div className="relative max-w-[82%]">
        {first && (
          <svg
            viewBox="0 0 8 13"
            className={`absolute top-0 h-[13px] w-2 ${mine ? '-right-2 text-[#005c4b]' : '-left-2 -scale-x-100 text-[#202c33]'}`}
            aria-hidden
          >
            <path d="M0 0h8L1.5 9.5A2 2 0 0 1 0 10.3z" fill="currentColor" />
          </svg>
        )}
        <div
          className={`relative p-1 text-[14.5px] leading-[1.35] text-[#e9edef] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${mine ? 'bg-[#005c4b]' : 'bg-[#202c33]'} ${
            first ? (mine ? 'rounded-lg rounded-tr-none' : 'rounded-lg rounded-tl-none') : 'rounded-lg'
          } ${photos.some((p) => p.pending) ? 'opacity-80' : ''}`}
        >
          {showSender && (
            <span className="block truncate px-1 pb-1 text-[13px] font-medium" style={{ color: colorFor(head.from) }}>
              {head.from}
            </span>
          )}
          {head.forwarded && (
            <span className="mb-0.5 flex items-center gap-1 px-1 text-[12px] text-[#8696a0] italic">
              <Icon.Forward size={14} />
              Transféré
            </span>
          )}
          {head.replyTo && <QuoteBlock quote={head.replyTo} me={me} onClick={() => onQuoteClick(head.replyTo!.id)} />}
          <PhotoAlbum
            photos={photos.map((p) => ({
              id: p.id,
              body: p.body,
              localUrl: p.localUrl,
              createdAt: p.createdAt,
              selected: selectedId === p.id,
              highlighted: highlighted === p.id,
              reactions: p.reactions.map((r) => r.emoji),
            }))}
            sender={mine ? 'Toi' : head.from}
            meta={meta}
            selecting={selectedId !== null}
            onSelect={onSelect}
            onReactions={(id) => {
              const message = photos.find((p) => p.id === id);
              if (message) onReactionsOpen(message);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Long-press to select a message, swipe it right to reply. */
function MessageRow({
  message,
  first,
  selected,
  highlighted,
  selecting,
  onSelect,
  onReply,
  children,
}: {
  message: ThreadItem;
  first: boolean;
  selected: boolean;
  highlighted: boolean;
  selecting: boolean;
  onSelect: () => void;
  onReply: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swiping = useRef(false);
  const longPressed = useRef(false);
  const [dx, setDx] = useState(0);
  const interactive = message.id > 0;
  const canReply = interactive && !message.deleted;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY };
    longPressed.current = false;
    swiping.current = false;
    clear();
    timer.current = setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(15);
      onSelect();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) clear();
    if (!swiping.current && canReply && !selecting && mx > 14 && Math.abs(mx) > Math.abs(my) * 1.6) swiping.current = true;
    if (swiping.current) {
      const next = Math.max(0, Math.min(84, mx * 0.7));
      if (dx < SWIPE_REPLY_PX && next >= SWIPE_REPLY_PX) navigator.vibrate?.(10);
      setDx(next);
    }
  };

  const onPointerEnd = () => {
    clear();
    if (swiping.current && dx >= SWIPE_REPLY_PX) onReply();
    swiping.current = false;
    start.current = null;
    setDx(0);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`relative flex ${message.mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : 'mt-0.5'} touch-pan-y px-2 py-px transition-colors duration-500 select-none [-webkit-touch-callout:none] ${
        selected ? 'bg-[#00a884]/20' : highlighted ? 'bg-[#53bdeb]/15' : ''
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onContextMenu={(e) => {
        if (!interactive) return;
        e.preventDefault();
        // Android fires contextmenu during a touch long-press too: select once, never toggle back.
        if (longPressed.current) return;
        if (timer.current) {
          clear();
          longPressed.current = true;
          navigator.vibrate?.(15);
        }
        onSelect();
      }}
      onClickCapture={(e) => {
        if (longPressed.current) {
          longPressed.current = false;
          e.stopPropagation();
          e.preventDefault();
        } else if (selecting && interactive) {
          e.stopPropagation();
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {dx > 0 && (
        <span
          className="absolute top-1/2 left-3 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-[#202c33] text-[#e9edef]"
          style={{ opacity: Math.min(1, dx / SWIPE_REPLY_PX), transform: `translateY(-50%) scale(${dx >= SWIPE_REPLY_PX ? 1 : 0.8})` }}
        >
          <Icon.Reply size={18} />
        </span>
      )}
      <div
        className={`flex w-full ${message.mine ? 'justify-end' : 'justify-start'} ${dx ? '' : 'transition-transform duration-200'}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The part of the screen left visible by the on-screen keyboard. iOS Safari ignores
 * `interactive-widget=resizes-content` and pans the page instead of shrinking it.
 */
function useVisibleViewport() {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.overflow = overflow;
    };
  }, []);
  return box;
}

function SystemLine({ message, me }: { message: ThreadItem; me: string }) {
  const event = parseGroupEvent(message.body);
  if (!event) return null;
  return (
    <p className="mx-auto my-2 w-fit max-w-[85%] rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[12.5px] leading-snug text-[#8696a0] shadow">
      {describeGroupEvent(event, me)}
    </p>
  );
}

function TypingBubble({ names }: { names?: string[] }) {
  return (
    <div className="mt-2 flex px-2">
      <div className="relative rounded-lg rounded-tl-none bg-[#202c33] px-3.5 py-3">
        {names && names.length > 0 && (
          <span className="mb-1 block text-[12.5px] font-medium" style={{ color: colorFor(names[0]) }}>
            {names.join(', ')}
          </span>
        )}
        <svg viewBox="0 0 8 13" className="absolute top-0 -left-2 h-[13px] w-2 -scale-x-100 text-[#202c33]" aria-hidden>
          <path d="M0 0h8L1.5 9.5A2 2 0 0 1 0 10.3z" fill="currentColor" />
        </svg>
        <span className="flex gap-1" aria-label="En train d’écrire">
          {[0, 1, 2].map((i) => (
            <span key={i} className="typing-dot size-2 rounded-full bg-[#8696a0]" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

const REPORT_REASONS = ['Insultes ou harcèlement', 'Contenu choquant ou inapproprié', 'Arnaque ou spam', 'Autre raison'];

function HeaderAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-11 place-items-center rounded-full text-[#e9edef] active:bg-white/10">
      {children}
    </button>
  );
}

function SheetOption({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium active:bg-white/5 ${danger ? 'text-[#f15c6d]' : 'text-[#00a884]'}`}
    >
      {children}
    </button>
  );
}

export function ChatThread({
  me,
  friend,
  group,
  forwardTargets,
  level,
  online,
  typers,
  connected,
  messages,
  loading,
  onBack,
  onSend,
  onSendVoice,
  onSendImages,
  onRetry,
  onTyping,
  onReact,
  onDelete,
  onEdit,
  onForward,
  onReport,
  onOpenGroupInfo,
}: {
  me: string;
  /** Friend's username, or the group's key. */
  friend: string;
  group: GroupView | null;
  /** Friends and groups a message can be forwarded to. */
  forwardTargets: { key: string; name: string; group: boolean }[];
  level: number | null;
  online: boolean;
  /** Who is typing in this conversation. */
  typers: string[];
  connected: boolean;
  messages: ThreadItem[];
  loading: boolean;
  onBack: () => void;
  onSend: (body: string, replyTo: ChatReplyPreview | null) => void;
  onSendVoice: (recording: Recording, replyTo: ChatReplyPreview | null) => void;
  /** Sent in this order; the reply, if any, goes with the first photo. */
  onSendImages: (photos: OutgoingPhoto[], replyTo: ChatReplyPreview | null) => void;
  onRetry: (message: ThreadItem) => void;
  onTyping: () => void;
  onReact: (id: number, emoji: string | null) => Promise<void>;
  onDelete: (id: number, forAll: boolean) => Promise<void>;
  onEdit: (id: number, body: string) => Promise<void>;
  onForward: (id: number, to: string[]) => Promise<void>;
  onReport: (id: number, reason: string) => Promise<void>;
  onOpenGroupInfo: () => void;
}) {
  const typing = typers.length > 0;
  const title = group?.name ?? friend;
  const amAdmin = !!group?.members.some((m) => m.username === me && m.admin);
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<ChatReplyPreview | null>(null);
  /** Own text message being corrected in the composer. */
  const [editing, setEditing] = useState<ThreadItem | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'delete' | 'forward' | 'report' | 'reactions' | 'more-reactions' | null>(null);
  const [sheetMessageId, setSheetMessageId] = useState<number | null>(null);
  const [forwardTo, setForwardTo] = useState<string[]>([]);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const seenCount = useRef(0);
  const micStart = useRef<{ x: number; y: number } | null>(null);
  const pressedAt = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewport = useVisibleViewport();
  const atBottomRef = useRef(true);
  atBottomRef.current = atBottom;
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => setVoiceSupported(canRecordVoice()), []);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PreparedImage[] | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);

  const pickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length > MAX_PHOTOS) flash(`${MAX_PHOTOS} photos maximum par envoi : les premières sont gardées.`);
    setPreparingPhoto(true);
    try {
      const prepared: PreparedImage[] = [];
      for (const file of Array.from(files).slice(0, MAX_PHOTOS)) prepared.push(await prepareImage(file));
      setPhotos(prepared);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Photo impossible à ouvrir.');
    } finally {
      setPreparingPhoto(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  };

  const sendPhotos = (list: OutgoingPhoto[]) => {
    onSendImages(list, replyTo);
    setReplyTo(null);
    setPhotos(null);
  };

  const units = useMemo(() => threadUnits(messages), [messages]);
  const selected = selectedId === null ? null : (messages.find((m) => m.id === selectedId) ?? null);
  const sheetMessage = sheetMessageId === null ? null : (messages.find((m) => m.id === sheetMessageId) ?? null);
  const myReaction = selected?.reactions.find((r) => r.from === me)?.emoji ?? null;

  const flash = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const sendRecording = (recording: Recording) => {
    onSendVoice(recording, replyTo);
    setReplyTo(null);
    setLocked(false);
  };
  const recorder = useVoiceRecorder(sendRecording);
  const recording = recorder.state !== 'idle';

  useEffect(() => {
    if (selectedId !== null && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom(false);
  }, [viewport?.height]);

  const scrollToBottom = (smooth: boolean) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    if (!loading) scrollToBottom(false);
  }, [loading]);

  useLayoutEffect(() => {
    const initial = seenCount.current === 0;
    const added = messages.length - seenCount.current;
    seenCount.current = messages.length;
    if (added <= 0) return;
    // Opening a conversation lands on the latest message at once: a smooth scroll from the top
    // would report "not at the bottom" on its way down and stop following the content.
    if (initial) {
      atBottomRef.current = true;
      setAtBottom(true);
      scrollToBottom(false);
      return;
    }
    const last = messages[messages.length - 1];
    if (atBottom || last?.mine) scrollToBottom(true);
    else setUnseen((n) => n + added);
  }, [messages]);

  // Voice notes, link previews and images take their size after the first render: stay at the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [messages, loading]);

  useEffect(() => {
    if (typing && atBottom) scrollToBottom(true);
  }, [typing, atBottom]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
    setAtBottom(near);
    if (near) setUnseen(0);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (editing) {
      const id = editing.id;
      setEditing(null);
      setText('');
      setEmojiOpen(false);
      if (body !== editing.body) void run(() => onEdit(id, body));
      return;
    }
    onSend(body, replyTo);
    setText('');
    setReplyTo(null);
    setEmojiOpen(false);
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const startEdit = (message: ThreadItem) => {
    setEditing(message);
    setReplyTo(null);
    setText(message.body);
    setSelectedId(null);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setText('');
  };

  const startReply = (message: ThreadItem) => {
    if (editing) cancelEdit();
    setReplyTo(quoteOf(message));
    setSelectedId(null);
    input.current?.focus();
  };

  const jumpTo = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      flash('Ce message n’est plus affiché.');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(id);
    setTimeout(() => setHighlighted((h) => (h === id ? null : h)), 1400);
  };

  const run = async (action: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await action();
      if (done) flash(done);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const react = (emoji: string) => {
    if (!selected) return;
    const id = selected.id;
    setSelectedId(null);
    setSheet(null);
    void run(() => onReact(id, myReaction === emoji ? null : emoji));
  };

  const copy = async () => {
    if (!selected) return;
    setSelectedId(null);
    try {
      await navigator.clipboard.writeText(selected.body);
      flash('Message copié');
    } catch {
      flash('Copie impossible');
    }
  };

  const share = async () => {
    if (!selected) return;
    const message = selected;
    setSelectedId(null);
    try {
      if (message.kind === 'voice') {
        const blob = message.localBlob ?? (await voiceBlob(message.id));
        const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `message-vocal-${message.id}.${ext}`, { type: blob.type });
        if (!navigator.canShare?.({ files: [file] })) {
          flash('Partage de vocaux indisponible sur cet appareil');
          return;
        }
        await navigator.share({ files: [file], title: 'Message vocal' });
      } else if (message.kind === 'image') {
        const blob = message.localBlob ?? (await mediaBlob(message.id));
        const file = new File([blob], `luchat-photo-${message.id}.jpg`, { type: blob.type || 'image/jpeg' });
        if (!navigator.canShare?.({ files: [file] })) {
          flash('Partage de photos indisponible sur cet appareil');
          return;
        }
        await navigator.share({ files: [file] });
      } else if (navigator.share) {
        await navigator.share({ text: message.body });
      } else {
        await navigator.clipboard.writeText(message.body);
        flash('Message copié, colle-le où tu veux');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      flash('Partage impossible');
    }
  };

  const openSheet = (kind: 'delete' | 'forward' | 'report' | 'more-reactions', message: ThreadItem) => {
    setSheetMessageId(message.id);
    setSheet(kind);
    if (kind === 'forward') setForwardTo([]);
    if (kind !== 'more-reactions') setSelectedId(null);
  };

  const closeSheet = () => {
    setSheet(null);
    setSelectedId(null);
  };

  const onMicDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    micStart.current = { x: e.clientX, y: e.clientY };
    pressedAt.current = Date.now();
    setDrag({ x: 0, y: 0 });
    setEmojiOpen(false);
    recorder.start().catch((err: Error) => {
      micStart.current = null;
      flash(err.message);
    });
  };

  const onMicMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!micStart.current || locked) return;
    const x = Math.min(0, e.clientX - micStart.current.x);
    const y = Math.min(0, e.clientY - micStart.current.y);
    if (x < -CANCEL_RECORDING_PX) {
      micStart.current = null;
      setDrag({ x: 0, y: 0 });
      navigator.vibrate?.([20, 40, 20]);
      void recorder.stop(false);
    } else if (y < -LOCK_RECORDING_PX) {
      micStart.current = null;
      setDrag({ x: 0, y: 0 });
      navigator.vibrate?.(20);
      setLocked(true);
    } else {
      setDrag(Math.abs(x) > Math.abs(y) ? { x, y: 0 } : { x: 0, y });
    }
  };

  const onMicUp = () => {
    if (!micStart.current) return;
    micStart.current = null;
    setDrag({ x: 0, y: 0 });
    if (Date.now() - pressedAt.current < 350) {
      void recorder.stop(false);
      flash('Maintiens pour enregistrer, relâche pour envoyer');
      return;
    }
    void recorder.stop(true).then((rec) => rec && sendRecording(rec));
  };

  const cancelLocked = () => {
    setLocked(false);
    void recorder.stop(false);
  };

  const sendLocked = () => {
    void recorder.stop(true).then((rec) => {
      setLocked(false);
      if (rec) sendRecording(rec);
    });
  };

  const status = !connected
    ? 'connexion…'
    : group
      ? typing
        ? `${typers.join(', ')} écrit…`
        : group.members.map((m) => (m.username === me ? 'Toi' : m.username)).join(', ')
      : typing
        ? 'écrit…'
        : online
          ? 'en ligne'
          : level
            ? `niveau ${level}`
            : '';
  const levels = recorder.levels.length ? recorder.levels : [0];

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex h-dvh justify-center bg-[#0b141a]"
      style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
    >
      <section className="relative flex h-full w-full max-w-md flex-col">
        {selected ? (
          <header className="flex items-center gap-1 bg-[#1f2c33] px-1 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
            <HeaderAction label="Annuler la sélection" onClick={() => setSelectedId(null)}>
              <Icon.Close size={24} />
            </HeaderAction>
            <span className="flex-1 pl-2 text-[18px] font-medium">1</span>
            {!selected.deleted && (
              <HeaderAction label="Répondre" onClick={() => startReply(selected)}>
                <Icon.Reply size={23} />
              </HeaderAction>
            )}
            {canEditMessage(selected, Date.now()) && (
              <HeaderAction label="Modifier" onClick={() => startEdit(selected)}>
                <Icon.Edit size={21} />
              </HeaderAction>
            )}
            {!selected.deleted && selected.kind === 'text' && (
              <HeaderAction label="Copier" onClick={copy}>
                <Icon.Copy size={21} />
              </HeaderAction>
            )}
            {!selected.deleted && selected.kind !== 'invite' && (
              <HeaderAction label="Transférer" onClick={() => openSheet('forward', selected)}>
                <Icon.Forward size={23} />
              </HeaderAction>
            )}
            {!selected.deleted && selected.kind !== 'invite' && (
              <HeaderAction label="Partager" onClick={share}>
                <Icon.Share size={21} />
              </HeaderAction>
            )}
            {!selected.mine && !selected.deleted && (
              <HeaderAction label="Signaler" onClick={() => openSheet('report', selected)}>
                <Icon.Flag size={21} />
              </HeaderAction>
            )}
            <HeaderAction label="Supprimer" onClick={() => openSheet('delete', selected)}>
              <Icon.Delete size={22} />
            </HeaderAction>
          </header>
        ) : (
          <header className="flex items-center gap-1 bg-[#1f2c33] px-1 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
            <BackButton onClick={onBack} label="Retour aux discussions" compact />
            {group ? (
              <button type="button" onClick={onOpenGroupInfo} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-label="Infos du groupe">
                <Avatar name={title} group size={38} />
                <span className="min-w-0 flex-1 pl-1.5">
                  <h2 className="truncate text-[16.5px] leading-tight font-medium">{title}</h2>
                  <p className={`truncate text-[12.5px] leading-tight ${typing ? 'text-[#25d366]' : 'text-[#8696a0]'}`}>{status}</p>
                </span>
              </button>
            ) : (
              <>
                <Avatar name={friend} size={38} />
                <div className="min-w-0 flex-1 pl-1.5">
                  <h2 className="truncate text-[16.5px] leading-tight font-medium">{friend}</h2>
                  <p className={`truncate text-[12.5px] leading-tight ${typing ? 'text-[#25d366]' : 'text-[#8696a0]'}`}>{status}</p>
                </div>
              </>
            )}
            {!group && (
            <button
              type="button"
              onClick={() => setChallengeOpen(true)}
              className="grid size-10 place-items-center rounded-full text-[#e9edef] active:bg-white/10"
              aria-label={`Défier ${friend}`}
              title="Défier à une partie"
            >
              <Icon.Dice size={22} />
            </button>
            )}
          </header>
        )}

        {selected && !selected.deleted && (
          <div className="pop-in absolute inset-x-0 top-[calc(3.6rem+env(safe-area-inset-top))] z-20 flex justify-center px-3">
            <div className="flex items-center gap-0.5 rounded-full bg-[#233138] px-1.5 py-1 shadow-xl ring-1 ring-black/20">
              {CHAT_QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(emoji)}
                  className={`grid size-10 place-items-center rounded-full text-[25px] transition active:scale-125 ${myReaction === emoji ? 'bg-white/15' : ''}`}
                  aria-label={`Réagir ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => openSheet('more-reactions', selected)}
                className="grid size-9 place-items-center rounded-full bg-white/10 text-[#8696a0]"
                aria-label="Plus de réactions"
              >
                <Icon.Add size={22} />
              </button>
            </div>
          </div>
        )}

        <div
          ref={scroller}
          onScroll={onScroll}
          onClick={(e) => {
            if (selected && e.target === e.currentTarget) setSelectedId(null);
          }}
          className="chat-wallpaper relative flex-1 overflow-y-auto overscroll-contain pb-2"
        >
          {loading ? (
            <p className="mx-auto mt-6 w-fit rounded-lg bg-[#182229] px-3 py-1.5 text-[12.5px] text-[#8696a0]">Chargement…</p>
          ) : (
            <>
              <p className="mx-auto mt-3 mb-1 flex max-w-[85%] items-center gap-1.5 rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[12px] leading-snug text-[#ffd279]">
                <Icon.Lock size={13} className="shrink-0" />
                {group ? 'Groupe entre amis LuChat. Sois fair-play.' : 'Discussion privée entre amis LuChat. Sois fair-play.'}
              </p>
              {messages.length === 0 && (
                <div className="mx-auto mt-10 flex w-fit flex-col items-center gap-3 rounded-2xl bg-[#182229] px-6 py-5 text-center">
                  <Avatar name={friend} size={64} online={online} />
                  <p className="text-sm text-[#e9edef]">Dis bonjour à {friend}</p>
                  <button
                    type="button"
                    onClick={() => onSend('Salut 👋 On fait une partie ?', null)}
                    className="rounded-full bg-[#00a884] px-4 py-2 text-sm font-medium text-[#0b141a] active:opacity-80"
                  >
                    Salut, une partie ?
                  </button>
                </div>
              )}
              {units.map((unit, i) => {
                const message = unit[0];
                const prevUnit = units[i - 1];
                const prev = prevUnit?.[prevUnit.length - 1];
                const newDay = !prev || !sameDay(prev.createdAt, message.createdAt);
                const first = newDay || prev.mine !== message.mine || prev.kind === 'system' || (!!group && prev.from !== message.from);
                const next = units[i + 1]?.[0];
                const nextVoiceId = message.kind === 'voice' && next?.kind === 'voice' && !next.deleted && next.id > 0 ? next.id : undefined;
                return (
                  <Fragment key={message.id}>
                    {newDay && (
                      <p className="sticky top-2 z-10 mx-auto mt-3 w-fit rounded-lg bg-[#182229] px-3 py-1 text-[12px] text-[#8696a0] shadow">
                        {dayLabel(message.createdAt)}
                      </p>
                    )}
                    {unit.length > 1 ? (
                      <AlbumBubble
                        photos={unit}
                        me={me}
                        first={first}
                        showSender={!!group && first && !message.mine}
                        selectedId={selectedId}
                        highlighted={highlighted}
                        onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
                        onQuoteClick={jumpTo}
                        onReactionsOpen={(m) => {
                          setSheetMessageId(m.id);
                          setSheet('reactions');
                        }}
                      />
                    ) : message.kind === 'system' ? (
                      <SystemLine message={message} me={me} />
                    ) : (
                    <MessageRow
                      message={message}
                      first={first}
                      selected={selectedId === message.id}
                      highlighted={highlighted === message.id}
                      selecting={selectedId !== null}
                      onSelect={() => setSelectedId((id) => (id === message.id ? null : message.id))}
                      onReply={() => startReply(message)}
                    >
                      <Bubble
                        message={message}
                        me={me}
                        first={first}
                        showSender={!!group && first && !message.mine}
                        onRetry={onRetry}
                        onQuoteClick={jumpTo}
                        nextVoiceId={nextVoiceId}
                        onReactionsOpen={(m) => {
                          setSheetMessageId(m.id);
                          setSheet('reactions');
                        }}
                      />
                    </MessageRow>
                    )}
                  </Fragment>
                );
              })}
              {typing && <TypingBubble names={group ? typers : undefined} />}
            </>
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="pop-in absolute right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 grid size-10 place-items-center rounded-full bg-[#202c33] text-[#8696a0] shadow-lg"
            aria-label="Aller aux derniers messages"
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unseen > 0 && (
              <span className="absolute -top-1.5 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#25d366] px-1 text-[11px] font-semibold text-[#0b141a]">
                {unseen}
              </span>
            )}
          </button>
        )}

        {toast && (
          <p className="pop-in pointer-events-none absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto w-fit max-w-[85%] rounded-full bg-[#e9edef] px-4 py-2 text-center text-[13.5px] font-medium text-[#0b141a] shadow-lg">
            {toast}
          </p>
        )}

        {emojiOpen && !recording && (
          <div className="grid grid-cols-9 gap-1 bg-[#1f2c33] px-2 pt-2">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setText((t) => (t + emoji).slice(0, MAX_LENGTH))}
                className="grid aspect-square place-items-center rounded-lg text-2xl active:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {locked && recording ? (
          <div className="flex flex-col gap-2 bg-[#1f2c33] px-3 pt-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
            {recorder.state === 'paused' ? (
              <RecordingPreview key={recorder.elapsed} blob={recorder.preview()} durationMs={recorder.elapsed} levels={levels} />
            ) : (
              <div className="flex items-center gap-3">
                <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-[#f15c6d]" />
                <span className="w-11 shrink-0 text-[15px] text-[#e9edef] tabular-nums">{formatVoiceDuration(recorder.elapsed)}</span>
                <span className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
                  {levels.map((l, i) => (
                    <span key={i} className="w-[3px] shrink-0 rounded-full bg-[#8696a0]" style={{ height: `${Math.max(12, l * 100)}%` }} />
                  ))}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button type="button" onClick={cancelLocked} aria-label="Supprimer l’enregistrement" className="grid size-12 place-items-center rounded-full text-[#8696a0] active:bg-white/10">
                <Icon.Delete size={26} />
              </button>
              {recorder.state === 'paused' ? (
                <button
                  type="button"
                  onClick={recorder.resume}
                  disabled={recorder.elapsed >= MAX_VOICE_MS}
                  aria-label="Reprendre l’enregistrement"
                  className="grid size-12 place-items-center rounded-full text-[#f15c6d] active:bg-white/10 disabled:opacity-40"
                >
                  <Icon.Mic size={28} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={recorder.pause}
                  disabled={recorder.state !== 'recording'}
                  aria-label="Mettre l’enregistrement en pause"
                  className="grid size-12 place-items-center rounded-full border-2 border-[#f15c6d] text-[#f15c6d] active:bg-white/10"
                >
                  <Icon.Pause size={24} />
                </button>
              )}
              <button type="button" onClick={sendLocked} aria-label="Envoyer le message vocal" className="grid size-12 place-items-center rounded-full bg-[#00a884] text-[#0b141a] active:scale-95">
                <Icon.Send size={24} className="translate-x-px" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="relative flex items-end gap-1.5 px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
            {recording ? (
              <div className="flex h-12 min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[24px] bg-[#2a3942] px-4">
                <Icon.Mic size={22} className="shrink-0 animate-pulse text-[#f15c6d]" />
                <span className="w-10 shrink-0 text-[15px] text-[#e9edef] tabular-nums">{formatVoiceDuration(recorder.elapsed)}</span>
                <span
                  className="flex min-w-0 flex-1 items-center justify-center gap-1 text-[14px] whitespace-nowrap text-[#8696a0]"
                  style={{ transform: `translateX(${drag.x * 0.6}px)`, opacity: 1 + drag.x / CANCEL_RECORDING_PX }}
                >
                  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                    <path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Glisse pour annuler
                </span>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col rounded-[24px] bg-[#2a3942]">
                {editing && (
                  <div className="flex items-start gap-1 p-1.5 pb-0">
                    <span className="min-w-0 flex-1 rounded-md border-l-4 border-[#00a884] bg-[#1d282f] px-2.5 py-1.5">
                      <span className="flex items-center gap-1 text-[12.5px] font-medium text-[#00a884]">
                        <Icon.Edit size={14} />
                        Modifier le message
                      </span>
                      <span className="block truncate text-[13px] text-[#aebac1]">{editing.body}</span>
                    </span>
                    <button type="button" onClick={cancelEdit} aria-label="Annuler la modification" className="grid size-8 shrink-0 place-items-center text-[#8696a0]">
                      <Icon.Close size={18} />
                    </button>
                  </div>
                )}
                {replyTo && (
                  <div className="flex items-start gap-1 p-1.5 pb-0">
                    <QuoteBlock quote={replyTo} me={me} compact onClick={() => jumpTo(replyTo.id)} />
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse" className="grid size-8 shrink-0 place-items-center text-[#8696a0]">
                      <Icon.Close size={18} />
                    </button>
                  </div>
                )}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    className={`grid size-11 shrink-0 place-items-center ${emojiOpen ? 'text-[#00a884]' : 'text-[#8696a0]'}`}
                    aria-label="Émojis"
                    aria-pressed={emojiOpen}
                  >
                    <Icon.Mood size={24} />
                  </button>
                  <textarea
                    ref={input}
                    rows={1}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (e.target.value.trim() && !editing) onTyping();
                    }}
                    onKeyDown={onKeyDown}
                    maxLength={MAX_LENGTH}
                    placeholder="Message"
                    className={`max-h-[132px] min-w-0 flex-1 resize-none bg-transparent py-[11px] text-[16px] leading-[1.35] text-[#e9edef] outline-none placeholder:text-[#8696a0] ${text ? 'pr-4' : 'pr-1'}`}
                  />
                  {!text && (
                    <button
                      type="button"
                      onClick={() => photoInput.current?.click()}
                      disabled={preparingPhoto}
                      className="grid size-11 shrink-0 place-items-center text-[#8696a0] disabled:opacity-50"
                      aria-label="Envoyer une photo"
                    >
                      {preparingPhoto ? (
                        <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-[#8696a0]" />
                      ) : (
                        <Icon.Camera size={23} />
                      )}
                    </button>
                  )}
                  <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => void pickPhotos(e.target.files)} />
                </div>
              </div>
            )}
            {text.trim() && !recording ? (
              <button
                type="submit"
                aria-label={editing ? 'Enregistrer la modification' : 'Envoyer'}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a] active:scale-95"
              >
                {editing ? <Icon.Check size={26} /> : <Icon.Send size={24} className="translate-x-px" />}
              </button>
            ) : voiceSupported ? (
              <div className="relative size-12 shrink-0">
                {recording && (
                  <span
                    className="absolute bottom-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full bg-[#2a3942] px-2 py-2.5 text-[#8696a0] shadow-lg"
                    style={{ transform: `translate(-50%, ${drag.y * 0.5}px)` }}
                  >
                    <Icon.Lock2 size={18} />
                    <Icon.ChevronUp size={18} className="animate-bounce" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Maintenir pour enregistrer un message vocal"
                  onPointerDown={onMicDown}
                  onPointerMove={onMicMove}
                  onPointerUp={onMicUp}
                  onPointerCancel={onMicUp}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`grid size-12 touch-none place-items-center rounded-full bg-[#00a884] text-[#0b141a] transition-transform select-none [-webkit-touch-callout:none] ${
                    recording ? 'scale-[1.6] shadow-[0_0_0_10px_rgba(0,168,132,0.18)]' : 'active:scale-95'
                  }`}
                  style={recording ? { transform: `translate(${drag.x}px, ${drag.y}px) scale(1.6)` } : undefined}
                >
                  <Icon.Mic size={24} />
                </button>
              </div>
            ) : group ? (
              <button type="submit" disabled aria-label="Envoyer" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a] opacity-50">
                <Icon.Send size={24} className="translate-x-px" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setChallengeOpen(true)}
                aria-label={`Défier ${friend}`}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a] active:scale-95"
              >
                <Icon.Dice size={24} />
              </button>
            )}
          </form>
        )}

        {!group && <ChallengeSheet open={challengeOpen} friend={friend} me={me} onClose={() => setChallengeOpen(false)} />}

        {photos && <PhotoComposer images={photos} friend={title} onSend={sendPhotos} onCancel={() => setPhotos(null)} />}

        <Sheet open={sheet === 'delete' && !!sheetMessage} title="Supprimer le message ?" onClose={closeSheet}>
          {sheetMessage && (
            <div className="flex flex-col gap-1 pb-1">
              {(sheetMessage.mine || amAdmin) && !sheetMessage.deleted && (
                <SheetOption
                  danger
                  onClick={() => {
                    setSheet(null);
                    void run(() => onDelete(sheetMessage.id, true));
                  }}
                >
                  <Icon.Delete size={22} />
                  Supprimer pour tout le monde
                </SheetOption>
              )}
              <SheetOption
                onClick={() => {
                  setSheet(null);
                  void run(() => onDelete(sheetMessage.id, false), 'Message supprimé pour toi');
                }}
              >
                <Icon.Delete size={22} />
                Supprimer pour moi
              </SheetOption>
              <SheetOption onClick={closeSheet}>
                <Icon.Close size={22} />
                Annuler
              </SheetOption>
            </div>
          )}
        </Sheet>

        <Sheet open={sheet === 'report' && !!sheetMessage} title="Signaler ce message" onClose={closeSheet}>
          {sheetMessage && (
            <div className="flex flex-col gap-1 pb-1">
              <p className="pb-2 text-[13px] leading-relaxed text-[#8696a0]">
                L’équipe LuChat pourra lire ce message et ceux qui l’entourent. {sheetMessage.from} ne saura pas que tu l’as signalé.
              </p>
              {REPORT_REASONS.map((reason) => (
                <SheetOption
                  key={reason}
                  danger
                  onClick={() => {
                    setSheet(null);
                    void run(() => onReport(sheetMessage.id, reason), 'Merci, le message a été signalé');
                  }}
                >
                  <Icon.Flag size={20} />
                  {reason}
                </SheetOption>
              ))}
              <SheetOption onClick={closeSheet}>
                <Icon.Close size={22} />
                Annuler
              </SheetOption>
            </div>
          )}
        </Sheet>

        <Sheet open={sheet === 'forward' && !!sheetMessage} title="Transférer à…" onClose={closeSheet}>
          {sheetMessage && (
            <div className="flex flex-col pb-1">
              <p className="pb-2 text-[13px] text-[#8696a0]">Jusqu’à {MAX_FORWARD_TARGETS} discussions à la fois.</p>
              <ul className="-mx-2">
                {forwardTargets.map(({ key, name, group: isGroup }) => {
                  const checked = forwardTo.includes(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() =>
                          setForwardTo((list) =>
                            checked ? list.filter((n) => n !== key) : list.length < MAX_FORWARD_TARGETS ? [...list, key] : list,
                          )
                        }
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-white/5"
                        aria-pressed={checked}
                      >
                        <Avatar name={name} group={isGroup} size={42} />
                        <span className="min-w-0 flex-1 truncate text-[15.5px] text-[#e9edef]">{name}</span>
                        <span
                          className={`grid size-6 place-items-center rounded-full border-2 ${checked ? 'border-[#00a884] bg-[#00a884] text-[#0b141a]' : 'border-[#8696a0]'}`}
                        >
                          {checked && <Icon.Check size={16} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                disabled={forwardTo.length === 0 || busy}
                onClick={() =>
                  void run(async () => {
                    await onForward(sheetMessage.id, forwardTo);
                    closeSheet();
                  }, forwardTo.length > 1 ? `Transféré à ${forwardTo.length} discussions` : `Transféré à ${forwardTargets.find((t) => t.key === forwardTo[0])?.name ?? forwardTo[0]}`)
                }
                className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:opacity-40"
              >
                <Icon.Send size={20} />
                {forwardTo.length ? `Envoyer (${forwardTo.length})` : 'Choisis des discussions'}
              </button>
            </div>
          )}
        </Sheet>

        <Sheet open={sheet === 'more-reactions' && !!selected} title="Réagir" onClose={closeSheet}>
          <div className="grid grid-cols-7 gap-1 pb-2">
            {MORE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                className={`grid aspect-square place-items-center rounded-xl text-[28px] active:bg-white/10 ${myReaction === emoji ? 'bg-white/10' : ''}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Sheet>

        <Sheet open={sheet === 'reactions' && !!sheetMessage?.reactions.length} title="Réactions" onClose={closeSheet}>
          {sheetMessage && (
            <ul className="-mx-2 pb-1">
              {sheetMessage.reactions.map((r) => {
                const isMe = r.from === me;
                return (
                  <li key={r.from}>
                    <button
                      type="button"
                      disabled={!isMe}
                      onClick={() => {
                        setSheet(null);
                        void run(() => onReact(sheetMessage.id, null));
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left enabled:active:bg-white/5"
                    >
                      <Avatar name={r.from} size={42} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] text-[#e9edef]">{isMe ? 'Toi' : r.from}</span>
                        {isMe && <span className="block text-[12.5px] text-[#8696a0]">Touche pour retirer</span>}
                      </span>
                      <span className="text-[26px]">{r.emoji}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>
      </section>
    </div>
  );
}
