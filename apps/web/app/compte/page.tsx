'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CoinAmount } from '@/components/Coins';
import { login, register, useProfile } from '@/lib/profile';

type Mode = 'register' | 'login';

export default function AccountPage() {
  const router = useRouter();
  const { profile, session } = useProfile();
  const [mode, setMode] = useState<Mode>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (mode === 'register' ? register : login)(username.trim(), password);
      router.push('/profil');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  };

  const hasGuestProgress = !session && (profile.coins > 0 || profile.xp > 0 || profile.owned.length > 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Accueil">
          ←
        </Link>
        <h1 className="flex-1 text-2xl font-bold">Mon compte</h1>
      </header>

      {session ? (
        <section className="card p-4 text-center">
          <p>
            Tu es connecté en tant que <strong>{session.username}</strong>.
          </p>
          <Link href="/profil" className="btn btn-primary mt-4">
            Voir mon profil
          </Link>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/25 p-1">
            {(['register', 'login'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-xl py-2.5 text-sm font-semibold transition ${mode === m ? 'bg-white text-slate-900 shadow' : 'text-white/70'}`}
              >
                {m === 'register' ? 'Créer un compte' : 'Se connecter'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="card flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-white/70">Pseudo</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={16}
                required
                placeholder="Ex : Awa_221"
                className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-white/70">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? 6 : undefined}
                required
                className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 focus:ring-2"
              />
            </label>
            {mode === 'register' && (
              <p className="text-xs text-white/50">3 à 16 caractères pour le pseudo, au moins 6 pour le mot de passe.</p>
            )}
            {error && <p className="pop-in rounded-xl bg-red-500/20 p-3 text-center text-sm font-medium text-red-200">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary mt-1">
              {busy ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Me connecter'}
            </button>
          </form>

          <section className="card p-4 text-sm text-white/70">
            <h2 className="mb-2 font-bold text-white">Pourquoi un compte ?</h2>
            <ul className="flex flex-col gap-1.5">
              <li>💾 Tes pièces, styles et niveaux sont sauvegardés et suivent ton pseudo sur tous tes appareils.</li>
              <li>🏅 Tu apparais au classement général.</li>
              <li>🌍 Tes victoires en ligne sont comptées par le serveur.</li>
            </ul>
            {hasGuestProgress && mode === 'register' && (
              <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-emerald-100">
                Ta progression actuelle (<CoinAmount value={profile.coins} size={14} />, niveau, styles achetés) sera
                transférée sur ton nouveau compte.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
