'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSocket, getStoredName, storeName, storeRoomToken } from '@/lib/socket';

export default function OnlinePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(getStoredName()), []);

  const create = () => {
    if (!name.trim()) return setError('Choisis d’abord un pseudo.');
    storeName(name.trim());
    setBusy(true);
    setError(null);
    const socket = getSocket();
    const timeout = setTimeout(() => {
      setBusy(false);
      setError('Impossible de joindre le serveur de jeu.');
    }, 5000);
    socket.emit('room:create', { name: name.trim() }, (res) => {
      clearTimeout(timeout);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      storeRoomToken(res.code, res.token);
      router.push(`/online/${res.code}`);
    });
  };

  const join = () => {
    const cleaned = code.trim().toUpperCase();
    if (!name.trim()) return setError('Choisis d’abord un pseudo.');
    if (cleaned.length < 5) return setError('Le code contient 5 caractères.');
    storeName(name.trim());
    router.push(`/online/${cleaned}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="icon-btn" aria-label="Menu">
          ←
        </Link>
        <h1 className="text-xl font-bold">Jouer en ligne</h1>
      </header>

      <section className="card flex flex-col gap-2 p-4">
        <label htmlFor="pseudo" className="text-sm font-semibold text-white/70">
          Ton pseudo
        </label>
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-indigo-600 text-xl font-bold shadow-lg">
            {name.trim()[0]?.toUpperCase() ?? '?'}
          </span>
          <input
            id="pseudo"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Awa"
            className="min-w-0 flex-1 rounded-2xl bg-black/25 px-4 py-3 text-lg font-medium outline-none ring-white/40 placeholder:text-white/30 focus:ring-2"
          />
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏰</span>
          <div>
            <h2 className="font-bold">Créer un salon privé</h2>
            <p className="text-sm text-white/60">Tu choisis les règles et peux ajouter des ordinateurs.</p>
          </div>
        </div>
        <button type="button" onClick={create} disabled={busy} className="btn btn-primary">
          {busy ? 'Création…' : 'Créer un salon'}
        </button>
      </section>

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-white/40">
        <span className="h-px flex-1 bg-white/10" /> ou <span className="h-px flex-1 bg-white/10" />
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔑</span>
          <div>
            <h2 className="font-bold">Rejoindre un salon</h2>
            <p className="text-sm text-white/60">Entre le code reçu de ton ami.</p>
          </div>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && join()}
          maxLength={5}
          placeholder="•••••"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Code du salon"
          className="rounded-2xl bg-black/25 px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.5em] uppercase outline-none ring-white/40 placeholder:text-white/20 focus:ring-2"
        />
        <button type="button" onClick={join} className="btn btn-light">
          Rejoindre
        </button>
      </section>

      {error && <p className="pop-in rounded-2xl bg-red-500/20 p-3 text-center text-sm font-medium text-red-200">{error}</p>}
    </main>
  );
}
