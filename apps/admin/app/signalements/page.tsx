'use client';

import Link from 'next/link';
import { useState } from 'react';
import { chatPreviewText, parseChatImage } from '@ludo/engine';
import { Icon } from '@/components/Icons';
import { Avatar, Badge, Empty, ErrorBox, Loading, PageHeader, Segmented } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { ago, when } from '@/lib/format';

interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  sender: string;
  recipient: string;
  body: string;
  createdAt: number;
  kind: 'text' | 'voice' | 'invite' | 'image' | 'system';
  groupName: string | null;
  durationMs: number | null;
  deleted: boolean;
  forwarded: boolean;
  edited?: boolean;
  /** Earlier versions of an edited message, oldest first. */
  edits?: { body: string; editedAt: number }[];
}

interface Report {
  messageId: number;
  message: Message;
  reports: { reporter: string; reason: string; createdAt: number }[];
  resolvedAt: number | null;
  resolution: string | null;
}

export default function ReportsPage() {
  const [view, setView] = useState<'open' | 'resolved'>('open');
  const [selected, setSelected] = useState<number | null>(null);
  const list = useAdminData<{ reports: Report[] }>(`/admin/reports${view === 'resolved' ? '?resolved=1' : ''}`, 20_000);

  return (
    <>
      <PageHeader title="Signalements" subtitle="Messages signalés par les joueurs dans les discussions" />
      <div className="mb-4">
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v);
            setSelected(null);
          }}
          options={[
            { id: 'open', label: 'À traiter' },
            { id: 'resolved', label: 'Traités' },
          ]}
        />
      </div>
      {list.error && <ErrorBox>{list.error}</ErrorBox>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="card overflow-hidden">
          {list.loading && !list.data ? (
            <Loading />
          ) : list.data?.reports.length ? (
            <ul className="divide-y divide-line/50">
              {list.data.reports.map((r) => (
                <li key={r.messageId}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.messageId)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${selected === r.messageId ? 'bg-accent/10' : 'hover:bg-white/[0.03]'}`}
                  >
                    <Avatar name={r.message.sender} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{r.message.sender}</span>
                        <span className="shrink-0 text-[12px] text-muted">{ago(r.reports[r.reports.length - 1].createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13.5px] text-muted">
                        {r.message.deleted ? 'Message supprimé' : chatPreviewText(r.message)}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone="danger">{r.reports[0].reason}</Badge>
                        {r.reports.length > 1 && <Badge>{r.reports.length} signalements</Badge>}
                        {r.resolution && <Badge tone="accent">{r.resolution}</Badge>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Icon.Flag size={28} />}>{view === 'open' ? 'Aucun signalement à traiter.' : 'Aucun signalement traité.'}</Empty>
          )}
        </div>
        {selected !== null ? (
          <ReportDetail
            key={selected}
            id={selected}
            onDone={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        ) : (
          <div className="card hidden lg:block">
            <Empty icon={<Icon.Chat size={28} />}>Choisis un signalement pour lire la conversation.</Empty>
          </div>
        )}
      </div>
    </>
  );
}

function ReportedImage({ reportId, message }: { reportId: number; message: Message }) {
  const { data, error } = useAdminData<{ src: string }>(`/admin/report/image?report=${reportId}&id=${message.id}`);
  const image = parseChatImage(message.body);
  return (
    <div className="flex flex-col gap-1 py-1">
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.src} alt="Photo envoyée" className="max-h-72 w-auto rounded-lg" />
      ) : (
        <p className="flex items-center gap-1.5 text-muted">
          <Icon.Image size={15} /> {error ?? 'Chargement de la photo…'}
        </p>
      )}
      {image?.caption && <p className="break-words whitespace-pre-wrap">{image.caption}</p>}
    </div>
  );
}

function ReportDetail({ id, onDone }: { id: number; onDone: () => void }) {
  const { data, error, loading } = useAdminData<{ report: Report; context: Message[] }>(`/admin/report?id=${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const resolve = async (action: 'delete' | 'dismiss') => {
    setBusy(true);
    setActionError(null);
    try {
      await adminApi('/admin/reports/resolve', { messageId: id, action });
      onDone();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action impossible.');
      setBusy(false);
    }
  };

  if (loading && !data) return <div className="card"><Loading /></div>;
  if (error || !data) return <ErrorBox>{error ?? 'Signalement introuvable.'}</ErrorBox>;
  const { report, context } = data;
  const message = report.message;

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="border-b border-line/60 p-4">
        {message.groupName !== null ? (
          <p className="text-[13px] text-muted">
            Groupe « {message.groupName} » · signalé dans un message de{' '}
            <Link href={`/joueurs/${message.senderId}`} className="text-info hover:underline">
              {message.sender}
            </Link>
          </p>
        ) : (
        <p className="text-[13px] text-muted">
          Conversation entre{' '}
          <Link href={`/joueurs/${message.senderId}`} className="text-info hover:underline">
            {message.sender}
          </Link>{' '}
          et{' '}
          <Link href={`/joueurs/${message.recipientId}`} className="text-info hover:underline">
            {message.recipient}
          </Link>
        </p>
        )}
        <ul className="mt-2 flex flex-col gap-1">
          {report.reports.map((r, i) => (
            <li key={i} className="text-[13.5px]">
              <Icon.Flag size={14} className="mr-1.5 inline text-danger" />
              <span className="font-medium">{r.reporter}</span> : {r.reason} <span className="text-muted">· {when(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto bg-bg/60 p-4">
        {context.map((m) => {
          const fromSender = m.senderId === message.senderId;
          const reported = m.id === message.id;
          return (
            <div key={m.id} className={`flex ${fromSender ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-1.5 text-[14px] ${
                  reported ? 'bg-danger/20 ring-2 ring-danger' : fromSender ? 'bg-raised' : 'bg-[#005c4b]'
                }`}
              >
                <p className="text-[11.5px] font-medium text-muted">{m.sender}</p>
                {m.deleted ? (
                  <p className="text-muted italic">
                    <Icon.Block size={13} className="mr-1 inline" />
                    Message supprimé
                  </p>
                ) : m.kind === 'voice' ? (
                  <p className="flex items-center gap-1.5 text-muted">
                    <Icon.Mic size={15} /> Message vocal ({Math.round((m.durationMs ?? 0) / 1000)} s)
                  </p>
                ) : m.kind === 'image' ? (
                  <ReportedImage reportId={id} message={m} />
                ) : m.kind === 'invite' ? (
                  <p className="text-muted">{chatPreviewText(m)}</p>
                ) : (
                  <p className="break-words whitespace-pre-wrap">{m.body}</p>
                )}
                {m.edits?.map((edit, i) => (
                  <p key={i} className="mt-1 border-l-2 border-line pl-2 text-[12.5px] break-words whitespace-pre-wrap text-muted">
                    <span className="block text-[11px]">Version {i + 1}, remplacée le {when(edit.editedAt)}</span>
                    {edit.body}
                  </p>
                ))}
                <p className="mt-0.5 text-right text-[11px] text-muted">
                  {m.edited && 'Modifié · '}
                  {when(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 p-4">
        {actionError && <ErrorBox>{actionError}</ErrorBox>}
        {report.resolvedAt ? (
          <Badge tone="accent">
            {report.resolution} · {when(report.resolvedAt)}
          </Badge>
        ) : (
          <>
            <Link href={`/joueurs/${message.senderId}`} className="btn btn-ghost">
              Voir {message.sender}
            </Link>
            <button type="button" className="btn btn-tonal" disabled={busy} onClick={() => resolve('dismiss')}>
              <Icon.Check size={18} />
              Classer sans suite
            </button>
            {!message.deleted && (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => resolve('delete')}>
                <Icon.Delete size={18} />
                Supprimer le message
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
