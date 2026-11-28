'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import { Amount, Avatar, Badge, Empty, ErrorBox, Loading, PageHeader, Segmented } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { ago, when } from '@/lib/format';
import { formatDuration, prepareImage, rememberSupportMedia, supportMediaUrl, uploadSupportFile, useRecorder, type PreparedImage, type Recording } from '@/lib/media';

type Status = 'open' | 'closed' | 'all';

interface Thread {
  userId: number;
  username: string;
  fullName: string | null;
  status: 'open' | 'closed';
  lastAt: number;
  unread: number;
  last: { kind: 'text' | 'image' | 'voice'; body: string; fromStaff: boolean } | null;
}

interface Message {
  id: number;
  kind: 'text' | 'image' | 'voice';
  body: string;
  fromStaff: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
  createdAt: number;
  adminEmail: string | null;
}

interface Player {
  id: number;
  username: string;
  fullName: string | null;
  createdAt: number;
  games: number;
  coins: number;
  premiumCoins: number;
  bannedAt: number | null;
}

interface ThreadData {
  player: Player | null;
  thread: Thread | null;
  messages: Message[];
  more: boolean;
}

type Item = Message & { pending?: 'sending' | 'failed'; localUrl?: string; retry?: () => void };

function lastText(last: Thread['last']) {
  if (!last) return '';
  const text = last.kind === 'voice' ? '🎤 Message vocal' : last.kind === 'image' ? `📷 ${last.body || 'Photo'}` : last.body;
  return last.fromStaff ? `Vous : ${text}` : text;
}

export default function SupportPage() {
  const [status, setStatus] = useState<Status>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const query = new URLSearchParams({ status, ...(search.trim() ? { q: search.trim() } : {}) });
  const list = useAdminData<{ threads: Thread[]; unreadThreads: number }>(`/admin/support?${query}`, 8_000);

  // Opened from a player's page: /assistance?user=ID starts or resumes that conversation.
  useEffect(() => {
    const user = Number(new URLSearchParams(window.location.search).get('user'));
    if (Number.isInteger(user) && user > 0) setSelected(user);
  }, []);

  return (
    <>
      <PageHeader title="Assistance" subtitle="Conversations avec les joueurs : réponds par texte, photo ou message vocal" />
      <div className={`grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] ${selected !== null ? '' : ''}`}>
        <div className={`card overflow-hidden ${selected !== null ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-col gap-3 border-b border-line/60 p-3">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { id: 'open', label: 'En cours' },
                { id: 'closed', label: 'Résolues' },
                { id: 'all', label: 'Toutes' },
              ]}
            />
            <div className="relative">
              <Icon.Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Chercher un joueur"
                className="field pl-10"
                aria-label="Chercher un joueur"
              />
            </div>
          </div>
          {list.error && <div className="p-3"><ErrorBox>{list.error}</ErrorBox></div>}
          {list.loading && !list.data ? (
            <Loading />
          ) : list.data?.threads.length ? (
            <ul className="max-h-[70dvh] divide-y divide-line/50 overflow-y-auto">
              {list.data.threads.map((t) => (
                <li key={t.userId}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.userId)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selected === t.userId ? 'bg-accent/10' : 'hover:bg-white/[0.03]'}`}
                  >
                    <Avatar name={t.username} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate ${t.unread ? 'font-semibold' : 'font-medium'}`}>{t.username}</span>
                        <span className={`shrink-0 text-[12px] ${t.unread ? 'text-accent' : 'text-muted'}`}>{ago(t.lastAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-[13.5px] ${t.unread ? 'text-text' : 'text-muted'}`}>{lastText(t.last)}</span>
                        {t.unread > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11.5px] font-semibold text-[#0b141a]">{t.unread}</span>
                        )}
                        {status === 'all' && t.status === 'closed' && <Badge>Résolue</Badge>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Icon.Chat size={28} />}>
              {search ? 'Aucune conversation pour ce joueur.' : status === 'open' ? 'Aucune conversation en cours.' : 'Aucune conversation.'}
            </Empty>
          )}
        </div>

        {selected !== null ? (
          <Conversation key={selected} userId={selected} onBack={() => setSelected(null)} onChange={() => void list.reload()} />
        ) : (
          <div className="card hidden lg:block">
            <Empty icon={<Icon.Support size={28} />}>Choisis une conversation pour répondre.</Empty>
          </div>
        )}
      </div>
    </>
  );
}

let localId = 0;

