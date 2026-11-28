'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_SUPPORT_TEXT, type SupportMessageView } from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { Icon } from '@/components/Icons';
import { useLang } from '@/lib/i18n';
import { prepareImage } from '@/lib/media';
import { useProfile } from '@/lib/profile';
import {
  loadSupport,
  markSupportRead,
  rememberSupportMedia,
  sendSupportText,
  setViewingSupport,
  supportMediaUrl,
  uploadSupport,
  useSupport,
} from '@/lib/support';
import { VoicePlayback, canRecordVoice, formatVoiceDuration, useVoiceRecorder, type Recording } from '@/lib/voice';

/** A message on screen: sent, or still on its way from this device. */
type Item = SupportMessageView & { pending?: 'sending' | 'failed'; localUrl?: string; retry?: () => void };

let localId = 0;

export default function SupportPage() {
  const { session, ready } = useProfile();
  const { t, locale } = useLang();
  const { latest } = useSupport();
  const [items, setItems] = useState<Item[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob; width: number; height: number; url: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const merge = useCallback((incoming: Item[]) => {
    setItems((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
      return [...byId.values()].sort((a, b) => (a.id < 0 || b.id < 0 ? a.createdAt - b.createdAt : a.id - b.id));
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) return setLoading(false);
    let cancelled = false;
    loadSupport()
      .then((view) => {
        if (cancelled) return;
        merge(view.messages);
        setMore(view.more);
        void markSupportRead();
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Assistance indisponible.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, session, merge]);

  // Replies are read as they arrive while the conversation is on screen.
  useEffect(() => {
    const update = () => setViewingSupport(document.visibilityState === 'visible');
    update();
    const onVisible = () => {
      update();
      if (document.visibilityState === 'visible') void markSupportRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      setViewingSupport(false);
    };
  }, []);

  useEffect(() => {
    if (latest) merge([latest]);
  }, [latest, merge]);

  // Keeps the newest message in view, unless the player scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const loadOlder = async () => {
    const first = items.find((m) => m.id > 0);
    if (!first) return;
    const el = list.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    stick.current = false;
    try {
      const view = await loadSupport(first.id);
      merge(view.messages);
      setMore(view.more);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Chargement impossible.');
    }
  };

  /** Shows the message at once, then replaces it with the one the server stored. */
  const sendItem = (draft: Item, send: () => Promise<SupportMessageView>) => {
    stick.current = true;
    const attempt = () => {
      merge([{ ...draft, pending: 'sending', retry: undefined }]);
      send()
        .then((message) => {
          if (draft.localUrl) rememberSupportMedia(message.id, draft.localUrl);
          setItems((prev) => prev.filter((m) => m.id !== draft.id));
          merge([{ ...message, localUrl: draft.localUrl }]);
        })
        .catch((err) => {
          setNotice(err instanceof Error ? err.message : 'Envoi impossible.');
          merge([{ ...draft, pending: 'failed', retry: attempt }]);
        });
    };
    attempt();
  };

  const draftOf = (m: Omit<Item, 'id' | 'fromStaff' | 'createdAt'>): Item => ({ id: -++localId, fromStaff: false, createdAt: Date.now(), ...m });

  const submit = () => {
    const body = text.trim().slice(0, MAX_SUPPORT_TEXT);
    if (photo) {
      const { blob, width, height, url } = photo;
      sendItem(draftOf({ kind: 'image', body, width, height, localUrl: url }), () =>
        uploadSupport(blob, { kind: 'image', width, height, caption: body }),
      );
      setPhoto(null);
      setText('');
      return;
    }
    if (!body) return;
    sendItem(draftOf({ kind: 'text', body }), () => sendSupportText(body));
    setText('');
  };

  const sendVoice = (recording: Recording) => {
    const url = URL.createObjectURL(recording.blob);
    sendItem(draftOf({ kind: 'voice', body: '', durationMs: recording.durationMs, localUrl: url }), () =>
      uploadSupport(recording.blob, { kind: 'voice', durationMs: recording.durationMs }),
    );
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await prepareImage(file));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Photo illisible.');
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayLabel = (ms: number) => {
    const day = new Date(ms).toDateString();
    if (day === new Date().toDateString()) return t('Aujourd’hui', 'Today');
    if (day === new Date(Date.now() - 86_400_000).toDateString()) return t('Hier', 'Yesterday');
    return longDay.format(ms);
  };

  return (
    <div className="flex h-dvh flex-col bg-[#0b141a] text-[#e9edef]">
      <AppBar
        title={t('Assistance', 'Support')}
        subtitle={t('L’équipe LuChat te répond ici', 'The LuChat team answers you here')}
        backHref="/reglages"
        backText={t('Réglages', 'Settings')}
        backLabel={t('Retour aux réglages', 'Back to settings')}
      />

      {ready && !session ? (
        <main className="mx-auto w-full max-w-lg px-4 pt-6">
          <section className="flex flex-col items-center gap-3 rounded-[28px] bg-[#1f2c33] p-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-[#53bdeb]/15 text-[#53bdeb]">
              <Icon.Chat size={28} />
            </span>
            <p className="text-[15px] font-medium">{t('Connecte-toi pour contacter l’assistance', 'Sign in to contact support')}</p>
            <p className="text-[13.5px] text-[#8696a0]">
              {t('Ton compte permet à l’équipe de retrouver tes parties et tes paiements.', 'Your account lets the team find your games and payments.')}
            </p>
            <Link href="/compte" className="h-11 rounded-full bg-[#00a884] px-6 text-[14.5px] leading-[44px] font-semibold text-[#0b141a]">
              {t('Se connecter', 'Sign in')}
            </Link>
          </section>
        </main>
      ) : (
        <>
          <div
            ref={list}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="mx-auto flex max-w-lg flex-col gap-1 px-3 py-3">
              {more && (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  className="mx-auto mb-2 h-9 rounded-full bg-[#1f2c33] px-4 text-[13px] font-semibold text-[#00a884]"
                >
                  {t('Messages précédents', 'Earlier messages')}
                </button>
              )}
              {!more && (
                <div className="mx-auto mb-3 max-w-[88%] rounded-2xl bg-[#1f2c33] px-4 py-3 text-center text-[13.5px] leading-snug text-[#aebac1]">
                  <p className="mb-1 font-semibold text-[#e9edef]">{t('Bonjour 👋', 'Hello 👋')}</p>
                  {t(
                    'Pose ta question ici : dépôt, retrait, compte, partie… Tu peux joindre une capture d’écran ou envoyer un message vocal. L’équipe te répond dès que possible, et tu es prévenu de sa réponse.',
                    'Ask your question here: deposit, withdrawal, account, game… You can attach a screenshot or send a voice note. The team answers as soon as possible, and you are notified of the reply.',
                  )}
                </div>
              )}
              {loading && items.length === 0 && (
                <div className="flex flex-col gap-2">
                  <div className="h-12 w-2/3 animate-pulse self-end rounded-2xl bg-[#1f2c33]" />
                  <div className="h-12 w-1/2 animate-pulse rounded-2xl bg-[#1f2c33]" />
                </div>
              )}
              {error && <p className="rounded-2xl bg-[#1f2c33] px-4 py-3 text-center text-[14px] text-[#f15c6d]">{error}</p>}
              {items.map((m, i) => {
                const day = dayLabel(m.createdAt);
                const showDay = i === 0 || dayLabel(items[i - 1].createdAt) !== day;
                return (
                  <div key={m.id} className="flex flex-col">
                    {showDay && (
                      <span className="mx-auto my-2 rounded-lg bg-[#1f2c33] px-3 py-1 text-[12px] font-medium text-[#8696a0] first-letter:uppercase">
                        {day}
                      </span>
                    )}
                    <Bubble message={m} time={time.format(m.createdAt)} staffLabel={t('Assistance LuChat', 'LuChat support')} />
                  </div>
                );
              })}
            </div>
          </div>

          {notice && (
            <p role="status" className="mx-auto mb-1 max-w-[92%] rounded-full bg-[#3b4a54] px-4 py-2 text-center text-[13px]">
              {notice}
            </p>
          )}

          <Composer
            text={text}
            setText={setText}
            photo={photo}
            clearPhoto={() => setPhoto(null)}
            onPickPhoto={() => fileInput.current?.click()}
            onSubmit={submit}
            onVoice={sendVoice}
            onError={setNotice}
            disabled={!session}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}

function Bubble({ message: m, time, staffLabel }: { message: Item; time: string; staffLabel: string }) {
  const { t } = useLang();
  const mine = !m.fromStaff;
  const meta = (
    <span className={`flex items-center gap-1 text-[11px] ${mine ? 'text-[#d1f4cc]/70' : 'text-[#8696a0]'}`}>
      {time}
      {m.pending === 'sending' && <Icon.Hourglass size={12} />}
      {mine && !m.pending && <Icon.Check size={13} />}
    </span>
  );
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${m.pending === 'sending' ? 'opacity-70' : ''}`}>
      <div
        className={`relative max-w-[82%] rounded-2xl px-2.5 py-1.5 text-[15px] leading-snug shadow ${
          mine ? 'rounded-tr-md bg-[#005c4b]' : 'rounded-tl-md bg-[#1f2c33]'
        }`}
      >
        {!mine && <p className="mb-0.5 text-[12.5px] font-semibold text-[#53bdeb]">{staffLabel}</p>}
        {m.kind === 'image' && <SupportPhoto message={m} />}
        {m.kind === 'voice' && <SupportVoice message={m} />}
        {m.body && <p className="px-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p>}
        <div className="flex justify-end pt-0.5">{meta}</div>
        {m.pending === 'failed' && (
          <button type="button" onClick={m.retry} className="mt-1 flex items-center gap-1 text-[12.5px] font-semibold text-[#f15c6d]">
            <Icon.Refresh size={14} /> {t('Échec, réessayer', 'Failed, retry')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Object URL of a message's file, or the local copy of one just sent. */
function useMediaUrl(m: Item) {
  const [url, setUrl] = useState<string | null>(m.localUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (m.localUrl) return setUrl(m.localUrl);
    if (m.id < 0) return;
    let cancelled = false;
    supportMediaUrl(m.id)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [m.id, m.localUrl]);
  return { url, failed };
}

function SupportPhoto({ message: m }: { message: Item }) {
  const { url, failed } = useMediaUrl(m);
  const [open, setOpen] = useState(false);
  const ratio = m.width && m.height ? m.width / m.height : 1;
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className="relative mb-1 block w-[min(68vw,260px)] overflow-hidden rounded-xl bg-black/30"
        style={{ aspectRatio: String(Math.min(Math.max(ratio, 0.6), 1.8)) }}
        aria-label="Photo"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[#8696a0]">
            {failed ? <Icon.Image size={28} /> : <span className="size-7 animate-spin rounded-full border-[3px] border-white/20 border-t-white/70" />}
          </span>
        )}
      </button>
      {open && url && (
        <div role="dialog" className="fixed inset-0 z-50 grid place-items-center bg-black/95" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            aria-label="Fermer"
            className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3 grid size-11 place-items-center rounded-full bg-white/10"
          >
            <Icon.Close size={24} />
          </button>
        </div>
      )}
    </>
  );
}

function SupportVoice({ message: m }: { message: Item }) {
  const { url, failed } = useMediaUrl(m);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const playback = useRef<VoicePlayback | null>(null);
  const total = (m.durationMs ?? 0) / 1000;

  useEffect(() => () => playback.current?.pause(), []);

  const toggle = () => {
    if (!url) return;
    playback.current ??= new VoicePlayback(url, {
      onTime: setPosition,
      onPlaying: setPlaying,
      onEnded: () => {
        setPlaying(false);
        setPosition(0);
      },
    });
    if (playback.current.playing) playback.current.pause();
    else void playback.current.play();
  };

  return (
    <div className="flex w-[min(62vw,240px)] items-center gap-2 py-1">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'Pause' : 'Écouter'}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-50"
      >
        {failed ? <Icon.Mic size={20} /> : playing ? <Icon.Pause size={22} /> : <Icon.Play size={22} />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#53bdeb]" style={{ width: `${total ? Math.min(100, (position / total) * 100) : 0}%` }} />
        </div>
        <span className="text-[11.5px] text-[#aebac1] tabular-nums">
          {formatVoiceDuration((playing || position ? position : total) * 1000)}
        </span>
      </div>
    </div>
  );
}

function Composer({
  text,
  setText,
  photo,
  clearPhoto,
  onPickPhoto,
  onSubmit,
  onVoice,
  onError,
  disabled,
}: {
  text: string;
  setText: (text: string) => void;
  photo: { url: string } | null;
  clearPhoto: () => void;
  onPickPhoto: () => void;
  onSubmit: () => void;
  onVoice: (recording: Recording) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const { t } = useLang();
  const recorder = useVoiceRecorder(onVoice);
  const recording = recorder.state !== 'idle';
  const [canRecord, setCanRecord] = useState(false);
  useEffect(() => setCanRecord(canRecordVoice()), []);
  const canSend = !!photo || text.trim().length > 0;

  const startVoice = () => recorder.start().catch((err) => onError(err instanceof Error ? err.message : 'Micro indisponible.'));
  const finishVoice = async () => {
    const result = await recorder.stop(true);
    if (result) onVoice(result);
  };

  return (
    <div className="bg-[#0b141a] px-2 pt-1 pb-[calc(8px+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-lg">
        {photo && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl bg-[#1f2c33] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="size-16 rounded-xl object-cover" />
            <p className="min-w-0 flex-1 text-[13.5px] text-[#aebac1]">{t('Ajoute une légende si tu veux, puis envoie.', 'Add a caption if you like, then send.')}</p>
            <button type="button" onClick={clearPhoto} aria-label={t('Retirer la photo', 'Remove photo')} className="grid size-10 place-items-center rounded-full text-[#8696a0] active:bg-white/10">
              <Icon.Close size={22} />
            </button>
          </div>
        )}
        {recording ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void recorder.stop(false)}
              aria-label={t('Annuler le vocal', 'Cancel voice note')}
              className="grid size-12 shrink-0 place-items-center rounded-full text-[#8696a0] active:bg-white/10"
            >
              <Icon.Delete size={24} />
            </button>
            <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-[#1f2c33] px-4">
              <span className={`size-2.5 rounded-full bg-[#f15c6d] ${recorder.state === 'recording' ? 'animate-pulse' : ''}`} />
              <span className="text-[15px] tabular-nums">{formatVoiceDuration(recorder.elapsed)}</span>
              <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden>
                {recorder.levels.slice(-40).map((l, i) => (
                  <span key={i} className="w-[3px] shrink-0 rounded-full bg-[#8696a0]" style={{ height: `${Math.max(12, l * 100)}%` }} />
                ))}
              </div>
              <button
                type="button"
                onClick={recorder.state === 'paused' ? recorder.resume : recorder.pause}
                aria-label={recorder.state === 'paused' ? t('Reprendre', 'Resume') : t('Pause', 'Pause')}
                className="text-[#f15c6d]"
              >
                {recorder.state === 'paused' ? <Icon.Mic size={22} /> : <Icon.Pause size={22} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void finishVoice()}
              aria-label={t('Envoyer le vocal', 'Send voice note')}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a]"
            >
              <Icon.Send size={22} />
            </button>
          </div>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <div className="flex min-h-12 min-w-0 flex-1 items-end rounded-[24px] bg-[#1f2c33] pr-1 pl-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                rows={1}
                maxLength={MAX_SUPPORT_TEXT}
                disabled={disabled}
                placeholder={photo ? t('Légende…', 'Caption…') : t('Écris ton message', 'Write your message')}
                aria-label={t('Message à l’assistance', 'Message to support')}
                className="field-sizing-content max-h-32 min-w-0 flex-1 resize-none bg-transparent py-3 text-[16px] leading-6 outline-none placeholder:text-[#8696a0]"
              />
              <button
                type="button"
                onClick={onPickPhoto}
                disabled={disabled}
                aria-label={t('Joindre une photo', 'Attach a photo')}
                className="grid size-11 shrink-0 place-items-center rounded-full text-[#8696a0] active:bg-white/10"
              >
                <Icon.Camera size={23} />
              </button>
            </div>
            {canSend || !canRecord ? (
              <button
                type="submit"
                disabled={!canSend || disabled}
                aria-label={t('Envoyer', 'Send')}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a] disabled:opacity-50"
              >
                <Icon.Send size={22} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startVoice()}
                disabled={disabled || recorder.state === 'starting'}
                aria-label={t('Enregistrer un vocal', 'Record a voice note')}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a] disabled:opacity-50"
              >
                <Icon.Mic size={23} />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
