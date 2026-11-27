'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { CoinAmount } from '@/components/Coins';
import { usePreviousPage } from '@/lib/navigation';
import { REFERRAL } from '@ludo/engine';
import { login, register, saveFullName, useProfile } from '@/lib/profile';
import { storedReferrer } from '@/lib/referral';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/Icons';

type Mode = 'register' | 'login';

export default function AccountPage() {
  const router = useRouter();
  const { profile, session, fullName: savedFullName } = useProfile();
  const [mode, setMode] = useState<Mode>('register');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const previous = usePreviousPage();
  const cameFromGame = !!previous && !/^\/(\?|$)|^\/profil/.test(previous.path);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [referrer, setReferrer] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'login') setMode('login');
    setReferrer(storedReferrer());
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') await register(username.trim(), password, fullName.trim());
      else await login(username.trim(), password);
      // Signing in from a game page (e.g. to stake): go straight back to it.
      if (cameFromGame) router.back();
      else router.push('/?tab=profile');
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
        {previous ? (
          <BackButton onClick={() => router.back()} label={`Retour : ${previous.name}`} text={previous.name} />
        ) : (
          <BackButton href="/" label="Retour à l’accueil" text="Accueil" />
        )}
        <h1 className="flex-1 text-2xl font-bold">Mon compte</h1>
      </header>

      {session ? (
        <section className="card p-4 text-center">
          <p>
            Tu es connecté en tant que <strong>{session.username}</strong>.
          </p>
          <FullNameCard saved={savedFullName} />
          <Link href="/?tab=profile" className="btn btn-primary mt-4">
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
            {mode === 'register' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-white/70">Nom complet</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={60}
                  required
                  placeholder="Ex : Awa Diop"
                  className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
                />
                <span className="text-xs text-white/50">Ton prénom et ton nom. Il reste privé : les autres joueurs ne voient que ton pseudo.</span>
              </label>
            )}
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
              <span className="relative flex">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  minLength={mode === 'register' ? 6 : undefined}
                  required
                  className="w-full rounded-2xl bg-black/25 py-3 pr-14 pl-4 text-lg outline-none ring-white/40 focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-1 my-auto grid size-11 place-items-center rounded-full text-white/60 active:bg-white/10"
                >
                  {showPassword ? <Icon.EyeOff size={22} /> : <Icon.Eye size={22} />}
                </button>
              </span>
            </label>
            {mode === 'register' && (
              <p className="text-xs text-white/50">3 à 16 caractères pour le pseudo, au moins 6 pour le mot de passe.</p>
            )}
            {mode === 'register' && referrer && (
              <p className="flex items-center gap-2 rounded-xl bg-[#00a884]/15 p-3 text-sm text-[#d1d7db]">
                <Icon.Gift size={18} className="shrink-0 text-[#00a884]" />
                <span>
                  Invité par <strong>{referrer}</strong> : {REFERRAL.newcomerCoins} pièces offertes après tes {REFERRAL.gamesNeeded} premières parties en ligne.
                </span>
              </p>
            )}
            {error && <p className="pop-in rounded-xl bg-red-500/20 p-3 text-center text-sm font-medium text-red-200">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary mt-1">
              {busy ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Me connecter'}
            </button>
            {mode === 'register' && (
              <p className="text-center text-xs leading-relaxed text-white/50">
                En créant un compte, tu acceptes les{' '}
                <Link href="/conditions" className="font-semibold text-[#00a884]">
                  conditions d’utilisation
                </Link>{' '}
                et la{' '}
                <Link href="/confidentialite" className="font-semibold text-[#00a884]">
                  politique de confidentialité
                </Link>
                .
              </p>
            )}
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

/** Shows the account's real name, or asks for it if the account was made before it was required. */
function FullNameCard({ saved }: { saved: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asking = !saved || editing;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await saveFullName(value.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <p className="mt-3 flex items-center justify-center gap-2 text-sm text-white/70">
        <span>
          Nom complet : <strong className="text-white">{saved}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setValue(saved ?? '');
            setEditing(true);
          }}
          className="font-semibold text-[#00a884]"
        >
          Modifier
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 rounded-2xl bg-black/20 p-3 text-left">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white/70">{saved ? 'Corriger ton nom complet' : 'Ajoute ton nom complet'}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={60}
          required
          placeholder="Ex : Awa Diop"
          className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
        />
        <span className="text-xs text-white/50">Privé : les autres joueurs ne voient que ton pseudo.</span>
      </label>
      {error && <p className="rounded-xl bg-red-500/20 p-2 text-center text-sm font-medium text-red-200">{error}</p>}
      <div className="flex gap-2">
        {saved && (
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost flex-1">
            Annuler
          </button>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary flex-1">
          {busy ? 'Un instant…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