function Conversation({ userId, onBack, onChange }: { userId: number; onBack: () => void; onChange: () => void }) {
  const { data, error, loading, reload } = useAdminData<ThreadData>(`/admin/support/thread?user=${userId}`, 4_000);
  const [older, setOlder] = useState<Message[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSeen = useRef(0);

  const messages: Item[] = [...older, ...(data?.messages ?? []).filter((m) => !older.some((o) => o.id === m.id)), ...pending];
  const newest = data?.messages.at(-1)?.id ?? 0;

  // A new message from the player shows the list's unread badge going away.
  useEffect(() => {
    if (newest && newest !== lastSeen.current) {
      if (lastSeen.current) onChange();
      lastSeen.current = newest;
    }
  }, [newest, onChange]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, data]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadOlder = async () => {
    const first = messages.find((m) => m.id > 0);
    if (!first) return;
    const el = scroller.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    stick.current = false;
    try {
      const res = await adminApi<ThreadData>(`/admin/support/thread?user=${userId}&before=${first.id}`);
      setOlder((prev) => [...res.messages, ...prev]);
      setMore(res.more);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Chargement impossible.');
    }
  };

  const send = useCallback(
    (draft: Item, run: () => Promise<Message>) => {
      stick.current = true;
      const attempt = () => {
        setPending((prev) => [...prev.filter((p) => p.id !== draft.id), { ...draft, pending: 'sending' }]);
        run()
          .then((message) => {
            if (draft.localUrl) rememberSupportMedia(message.id, draft.localUrl);
            return reload().then(() => setPending((prev) => prev.filter((p) => p.id !== draft.id)));
          })
          .then(onChange)
          .catch((err) => {
            setNotice(err instanceof Error ? err.message : 'Envoi impossible.');
            setPending((prev) => prev.map((p) => (p.id === draft.id ? { ...draft, pending: 'failed', retry: attempt } : p)));
          });
      };
      attempt();
    },
    [reload, onChange],
  );

  const draft = (m: Pick<Item, 'kind' | 'body'> & Partial<Item>): Item => ({
    id: -++localId,
    fromStaff: true,
    createdAt: Date.now(),
    adminEmail: null,
    ...m,
  });

  const submit = () => {
    const body = text.trim();
    if (photo) {
      const { blob, width, height, url } = photo;
      send(draft({ kind: 'image', body, width, height, localUrl: url }), () =>
        uploadSupportFile<Message>(userId, blob, { kind: 'image', width, height, caption: body }),
      );
      setPhoto(null);
      setText('');
      return;
    }
    if (!body) return;
    send(draft({ kind: 'text', body }), () => adminApi<{ message: Message }>('/admin/support/send', { userId, text: body }).then((r) => r.message));
    setText('');
  };

  const sendVoice = (rec: Recording) => {
    const url = URL.createObjectURL(rec.blob);
    send(draft({ kind: 'voice', body: '', durationMs: rec.durationMs, localUrl: url }), () =>
      uploadSupportFile<Message>(userId, rec.blob, { kind: 'voice', durationMs: rec.durationMs }),
    );
  };
  const recorder = useRecorder(sendVoice);

  const setThreadStatus = async (next: 'open' | 'closed') => {
    setBusy(true);
    try {
      await adminApi('/admin/support/status', { userId, status: next });
      await reload();
      onChange();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <div className="card"><Loading /></div>;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  const player = data?.player;
  const thread = data?.thread;
  const hasMore = more ?? data?.more ?? false;

  return (
    <div className="card flex h-[calc(100dvh-10rem)] min-h-[28rem] flex-col overflow-hidden lg:h-[calc(100dvh-9rem)]">
      <div className="flex items-center gap-3 border-b border-line/60 p-3">
        <button type="button" onClick={onBack} aria-label="Retour aux conversations" className="grid size-10 place-items-center rounded-full hover:bg-white/5 lg:hidden">
          <Icon.Back size={22} />
        </button>
        <Avatar name={player?.username ?? '?'} size={40} />
        <div className="min-w-0 flex-1">
          <Link href={`/joueurs/${userId}`} className="block truncate font-medium hover:underline">
            {player?.username ?? 'Joueur'}
            {player?.fullName && <span className="font-normal text-muted"> · {player.fullName}</span>}
          </Link>
          {player && (
            <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
              <span>Inscrit {ago(player.createdAt)}</span>
              <span>· {player.games} parties</span>
              <span>
                · <Amount value={player.coins} currency="free" />
              </span>
              <span>
                · <Amount value={player.premiumCoins} currency="premium" />
              </span>
              {player.bannedAt && <Badge tone="danger">Banni</Badge>}
            </p>
          )}
        </div>
        {thread &&
          (thread.status === 'open' ? (
            <button type="button" disabled={busy} onClick={() => void setThreadStatus('closed')} className="btn btn-tonal shrink-0">
              <Icon.Check size={18} />
              <span className="hidden sm:inline">Marquer résolue</span>
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void setThreadStatus('open')} className="btn btn-tonal shrink-0">
              <Icon.Refresh size={18} />
              <span className="hidden sm:inline">Rouvrir</span>
            </button>
          ))}
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-bg/60 p-4"
      >
        {hasMore && (
          <button type="button" onClick={() => void loadOlder()} className="btn btn-ghost mx-auto mb-2 h-8 text-[13px]">
            Messages précédents
          </button>
        )}
        {!messages.length && (
          <p className="m-auto max-w-sm text-center text-[13.5px] text-muted">
            Aucun message pour l’instant. Écris au joueur : il recevra une notification et pourra te répondre depuis « Assistance ».
          </p>
        )}
        {messages.map((m) => (
          <AdminBubble key={m.id} message={m} />
        ))}
      </div>

      {notice && <p className="border-t border-line/60 bg-danger/10 px-4 py-2 text-[13px] text-danger">{notice}</p>}

      <div className="border-t border-line/60 p-3">
        {photo && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-raised p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="size-14 rounded-lg object-cover" />
            <p className="min-w-0 flex-1 text-[13px] text-muted">Ajoute une légende si besoin, puis envoie.</p>
            <button type="button" onClick={() => setPhoto(null)} aria-label="Retirer la photo" className="grid size-9 place-items-center rounded-full hover:bg-white/5">
              <Icon.Close size={20} />
            </button>
          </div>
        )}
        {recorder.recording ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void recorder.stop(false)} aria-label="Annuler le vocal" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-white/5">
              <Icon.Delete size={22} />
            </button>
            <div className="flex h-11 flex-1 items-center gap-3 rounded-full bg-raised px-4">
              <span className="size-2.5 animate-pulse rounded-full bg-danger" />
              <span className="tabular-nums">{formatDuration(recorder.elapsed)}</span>
              <span className="text-[13px] text-muted">Enregistrement…</span>
            </div>
            <button
              type="button"
              onClick={() => void recorder.stop(true).then((r) => r && sendVoice(r))}
              aria-label="Envoyer le vocal"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[#0b141a]"
            >
              <Icon.Send size={20} />
            </button>
          </div>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Joindre une image"
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-white/5"
            >
              <Icon.Image size={22} />
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={photo ? 'Légende…' : 'Ta réponse (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)'}
              aria-label="Réponse au joueur"
              className="field field-sizing-content h-auto max-h-40 min-h-11 flex-1 resize-none py-2.5 leading-6"
            />
            {text.trim() || photo ? (
              <button type="submit" aria-label="Envoyer" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[#0b141a]">
                <Icon.Send size={20} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void recorder.start().catch((err) => setNotice(err instanceof Error ? err.message : 'Micro indisponible.'))}
                aria-label="Enregistrer un vocal"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[#0b141a]"
              >
                <Icon.Mic size={21} />
              </button>
            )}
          </form>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) prepareImage(file).then(setPhoto, (err) => setNotice(err instanceof Error ? err.message : 'Image illisible.'));
          }}
        />
      </div>
    </div>
  );
}

