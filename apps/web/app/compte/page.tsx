'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { CoinAmount } from '@/components/Coins';
import { usePreviousPage } from '@/lib/navigation';
import { login, register, saveFullName, useProfile } from '@/lib/profile';
import { storedReferrer, useReferralRules } from '@/lib/referral';
import { useLang } from '@/lib/i18n';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/Icons';

type Mode = 'register' | 'login';

export default function AccountPage() {
  const router = useRouter();
  const { profile, session, fullName: savedFullName } = useProfile();
  const { t } = useLang();
  const referral = useReferralRules();
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
      setError(err instanceof Error ? err.message : t('Erreur inattendue.', 'Unexpected error.'));
    } finally {
      setBusy(false);
    }
  };

  const hasGuestProgress = !session && (profile.coins > 0 || profile.xp > 0 || profile.owned.length > 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        {previous ? (
          <BackButton onClick={() => router.back()} label={t(`Retour : ${previous.name}`, `Back: ${previous.name}`)} text={previous.name} />
        ) : (
          <BackButton href="/" label={t('Retour à l’accueil', 'Back to home')} text={t('Accueil', 'Home')} />
        )}
        <h1 className="flex-1 text-2xl font-bold">{t('Mon compte', 'My account')}</h1>
      </header>

      {session ? (
        <section className="card p-4 text-center">
          <p>
            {t('Tu es connecté en tant que', 'You are signed in as')} <strong>{session.username}</strong>.
          </p>
          <FullNameCard saved={savedFullName} />
          <Link href="/?tab=profile" className="btn btn-primary mt-4">
            {t('Voir mon profil', 'See my profile')}
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
                {m === 'register' ? t('Créer un compte', 'Create an account') : t('Se connecter', 'Sign in')}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="card flex flex-col gap-3 p-4">
            {mode === 'register' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-white/70">{t('Nom complet', 'Full name')}</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={60}
                  required
                  placeholder={t('Ex : Awa Diop', 'E.g. Awa Diop')}
                  className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
                />
                <span className="text-xs text-white/50">
                  {t('Ton prénom et ton nom. Il reste privé : les autres joueurs ne voient que ton pseudo.', 'Your first and last name. It stays private: other players only see your username.')}
                </span>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-white/70">{t('Pseudo', 'Username')}</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                maxLength={16}
                required
                placeholder={t('Ex : Awa_221', 'E.g. Awa_221')}
                className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-white/70">{t('Mot de passe', 'Password')}</span>
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
                  aria-label={showPassword ? t('Masquer le mot de passe', 'Hide password') : t('Afficher le mot de passe', 'Show password')}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-1 my-auto grid size-11 place-items-center rounded-full text-white/60 active:bg-white/10"
                >
                  {showPassword ? <Icon.EyeOff size={22} /> : <Icon.Eye size={22} />}
                </button>
              </span>
            </label>
            {mode === 'register' && (
              <p className="text-xs text-white/50">
                {t('3 à 16 caractères pour le pseudo, au moins 6 pour le mot de passe.', '3 to 16 characters for the username, at least 6 for the password.')}
              </p>
            )}
            {mode === 'register' && referrer && (
              <p className="flex items-center gap-2 rounded-xl bg-[#00a884]/15 p-3 text-sm text-[#d1d7db]">
                <Icon.Gift size={18} className="shrink-0 text-[#00a884]" />
                <span>
                  {t('Invité par', 'Invited by')} <strong>{referrer}</strong>
                  {referral && referral.free.newcomerCoins > 0 &&
                    t(
                      ` : ${referral.free.newcomerCoins} pièces offertes après tes ${referral.free.gamesNeeded} premières parties en ligne.`,
                      `: ${referral.free.newcomerCoins} free coins after your first ${referral.free.gamesNeeded} online games.`,
                    )}
                </span>
              </p>
            )}
            {error && <p className="pop-in rounded-xl bg-red-500/20 p-3 text-center text-sm font-medium text-red-200">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary mt-1">
              {busy ? t('Un instant…', 'One moment…') : mode === 'register' ? t('Créer mon compte', 'Create my account') : t('Me connecter', 'Sign in')}
            </button>
            {mode === 'register' && (
              <p className="text-center text-xs leading-relaxed text-white/50">
                {t('En créant un compte, tu acceptes les', 'By creating an account, you accept the')}{' '}
                <Link href="/conditions" className="font-semibold text-[#00a884]">
                  {t('conditions d’utilisation', 'terms of use')}
                </Link>{' '}
                {t('et la', 'and the')}{' '}
                <Link href="/confidentialite" className="font-semibold text-[#00a884]">
                  {t('politique de confidentialité', 'privacy policy')}
                </Link>
                .
              </p>
            )}
          </form>

          <section className="card p-4 text-sm text-white/70">
            <h2 className="mb-2 font-bold text-white">{t('Pourquoi un compte ?', 'Why an account?')}</h2>
            <ul className="flex flex-col gap-1.5">
              <li>💾 {t('Tes pièces, styles et niveaux sont sauvegardés et suivent ton pseudo sur tous tes appareils.', 'Your coins, styles and levels are saved and follow your username on all your devices.')}</li>
              <li>🏅 {t('Tu apparais au classement général.', 'You appear on the leaderboard.')}</li>
              <li>🌍 {t('Tes victoires en ligne sont comptées par le serveur.', 'Your online wins are counted by the server.')}</li>
            </ul>
            {hasGuestProgress && mode === 'register' && (
              <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-emerald-100">
                {t('Ta progression actuelle (', 'Your current progress (')}
                <CoinAmount value={profile.coins} size={14} />
                {t(', niveau, styles achetés) sera transférée sur ton nouveau compte.', ', level, styles bought) will be moved to your new account.')}
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
  const { t } = useLang();
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
      setError(err instanceof Error ? err.message : t('Erreur inattendue.', 'Unexpected error.'));
    } finally {
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <p className="mt-3 flex items-center justify-center gap-2 text-sm text-white/70">
        <span>
          {t('Nom complet :', 'Full name:')} <strong className="text-white">{saved}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setValue(saved ?? '');
            setEditing(true);
          }}
          className="font-semibold text-[#00a884]"
        >
          {t('Modifier', 'Edit')}
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 rounded-2xl bg-black/20 p-3 text-left">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white/70">{saved ? t('Corriger ton nom complet', 'Correct your full name') : t('Ajoute ton nom complet', 'Add your full name')}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={60}
          required
          placeholder={t('Ex : Awa Diop', 'E.g. Awa Diop')}
          className="rounded-2xl bg-black/25 px-4 py-3 text-lg outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
        />
        <span className="text-xs text-white/50">{t('Privé : les autres joueurs ne voient que ton pseudo.', 'Private: other players only see your username.')}</span>
      </label>
      {error && <p className="rounded-xl bg-red-500/20 p-2 text-center text-sm font-medium text-red-200">{error}</p>}
      <div className="flex gap-2">
        {saved && (
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost flex-1">
            {t('Annuler', 'Cancel')}
          </button>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary flex-1">
          {busy ? t('Un instant…', 'One moment…') : t('Enregistrer', 'Save')}
        </button>
      </div>
    </form>
  );
}
