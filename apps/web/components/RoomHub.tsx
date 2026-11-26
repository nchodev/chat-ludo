'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AppBar } from './AppBar';
import { Icon } from './Icons';
import { QrScanner } from './QrScanner';
import { Sheet } from './Sheet';
import { StakePicker } from './StakePicker';
import { useProfile } from '@/lib/profile';
import { getStoredName, storeName } from '@/lib/socket';

const CODE_LENGTH = 5;
const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export interface RoomPerk {
  icon: IconComponent;
  title: string;
  text: string;
  /** Hidden for staked rooms (e.g. computer players). */
  friendlyOnly?: boolean;
}

const STEPS = ['Crée un salon', 'Envoie le code', 'Lancez la partie'];

/**
 * Private room screen shared by the games: who you play as, then create a room (friendly or
 * staked) or join one with its code, a pasted invitation or a scanned QR code.
 */
export function RoomHub({
  title,
  subtitle,
  backHref,
  backText,
  backLabel,
  logo,
  heroTitle,
  heroText,
  heroClass,
  perks,
  joinPath,
  onCreate,
}: {
  title: string;
  subtitle: string;
  backHref: string;
  backText: string;
  backLabel: string;
  logo: ReactNode;
  heroTitle: string;
  heroText: string;
  /** Background of the hero card, in the game's colours. */
  heroClass: string;
  perks: RoomPerk[];
  joinPath: (code: string) => string;
  /** Creates the room and resolves with its code, or rejects with a readable error. */
  onCreate: (name: string, wager: string | null) => Promise<string>;
}) {
  const router = useRouter();
  const { session } = useProfile();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [wager, setWager] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [scanning, setScanning] = useState(false);
  /** Guests without a nickname are asked for one before creating or joining. */
  const [askName, setAskName] = useState<'create' | 'join' | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(session?.username ?? getStoredName()), [session]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'join') setMode('join');
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const create = async () => {
    if (wager && !session) return setError('Connecte-toi pour créer un salon avec mise.');
    if (!name.trim()) return setAskName('create');
    storeName(name.trim());
    setBusy(true);
    setError(null);
    try {
      router.push(joinPath(await onCreate(name.trim(), wager)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
      setBusy(false);
    }
  };

  const join = (value = code) => {
    if (value.length < CODE_LENGTH) return setError(`Le code contient ${CODE_LENGTH} caractères.`);
    if (!name.trim()) return setAskName('join');
    storeName(name.trim());
    router.push(joinPath(value));
  };

  const paste = async () => {
    const text = (await navigator.clipboard?.readText().catch(() => '')) ?? '';
    // An invitation message ("… Code du salon : K7P2Q …") or a bare code.
    const fromMessage = /code du salon\s*:\s*([A-Z0-9]{5})/i.exec(text)?.[1] ?? /\/([A-Z0-9]{5})\b/i.exec(text)?.[1];
    const pasted = cleanCode(fromMessage ?? text);
    if (pasted) setCode(pasted);
    else {
      codeInput.current?.focus();
      setError('Aucun code dans le presse-papiers.');
    }
  };

  const ready = code.length === CODE_LENGTH;
  const shownPerks = perks.filter((perk) => !wager || !perk.friendlyOnly);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={title} subtitle={subtitle} backHref={backHref} backText={backText} backLabel={backLabel} />

      <main className="mx-auto flex max-w-lg flex-col gap-4 pt-4 pb-24">
        <section className={`mx-4 overflow-hidden rounded-[28px] p-4 ${heroClass}`}>
          <div className="flex items-center gap-4">
            <span className="shrink-0">{logo}</span>
            <span className="min-w-0">
              <h2 className="text-[19px] leading-tight font-semibold">{heroTitle}</h2>
              <p className="mt-0.5 text-[13.5px] leading-snug text-[#d1d7db]/80">{heroText}</p>
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-3 gap-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex flex-col items-center gap-1.5 rounded-2xl bg-black/20 px-1 py-2.5 text-center">
                <span className="grid size-6 place-items-center rounded-full bg-white/15 text-[12px] font-bold">{i + 1}</span>
                <span className="text-[12px] leading-tight text-[#e9edef]/90">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <div role="tablist" aria-label="Salon" className="mx-4 grid grid-cols-2 gap-1 rounded-full bg-[#1f2c33] p-1">
          {(
            [
              { id: 'create', label: 'Créer', icon: Icon.Add },
              { id: 'join', label: 'Rejoindre', icon: Icon.Login },
            ] as const
          ).map(({ id, label, icon: TabIcon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`flex h-11 items-center justify-center gap-2 rounded-full text-[14.5px] font-semibold transition ${
                mode === id ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#aebac1] active:bg-white/5'
              }`}
            >
              <TabIcon size={20} />
              {label}
            </button>
          ))}
        </div>

        {mode === 'create' ? (
          <section className="mx-4 rounded-[28px] bg-[#1f2c33] p-4">
            <h3 className="mb-2 px-1 text-[13px] font-medium text-[#00a884]">Type de partie</h3>
            <StakePicker value={wager} onChange={setWager} players={2} />

            <h3 className="mt-5 mb-1 px-1 text-[13px] font-medium text-[#00a884]">Dans ton salon</h3>
            <ul className="divide-y divide-white/[0.06]">
              {shownPerks.map(({ icon: PerkIcon, title: perkTitle, text }) => (
                <li key={perkTitle} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00a884]/12 text-[#00a884]">
                    <PerkIcon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] text-[#e9edef]">{perkTitle}</span>
                    <span className="block text-[12.5px] text-[#8696a0]">{text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? <span className="size-5 animate-spin rounded-full border-2 border-[#0b141a]/30 border-t-[#0b141a]" /> : <Icon.Add size={22} />}
              {busy ? 'Création…' : wager ? 'Créer un salon avec mise' : 'Créer le salon'}
            </button>
          </section>
        ) : (
          <section className="mx-4 rounded-[28px] bg-[#1f2c33] p-4">
            <h3 className="px-1 text-[13px] font-medium text-[#00a884]">Code du salon</h3>
            <p className="mt-0.5 px-1 text-[13px] text-[#8696a0]">5 lettres ou chiffres, reçus de ton ami.</p>

            <label className="relative mt-3 flex justify-between gap-2">
              <input
                ref={codeInput}
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                spellCheck={false}
                enterKeyHint="go"
                aria-label="Code du salon"
                className="absolute inset-0 z-10 w-full cursor-text opacity-0"
              />
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const active = codeFocused && i === Math.min(code.length, CODE_LENGTH - 1);
                return (
                  <span
                    key={i}
                    className={`grid h-16 flex-1 place-items-center rounded-2xl border-2 bg-[#0b141a]/70 font-mono text-[28px] font-bold transition ${
                      active ? 'border-[#00a884]' : code[i] ? 'border-[#00a884]/40' : 'border-[#2a3942]'
                    }`}
                  >
                    {code[i] ?? (active ? <span className="h-7 w-0.5 animate-pulse bg-[#00a884]" /> : <span className="size-1.5 rounded-full bg-[#2a3942]" />)}
                  </span>
                );
              })}
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={paste}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a3942] text-[14px] font-medium text-[#e9edef] active:bg-[#32434d]"
              >
                <Icon.Paste size={19} />
                Coller
              </button>
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a3942] text-[14px] font-medium text-[#e9edef] active:bg-[#32434d]"
              >
                <Icon.QrScan size={19} />
                Scanner
              </button>
            </div>

            <button
              type="button"
              onClick={() => join()}
              disabled={!ready}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:bg-[#2a3942] disabled:text-[#8696a0]"
            >
              <Icon.Login size={20} />
              {ready ? `Rejoindre le salon ${code}` : 'Rejoindre'}
            </button>
          </section>
        )}
      </main>

      {scanning && <QrScanner onClose={() => setScanning(false)} />}

      <Sheet open={askName !== null} title="Ton pseudo" onClose={() => setAskName(null)}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const next = askName;
            setAskName(null);
            if (next === 'create') void create();
            else join();
          }}
        >
          <p className="text-[14px] text-[#8696a0]">C’est le nom que verront les autres joueurs dans le salon.</p>
          <label className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#2a3942] text-[20px] font-semibold text-[#aebac1]">
              {name.trim()[0]?.toUpperCase() ?? <Icon.Person size={24} />}
            </span>
            <input
              autoFocus
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Awa"
              autoComplete="nickname"
              enterKeyHint="go"
              className="h-12 min-w-0 flex-1 border-b-2 border-[#2a3942] bg-transparent px-1 text-[18px] text-[#e9edef] outline-none placeholder:text-[#8696a0]/60 focus:border-[#00a884]"
            />
          </label>
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] disabled:bg-[#2a3942] disabled:text-[#8696a0]"
          >
            {askName === 'join' ? <Icon.Login size={20} /> : <Icon.Add size={22} />}
            {askName === 'join' ? 'Rejoindre' : 'Créer le salon'}
          </button>
        </form>
      </Sheet>

      {error && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="pop-in mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-[#e9edef] px-4 py-3.5 text-[14px] font-medium text-[#0b141a] shadow-2xl">
            <Icon.Info size={20} className="shrink-0 text-[#f15c6d]" />
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