function AdminBubble({ message: m }: { message: Item }) {
  const staff = m.fromStaff;
  return (
    <div className={`flex ${staff ? 'justify-end' : 'justify-start'} ${m.pending === 'sending' ? 'opacity-60' : ''}`}>
      <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-[14px] ${staff ? 'bg-[#005c4b]' : 'bg-raised'}`}>
        {staff && m.adminEmail && <p className="text-[11.5px] font-medium text-[#d1f4cc]/70">{m.adminEmail}</p>}
        {m.kind === 'image' && <AdminPhoto message={m} />}
        {m.kind === 'voice' && <AdminVoice message={m} />}
        {m.body && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
        <p className={`mt-0.5 text-right text-[11px] ${staff ? 'text-[#d1f4cc]/60' : 'text-muted'}`} title={when(m.createdAt)}>
          {m.pending === 'sending' ? 'Envoi…' : when(m.createdAt)}
        </p>
        {m.pending === 'failed' && (
          <button type="button" onClick={m.retry} className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold text-danger">
            <Icon.Refresh size={14} /> Échec, réessayer
          </button>
        )}
      </div>
    </div>
  );
}

function useMedia(m: Item) {
  const [url, setUrl] = useState<string | null>(m.localUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (m.localUrl) return setUrl(m.localUrl);
    if (m.id < 0) return;
    let cancelled = false;
    supportMediaUrl(m.id).then(
      (u) => !cancelled && setUrl(u),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [m.id, m.localUrl]);
  return { url, failed };
}

function AdminPhoto({ message }: { message: Item }) {
  const { url, failed } = useMedia(message);
  if (!url) {
    return (
      <p className="flex items-center gap-1.5 py-2 text-muted">
        <Icon.Image size={15} /> {failed ? 'Photo indisponible' : 'Chargement…'}
      </p>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="my-1 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Photo envoyée" className="max-h-72 w-auto rounded-lg" />
    </a>
  );
}

function AdminVoice({ message }: { message: Item }) {
  const { url, failed } = useMedia(message);
  return (
    <div className="flex min-w-[220px] flex-col gap-1 py-1">
      {url ? (
        <audio src={url} controls preload="metadata" className="h-10 w-full" />
      ) : (
        <p className="flex items-center gap-1.5 text-muted">
          <Icon.Mic size={15} /> {failed ? 'Vocal indisponible' : 'Chargement…'}
        </p>
      )}
      {message.durationMs ? <span className="text-[11.5px] text-muted">Message vocal · {formatDuration(message.durationMs)}</span> : null}
    </div>
  );
}
