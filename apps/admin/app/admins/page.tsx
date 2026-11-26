'use client';

import { useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/AdminShell';
import { Icon } from '@/components/Icons';
import { Avatar, Badge, Dialog, ErrorBox, Loading, PageHeader } from '@/components/ui';
import { adminApi, setToken, useAdminData } from '@/lib/api';
import { ago, day } from '@/lib/format';

interface AdminRow {
  id: number;
  email: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export default function AdminsPage() {
  const me = useAdmin();
  const { data, error, loading, reload } = useAdminData<{ admins: AdminRow[] }>('/admin/admins');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminRow | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <>
      <PageHeader
        title="Administrateurs"
        subtitle="Comptes qui ont accès à ce panel"
        actions={
          <>
            <button type="button" className="btn btn-tonal" onClick={() => setChangingPassword(true)}>
              <Icon.Lock size={18} />
              Mon mot de passe
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon.Add size={18} />
              Ajouter un admin
            </button>
          </>
        }
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="card overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-line/50">
            {data?.admins.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={a.email} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {a.email} {a.id === me?.id && <Badge tone="accent">Toi</Badge>}
                  </p>
                  <p className="text-[13px] text-muted">
                    Ajouté le {day(a.createdAt)} · {a.lastLoginAt ? `dernière connexion ${ago(a.lastLoginAt)}` : 'jamais connecté'}
                  </p>
                </div>
                {a.id !== me?.id && (
                  <button type="button" className="grid size-10 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger" onClick={() => setRemoving(a)} aria-label={`Supprimer ${a.email}`}>
                    <Icon.Delete size={20} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddAdminDialog open={adding} onClose={() => setAdding(false)} onDone={reload} />
      <RemoveAdminDialog admin={removing} onClose={() => setRemoving(null)} onDone={reload} />
      <PasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
    </>
  );
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input className="field pr-12" type={show ? 'text' : 'password'} required autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-full text-muted hover:bg-white/5"
        >
          {show ? <Icon.EyeOff size={20} /> : <Icon.Eye size={20} />}
        </button>
      </span>
    </label>
  );
}

function useSubmit(action: () => Promise<void>, onSuccess: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function AddAdminDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useSubmit(
    async () => {
      await adminApi('/admin/admins', { email, password });
    },
    () => {
      setEmail('');
      setPassword('');
      onDone();
      onClose();
    },
  );
  return (
    <Dialog open={open} title="Ajouter un admin" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[14px] text-muted">Il aura accès à tout le panel. Transmets-lui le mot de passe par un canal sûr.</p>
        <label>
          <span className="label">Email</span>
          <input className="field" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <PasswordField label="Mot de passe (10 caractères minimum)" value={password} onChange={setPassword} autoComplete="new-password" />
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Ajouter
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RemoveAdminDialog({ admin, onClose, onDone }: { admin: AdminRow | null; onClose: () => void; onDone: () => void }) {
  const { busy, error, submit } = useSubmit(
    async () => {
      await adminApi('/admin/admins/delete', { id: admin?.id });
    },
    () => {
      onDone();
      onClose();
    },
  );
  return (
    <Dialog open={!!admin} title="Retirer cet admin ?" onClose={onClose}>
      <p className="text-[14px] text-muted">{admin?.email} n’aura plus accès au panel, ses sessions ouvertes sont fermées.</p>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => submit()}>
          <Icon.Delete size={18} />
          Retirer
        </button>
      </div>
    </Dialog>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, submit } = useSubmit(
    async () => {
      const res = await adminApi<{ token: string }>('/admin/password', { current, next });
      setToken(res.token);
    },
    () => {
      setCurrent('');
      setNext('');
      setDone(true);
    },
  );
  const close = () => {
    setDone(false);
    onClose();
  };
  return (
    <Dialog open={open} title="Changer mon mot de passe" onClose={close}>
      {done ? (
        <>
          <p className="text-[14px] text-muted">Mot de passe changé. Tes autres sessions ont été fermées.</p>
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn btn-primary" onClick={close}>
              OK
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <PasswordField label="Mot de passe actuel" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="Nouveau mot de passe (10 caractères minimum)" value={next} onChange={setNext} autoComplete="new-password" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Changer
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
