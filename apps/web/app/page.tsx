'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CoinBadge } from '@/components/Coins';
import { DailyCard } from '@/components/DailyCard';
import { HowToPlay } from '@/components/HowToPlay';
import { ProfileChip } from '@/components/ProfileChip';
import { Sheet } from '@/components/Sheet';
import { COLOR_DARK, COLOR_HEX } from '@/lib/board';
import { useProfile } from '@/lib/profile';
import {
  getSocialState,
  getThread,
  respondToFriendRequest,
  sendFriendRequest,
  sendMessage as sendChatMessage,
  type ChatMessage,
  type SocialState,
} from '@/lib/social';

const LOGO_COLORS = ['red', 'green', 'blue', 'yellow'] as const;
type Tab = 'chats' | 'friends' | 'games';

function Logo() {
  return (
    <div className="float relative mx-auto size-20">
      <div className="grid size-full rotate-45 grid-cols-2 gap-1 overflow-hidden rounded-[22px] p-1 shadow-2xl shadow-black/50 ring-4 ring-white/20">
        {LOGO_COLORS.map((c) => (
          <span
            key={c}
            className="grid place-items-center rounded-[11px]"
            style={{ background: `linear-gradient(145deg, ${COLOR_HEX[c]}, ${COLOR_DARK[c]})` }}
          >
            <span className="size-4 -rotate-45 rounded-full border-[3px] border-white/90 bg-white/30 shadow" />
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col items-center gap-2 p-6 text-center">
      <span className="text-5xl">{icon}</span>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="text-sm leading-relaxed text-white/65">{children}</div>
    </section>
  );
}

function MenuLink({ href, icon, gradient, title, subtitle }: { href: string; icon: string; gradient: string; title: string; subtitle: string }) {
  return (
    <Link href={href} className="group card flex items-center gap-4 p-3.5 transition active:scale-[0.98]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-2xl shadow-lg ${gradient}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-white/60">{subtitle}</span>
      </span>
      <span className="text-2xl text-white/40 transition group-hover:translate-x-1">›</span>
    </Link>
  );
}

function Tile({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="card flex flex-col items-center gap-1 py-3 text-sm font-semibold transition active:scale-95">
      <span className="text-2xl">{icon}</span>
      {label}
    </Link>
  );
}

function SocialGate() {
  return (
    <EmptyState icon="🔐" title="Connecte-toi pour discuter">
      Les chats et les amis sont liés à ton compte Ludo. Crée un compte ou connecte-toi pour ajouter des amis et leur
      écrire.
      <Link href="/compte" className="btn btn-primary mt-4 w-full">
        Ouvrir mon compte
      </Link>
    </EmptyState>
  );
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function initials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function TabButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-bold transition ${
        active ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/30' : 'text-white/65 hover:bg-white/10'
      }`}
    >
      <span className="text-xl">{icon}</span>
      {label}
      {!!badge && (
        <span className="absolute right-4 top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function HomePage() {
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<Tab>('chats');
  const [social, setSocial] = useState<SocialState | null>(null);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { profile, ready, session } = useProfile();

  useEffect(() => {
    if (!session) {
      setSocial(null);
      setActiveChat(null);
      setThread([]);
      return;
    }

    let alive = true;
    setLoadingSocial(true);
    setError(null);
    getSocialState()
      .then((data) => {
        if (!alive) return;
        setSocial(data);
        setActiveChat((current) => current ?? data.conversations[0]?.friend.username ?? null);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Impossible de charger les chats.'))
      .finally(() => alive && setLoadingSocial(false));

    return () => {
      alive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!activeChat || !session) {
      setThread([]);
      return;
    }

    let alive = true;
    setLoadingThread(true);
    getThread(activeChat)
      .then((data) => alive && setThread(data.messages))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Impossible de charger la conversation.'))
      .finally(() => alive && setLoadingThread(false));

    return () => {
      alive = false;
    };
  }, [activeChat, session]);

  const activeConversation = useMemo(
    () => social?.conversations.find((conversation) => conversation.friend.username === activeChat) ?? null,
    [activeChat, social],
  );

  const addFriend = async (e: FormEvent) => {
    e.preventDefault();
    const username = friendName.trim();
    if (!username) return;
    setError(null);
    setNotice(null);
    try {
      const res = await sendFriendRequest(username);
      setSocial(res);
      setFriendName('');
      setNotice(res.message);
      if (res.status === 'accepted' || res.status === 'already_friends') {
        setActiveChat(username);
        setTab('chats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation impossible.');
    }
  };

  const answerRequest = async (username: string, action: 'accept' | 'decline') => {
    setError(null);
    setNotice(null);
    try {
      const res = await respondToFriendRequest(username, action);
      setSocial(res);
      setNotice(res.message);
      if (action === 'accept') {
        setActiveChat(username);
        setTab('chats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const body = messageText.trim();
    if (!activeChat || !body) return;
    setError(null);
    try {
      const res = await sendChatMessage(activeChat, body);
      setSocial(res);
      setThread((messages) => [...messages, res.message]);
      setMessageText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message non envoyé.');
    }
  };

  const renderChats = () => {
    if (!session) return <SocialGate />;
    if (loadingSocial) return <EmptyState icon="⏳" title="Chargement des chats">On prépare tes conversations…</EmptyState>;
    if (!social || social.friends.length === 0) {
      return (
        <EmptyState icon="💬" title="Aucune conversation">
          Ajoute un ami avec son pseudo Ludo, puis commence une discussion privée.
          <button type="button" onClick={() => setTab('friends')} className="btn btn-primary mt-4 w-full">
            Ajouter un ami
          </button>
        </EmptyState>
      );
    }

    return (
      <section className="flex flex-col gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {social.conversations.map((conversation) => (
            <button
              key={conversation.friend.username}
              type="button"
              onClick={() => setActiveChat(conversation.friend.username)}
              className={`flex min-w-48 items-center gap-3 rounded-3xl border p-3 text-left transition ${
                activeChat === conversation.friend.username
                  ? 'border-emerald-300 bg-emerald-400/20'
                  : 'border-white/10 bg-white/[0.07]'
              }`}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-700 text-sm font-black text-white">
                {initials(conversation.friend.username)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{conversation.friend.username}</span>
                <span className="block truncate text-xs text-white/60">
                  {conversation.lastMessage?.body ?? 'Nouveau chat'}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="card flex min-h-[440px] flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-white/10 bg-white/5 p-3">
            <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-700 text-sm font-black">
              {initials(activeConversation?.friend.username ?? activeChat ?? '?')}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-bold">{activeConversation?.friend.username ?? activeChat}</h2>
              <p className="text-xs text-white/50">Ami Ludo · niveau {activeConversation?.friend.level ?? '—'}</p>
            </div>
            <Link href="/online" className="btn btn-ghost px-3 py-2 text-sm">
              🎲 Inviter
            </Link>
          </header>

          <div className="flex max-h-[360px] min-h-[280px] flex-1 flex-col gap-2 overflow-y-auto p-3">
            {loadingThread ? (
              <p className="m-auto text-sm text-white/50">Chargement…</p>
            ) : thread.length === 0 ? (
              <p className="m-auto max-w-56 text-center text-sm text-white/55">Dis bonjour et propose une partie de Ludo.</p>
            ) : (
              thread.map((message) => (
                <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-3xl px-4 py-2 text-sm shadow ${
                      message.mine ? 'rounded-br-md bg-emerald-500 text-white' : 'rounded-bl-md bg-white/12 text-white'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p className={`mt-1 text-right text-[10px] ${message.mine ? 'text-emerald-50/70' : 'text-white/45'}`}>
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-white/10 bg-black/15 p-3">
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              maxLength={500}
              placeholder="Écrire un message"
              className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 outline-none ring-emerald-300/50 placeholder:text-white/35 focus:ring-2"
            />
            <button type="submit" disabled={!messageText.trim()} className="btn btn-primary px-4">
              Envoyer
            </button>
          </form>
        </div>
      </section>
    );
  };

  const renderFriends = () => {
    if (!session) return <SocialGate />;
    return (
      <section className="flex flex-col gap-4">
        <form onSubmit={addFriend} className="card flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-xl font-bold">Ajouter un ami</h2>
            <p className="text-sm text-white/60">Entre son pseudo Ludo exact pour envoyer une invitation.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              autoCapitalize="none"
              autoComplete="off"
              maxLength={16}
              placeholder="Pseudo de ton ami"
              className="min-w-0 flex-1 rounded-2xl bg-black/25 px-4 py-3 outline-none ring-emerald-300/50 placeholder:text-white/35 focus:ring-2"
            />
            <button type="submit" className="btn btn-primary">
              Ajouter
            </button>
          </div>
        </form>

        {!!social?.incoming.length && (
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="font-bold">Invitations reçues</h2>
            {social.incoming.map((request) => (
              <div key={request.username} className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-white/10 font-bold">{initials(request.username)}</span>
                <span className="min-w-0 flex-1 font-semibold">{request.username}</span>
                <button type="button" onClick={() => answerRequest(request.username, 'decline')} className="btn btn-ghost px-3 py-2 text-sm">
                  Refuser
                </button>
                <button type="button" onClick={() => answerRequest(request.username, 'accept')} className="btn btn-primary px-3 py-2 text-sm">
                  Accepter
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-bold">Mes amis</h2>
          {social?.friends.length ? (
            social.friends.map((friend) => (
              <button
                key={friend.username}
                type="button"
                onClick={() => {
                  setActiveChat(friend.username);
                  setTab('chats');
                }}
                className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/10"
              >
                <span className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-700 text-sm font-black">
                  {initials(friend.username)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{friend.username}</span>
                  <span className="block text-sm text-white/55">Niveau {friend.level} · {friend.wins} victoire(s)</span>
                </span>
                <span className="text-white/40">›</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-white/60">Tu n’as pas encore d’ami ajouté.</p>
          )}
        </section>

        {!!social?.outgoing.length && (
          <section className="card p-4">
            <h2 className="font-bold">Invitations envoyées</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {social.outgoing.map((request) => (
                <span key={request.username} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/70">
                  {request.username}
                </span>
              ))}
            </div>
          </section>
        )}
      </section>
    );
  };

  const renderGames = () => (
    <section className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-400/35 via-sky-500/20 to-fuchsia-500/25 p-5 text-center">
          <Logo />
          <h2 className="mt-4 text-4xl font-bold tracking-tight">
            {'LUDO'.split('').map((l, i) => (
              <span key={i} style={{ color: COLOR_HEX[LOGO_COLORS[i]] }} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
                {l}
              </span>
            ))}
          </h2>
          <p className="mt-1 text-sm text-white/75">Premier jeu disponible. D’autres jeux arriveront plus tard.</p>
        </div>
        <div className="flex flex-col gap-2.5 p-3">
          <MenuLink
            href="/rapide"
            icon="⚡"
            gradient="from-amber-300 to-orange-500"
            title="Partie rapide"
            subtitle="Joue en ligne contre d’autres joueurs"
          />
          <MenuLink
            href="/local"
            icon="🎲"
            gradient="from-emerald-400 to-emerald-600"
            title="Jouer sur cet écran"
            subtitle="Entre amis et/ou contre l’ordinateur"
          />
          <MenuLink
            href="/online"
            icon="🔒"
            gradient="from-sky-400 to-indigo-600"
            title="Salon privé"
            subtitle="Invite tes amis avec un code"
          />
        </div>
      </div>

      {ready && !profile.tutorialDone && (
        <Link
          href="/tutoriel"
          className="pop-in flex items-center gap-3 rounded-3xl bg-gradient-to-r from-fuchsia-500/80 to-indigo-500/80 p-4 shadow-lg transition active:scale-[0.98]"
        >
          <span className="text-3xl">🎓</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Nouveau ? Apprends en 2 minutes</span>
            <span className="block text-sm text-white/80">Tutoriel guidé · +50 pièces</span>
          </span>
          <span className="text-2xl">›</span>
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Tile href="/boutique" icon="🛍️" label="Boutique" />
        <Tile href="/classement" icon="🏆" label="Classement" />
        <Tile href="/profil" icon="🏅" label="Badges" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="card p-4 opacity-70">
          <p className="text-2xl">🃏</p>
          <p className="font-bold">Cartes</p>
          <p className="text-xs text-white/55">Bientôt</p>
        </div>
        <div className="card p-4 opacity-70">
          <p className="text-2xl">⚽</p>
          <p className="font-bold">Défis</p>
          <p className="text-xs text-white/55">Bientôt</p>
        </div>
      </div>

      <DailyCard />

      <button type="button" onClick={() => setHelp(true)} className="btn btn-ghost">
        📖 Règles du jeu
      </button>
    </section>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
      <header className="sticky top-0 z-10 -mx-4 bg-[#0f1029]/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">Ludo Social</p>
            <h1 className="text-3xl font-black">Discussions</h1>
          </div>
          <CoinBadge />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
        <ProfileChip />
          <Link href="/compte" className="btn btn-ghost px-3 py-2 text-sm">
            Compte
          </Link>
        </div>
      </header>

      {(notice || error) && (
        <div className={`pop-in rounded-2xl p-3 text-center text-sm font-semibold ${error ? 'bg-red-500/20 text-red-100' : 'bg-emerald-500/20 text-emerald-100'}`}>
          {error ?? notice}
        </div>
      )}

      {tab === 'chats' && renderChats()}
      {tab === 'friends' && renderFriends()}
      {tab === 'games' && renderGames()}

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-white/10 bg-[#10122c]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="flex gap-2 rounded-3xl bg-black/20 p-1.5">
          <TabButton active={tab === 'chats'} icon="💬" label="Chats" onClick={() => setTab('chats')} />
          <TabButton
            active={tab === 'friends'}
            icon="👥"
            label="Amis"
            badge={social?.incoming.length}
            onClick={() => setTab('friends')}
          />
          <TabButton active={tab === 'games'} icon="🎮" label="Games" onClick={() => setTab('games')} />
        </div>
      </nav>

      <Sheet open={help} title="Comment jouer" onClose={() => setHelp(false)}>
        <HowToPlay />
      </Sheet>
    </main>
  );
}
