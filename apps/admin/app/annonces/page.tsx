'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icons';
import { Dialog, Empty, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { adminApi, useAdminData } from '@/lib/api';
import { fmt, when } from '@/lib/format';

interface Announcement {
  id: number;
  title: string;
  body: string;
  url: string | null;
  createdAt: number;
  seenBy: number;
}

interface AnnouncementsView {
  announcements: Announcement[];
  /** Players with at least one phone subscribed to push notifications. */
  pushDevices: number;
}

/** Pages players can be sent to from an announcement. */
const LINKS = [
  { url: '', label: 'Aucun lien' },
  { url: '/?tab=games', label: 'Jeux' },
  { url: '/parrainage', label: 'Parrainage' },
  { url: '/portefeuille', label: 'Portefeuille' },
  { url: '/boutique', label: 'Boutique' },
  { url: '/classement', label: 'Classement' },
];

export default function AnnouncementsPage() {
  const { data, error, loading, reload } = useAdminData<AnnouncementsView>('/admin/announcements');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [push, setPush] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [removing, setRemoving] = useState<Announcement | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return null;

  const ready = title.trim().length > 0 && body.trim().length > 0;

  const send = async () => {
    setBusy(true);
    setSendError(null);
    try {
      await adminApi('/admin/announcements', { title, body, url, push });
      setConfirm(false);
      setTitle('');
      setBody('');
      setUrl('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      await reload();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await adminApi('/admin/announcements/delete', { id: removing.id });
      setRemoving(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) setConfirm(true);
  };

  return (
    <>
      <PageHeader title="Annonces" subtitle="Notifications envoyées à tous les joueurs : événements, tournois, nouveautés, maintenance…" />

      <form onSubmit={submit} className="card mb-4 flex flex-col gap-4 p-5">
        <h2 className="flex items-center gap-2 text-[16px] font-medium">
          <Icon.Bell size={20} className="text-accent" />
          Nouvelle annonce
        </h2>
        <label>
          <span className="label">Titre</span>
          <input className="field" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tournoi de Ludo samedi à 20 h" />
        </label>
        <label>
          <span className="label">Message</span>
          <textarea
            className="field min-h-28 py-3"
            maxLength={400}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Inscris-toi dans l’onglet Jeux : 50 000 pièces Free à gagner !"
          />
          <span className="mt-1 block text-right text-[12px] text-muted tabular-nums">{body.length} / 400</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Page ouverte au toucher</span>
            <select className="field" value={url} onChange={(e) => setUrl(e.target.value)}>
              {LINKS.map((l) => (
                <option key={l.url} value={l.url}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 self-end rounded-2xl bg-white/[0.04] px-4 py-3">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="size-5 accent-[#00a884]" />
            <span className="text-[14px]">
              Envoyer aussi sur les téléphones
              <span className="block text-[12.5px] text-muted">{fmt(data.pushDevices)} joueurs ont activé les notifications</span>
            </span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3">
          {sent && <span className="text-[13.5px] text-accent">Annonce envoyée.</span>}
          <button type="submit" className="btn btn-primary" disabled={!ready}>
            <Icon.Check size={18} />
            Envoyer à tous
          </button>
        </div>
      </form>

      <section className="card p-5">
        <h2 className="text-[16px] font-medium">Annonces envoyées</h2>
        {data.announcements.length === 0 ? (
          <Empty icon={<Icon.Bell size={28} />}>Aucune annonce pour l’instant.</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {data.announcements.map((a) => (
              <li key={a.id} className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-[13.5px] whitespace-pre-line text-muted">{a.body}</p>
                  <p className="mt-1 text-[12.5px] text-muted">
                    {when(a.createdAt)} · vue par {fmt(a.seenBy)} joueurs{a.url ? ` · ouvre ${a.url}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                  onClick={() => setRemoving(a)}
                  aria-label="Supprimer l’annonce"
                >
                  <Icon.Delete size={19} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={confirm} title="Envoyer cette annonce à tous les joueurs ?" onClose={() => setConfirm(false)}>
        <div className="flex flex-col gap-3 text-[14px]">
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="font-medium">{title}</p>
            <p className="mt-1 whitespace-pre-line text-muted">{body}</p>
          </div>
          <p className="text-muted">
            Elle apparaît dans la cloche de chaque joueur{push ? `, et en notification sur ${fmt(data.pushDevices)} téléphones` : ''}. Une notification
            envoyée sur un téléphone ne peut pas être reprise.
          </p>
          {sendError && <ErrorBox>{sendError}</ErrorBox>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
              Envoyer
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!removing} title="Supprimer cette annonce ?" onClose={() => setRemoving(null)}>
        <div className="flex flex-col gap-3 text-[14px]">
          <p className="text-muted">Elle disparaît de la cloche de tous les joueurs. Les notifications déjà reçues sur les téléphones restent.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={remove}>
              Supprimer
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
