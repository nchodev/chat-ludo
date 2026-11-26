'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icons';
import { ErrorBox } from '@/components/ui';
import { adminApi, getToken, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace('/');
  }, [router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi<{ token: string }>('/admin/login', { email, password });
      setToken(res.token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Icon.Shield size={30} />
        </span>
        <h1 className="mt-5 text-[24px] font-medium">LuChat Admin</h1>
        <p className="mt-1 text-[14px] text-muted">Espace réservé à l’équipe de la plateforme.</p>

        <label className="mt-6 block">
          <span className="label">Email</span>
          <input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="mt-4 block">
          <span className="label">Mot de passe</span>
          <span className="relative block">
            <input
              className="field pr-12"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute inset-y-0 right-1 my-auto grid size-10 place-items-center rounded-full text-muted hover:bg-white/5"
            >
              {showPassword ? <Icon.EyeOff size={20} /> : <Icon.Eye size={20} />}
            </button>
          </span>
        </label>

        {error && (
          <div className="mt-4">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary mt-6 h-11 w-full">
          <Icon.Lock size={18} />
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
