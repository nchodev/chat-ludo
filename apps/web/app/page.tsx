'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/chat/Avatar';
import { ChatList, chatRows } from '@/components/chat/ChatList';
import { GroupInfoSheet, NewGroupSheet } from '@/components/chat/GroupSheets';
import { ChatThread, type ThreadItem } from '@/components/chat/ChatThread';
import { CoinBadge } from '@/components/Coins';
import { NotificationBell } from '@/components/NotificationBell';
import { DailyBonusPrompt } from '@/components/DailyCard';
import { FriendsTab } from '@/components/friends/FriendsTab';
import { GamesCatalog } from '@/components/GameCard';
import { Icon } from '@/components/Icons';
import { LuChatLogo, LuChatWordmark } from '@/components/LuChatLogo';
import { ProfileView } from '@/components/ProfileView';
import { TabIcon } from '@/components/TabIcons';
import { NotificationsPrompt } from '@/components/chat/NotificationsPrompt';
import { onOpenChatRequest, setViewingChat, useChat } from '@/lib/chat';
import { api } from '@/lib/api';
import { getSessionToken, useProfile } from '@/lib/profile';
import { useLang } from '@/lib/i18n';
import { uploadVoice, type Recording } from '@/lib/voice';
import { rememberMedia, uploadImage } from '@/lib/media';
import type { OutgoingPhoto } from '@/components/chat/PhotoComposer';
import { parseChatImage, type ChatReplyPreview, type GroupView } from '@ludo/engine';
import {
  getSocialState,
  getThread,
  type ChatMessage,
  type SocialState,
} from '@/lib/social';

type Tab = 'chats' | 'friends' | 'games' | 'profile';
const TABS: Tab[] = ['chats', 'friends', 'games', 'profile'];

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2 px-4 pt-12 text-center">
      <span className="mb-2 grid size-20 place-items-center rounded-full bg-[#00a884]/12 text-[#00a884]">{icon}</span>
      <h2 className="text-[19px] font-semibold text-[#e9edef]">{title}</h2>
      <div className="max-w-xs text-[14px] leading-relaxed text-[#8696a0]">{children}</div>
    </section>
  );
}

function SocialGate() {
  const { t } = useLang();
  const GATE_PERKS = [
    { icon: Icon.Chat, title: t('Messages privés', 'Private messages'), text: t('Discute en direct avec tes amis.', 'Chat live with your friends.') },
    { icon: Icon.PersonAdd, title: t('Ajoute tes amis', 'Add your friends'), text: t('Retrouve-les avec leur pseudo LuChat.', 'Find them by their LuChat username.') },
    { icon: Icon.Bell, title: t('Notifications', 'Notifications'), text: t('Sois prévenu à chaque nouveau message.', 'Get notified of every new message.') },
  ];
  return (
    <section className="flex flex-col items-center px-2 pt-8 text-center">
      <div className="relative mb-6">
        <span className="absolute inset-0 -m-6 rounded-full bg-[#00a884]/10 blur-xl" />
        <span className="relative grid size-28 place-items-center rounded-full bg-gradient-to-br from-[#00a884]/25 to-[#00a884]/5 ring-1 ring-[#00a884]/30">
          <Icon.Chat size={52} className="text-[#00a884]" />
        </span>
        <span className="absolute -right-1 -bottom-1 grid size-10 place-items-center rounded-full bg-[#1f2c33] text-[#e9edef] ring-4 ring-[#0b141a]">
          <Icon.Lock size={20} />
        </span>
      </div>

      <h2 className="text-[22px] font-semibold text-[#e9edef]">{t('Connecte-toi pour discuter', 'Sign in to chat')}</h2>
      <p className="mt-2 max-w-xs text-[14.5px] leading-relaxed text-[#8696a0]">
        {t('Les discussions et les amis sont liés à ton compte LuChat.', 'Chats and friends are tied to your LuChat account.')}
      </p>

      <ul className="mt-7 w-full overflow-hidden rounded-2xl bg-[#1f2c33] text-left">
        {GATE_PERKS.map(({ icon: PerkIcon, title, text }, i) => (
          <li key={title} className="flex items-center gap-4 px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
              <PerkIcon size={22} />
            </span>
            <span className={`min-w-0 flex-1 py-3.5 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>
              <span className="block text-[15px] font-medium text-[#e9edef]">{title}</span>
              <span className="block text-[13px] text-[#8696a0]">{text}</span>
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/compte"
        className="mt-7 flex h-12 w-full items-center justify-center rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] shadow-lg shadow-[#00a884]/20 transition active:scale-[0.98] active:opacity-90"
      >
        {t('Créer un compte', 'Create an account')}
      </Link>
      <Link
        href="/compte?mode=login"
        className="mt-3 flex h-12 w-full items-center justify-center rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884] transition active:bg-white/5"
      >
        {t('J’ai déjà un compte', 'I already have an account')}
      </Link>
      <p className="mt-5 flex items-center gap-1.5 text-[12.5px] text-[#8696a0]">
        <Icon.Shield size={16} />
        {t('Gratuit, sans e-mail ni numéro de téléphone', 'Free, no email or phone number needed')}
      </p>
    </section>
  );
}

const TAB_TITLE: Record<Tab, [string, string]> = {
  chats: ['Discussions', 'Chats'],
  friends: ['Amis', 'Friends'],
  games: ['Jeux', 'Games'],
  profile: ['Profil', 'Profile'],
};

function TabButton({
  active,
  name,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  name: Tab;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
        active ? 'text-[#00a884]' : 'text-[#8696a0]'
      }`}
    >
      <span className="relative">
        <TabIcon name={name} filled={active} />
        {!!badge && (
          <span className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-[#00a884] px-1 text-[10px] font-bold text-[#0b141a]">
            {badge}
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('chats');
  const [tabRestored, setTabRestored] = useState(false);
  const [social, setSocial] = useState<SocialState | null>(null);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [threadLevel, setThreadLevel] = useState<number | null>(null);
  const [threadGroup, setThreadGroup] = useState<GroupView | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session } = useProfile();
  const { t } = useLang();
  const tabTitle = (name: Tab) => t(...TAB_TITLE[name]);

  useEffect(() => {
    if (!notice && !error) return;
    const timer = setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [notice, error]);
  const nextPendingId = useRef(-1);
  const photoUploads = useRef<Promise<unknown>>(Promise.resolve());

  const reloadSocial = useCallback(() => {
    getSocialState()
      .then(setSocial)
      .catch(() => {});
  }, []);

  /** Moves a conversation (friend's username or group key) to the top with its newest message. */
  const bumpConversation = (key: string, message: ChatMessage, unreadDelta: number) => {
    setSocial((s) => {
      if (!s) return s;
      const bump = <C extends { lastMessage: ChatMessage | null; unread: number }>(list: C[], match: (c: C) => boolean): C[] | null => {
        const conversation = list.find(match);
        if (!conversation) return null;
        const newer = !conversation.lastMessage || conversation.lastMessage.id <= message.id;
        const updated = { ...conversation, lastMessage: newer ? message : conversation.lastMessage, unread: conversation.unread + unreadDelta };
        return [updated, ...list.filter((c) => c !== conversation)];
      };
      const groups = bump(s.groups, (g) => g.group.key === key);
      if (groups) return { ...s, groups };
      const conversations = bump(s.conversations, (c) => c.friend.username === key);
      return conversations ? { ...s, conversations } : s;
    });
  };

  const knownConversation = (key: string) =>
    !!social && (social.conversations.some((c) => c.friend.username === key) || social.groups.some((g) => g.group.key === key));

  const chat = useChat(!!session, {
    onMessage: (message) => {
      const friend = message.group || message.mine ? message.to : message.from;
      if (!knownConversation(friend)) {
        reloadSocial();
        return;
      }
      const open = activeChat === friend;
      if (open) {
        setThread((t) => (t.some((m) => m.id === message.id) ? t : [...t, message]));
        if (!message.mine) chat.markRead(friend);
      }
      bumpConversation(friend, message, !message.mine && !open ? 1 : 0);
    },
    onRead: ({ by, upTo, at }) => {
      const mark = <M extends ChatMessage>(m: M): M => (m.mine && m.to === by && m.id > 0 && m.id <= upTo && !m.readAt ? { ...m, readAt: at } : m);
      setThread((t) => t.map(mark));
      setSocial(
        (s) =>
          s && {
            ...s,
            conversations: s.conversations.map((c) => (c.lastMessage ? { ...c, lastMessage: mark(c.lastMessage) } : c)),
            groups: s.groups.map((g) => (g.lastMessage ? { ...g, lastMessage: mark(g.lastMessage) } : g)),
          },
      );
    },
    onSocialChanged: reloadSocial,
    onUpdated: (message) => {
      setThread((t) => t.map((m) => (m.id === message.id ? message : m)));
      setSocial(
        (s) =>
          s && {
            ...s,
            conversations: s.conversations.map((c) => (c.lastMessage?.id === message.id ? { ...c, lastMessage: message } : c)),
            groups: s.groups.map((g) => (g.lastMessage?.id === message.id ? { ...g, lastMessage: message } : g)),
          },
      );
    },
    onRemoved: (id) => {
      setThread((t) => t.filter((m) => m.id !== id));
      if (social?.conversations.some((c) => c.lastMessage?.id === id) || social?.groups.some((g) => g.lastMessage?.id === id)) reloadSocial();
    },
  });

  // Only a sign-out closes the chats: before the saved session is read, there is none yet.
  const hadSession = useRef(false);
  useEffect(() => {
    if (!session) {
      if (hadSession.current) {
        setSocial(null);
        setActiveChat(null);
        setThread([]);
      }
      hadSession.current = false;
      return;
    }
    hadSession.current = true;

    let alive = true;
    setLoadingSocial(true);
    setError(null);
    getSocialState()
      .then((data) => {
        if (!alive) return;
        setSocial(data);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : t('Impossible de charger les chats.', 'Could not load the chats.')))
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
      .then((data) => {
        if (!alive) return;
        setThread(data.messages);
        setThreadLevel(data.friend.level);
        setThreadGroup(data.group ?? null);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : t('Impossible de charger la conversation.', 'Could not load the conversation.')))
      .finally(() => alive && setLoadingThread(false));

    return () => {
      alive = false;
    };
  }, [activeChat, session]);

  // Catch up on whatever arrived while the connection was down.
  const { connected } = chat;
  useEffect(() => {
    if (!connected) return;
    reloadSocial();
    if (!activeChat) return;
    getThread(activeChat)
      .then((data) => setThread((t) => [...data.messages, ...t.filter((m) => m.id < 0)]))
      .catch(() => {});
    // Only on (re)connection; opening a chat loads its thread above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, reloadSocial]);

  const activeConversation = useMemo(
    () => social?.conversations.find((conversation) => conversation.friend.username === activeChat) ?? null,
    [activeChat, social],
  );
  /** Kept current by the social state, so renames and member changes show at once. */
  const activeGroup = useMemo(
    () => (activeChat?.startsWith('g:') ? (social?.groups.find((g) => g.group.key === activeChat)?.group ?? threadGroup) : null),
    [activeChat, social, threadGroup],
  );
  const forwardTargets = useMemo(
    () => (social ? chatRows(social.conversations, social.groups).map(({ key, name, group }) => ({ key, name, group })) : []),
    [social],
  );

  // Removed from the group while looking at it: back to the list.
  useEffect(() => {
    if (activeChat?.startsWith('g:') && social && threadGroup && !social.groups.some((g) => g.group.key === activeChat)) {
      setActiveChat(null);
      setGroupInfoOpen(false);
    }
  }, [activeChat, social, threadGroup]);

  const totalUnread = (social?.conversations.reduce((sum, c) => sum + c.unread, 0) ?? 0) + (social?.groups.reduce((sum, g) => sum + g.unread, 0) ?? 0);

  const openChat = (key: string) => {
    setActiveChat(key);
    setThreadGroup(null);
    setGroupInfoOpen(false);
    setTab('chats');
    setSocial(
      (s) =>
        s && {
          ...s,
          conversations: s.conversations.map((c) => (c.friend.username === key ? { ...c, unread: 0 } : c)),
          groups: s.groups.map((g) => (g.group.key === key ? { ...g, unread: 0 } : g)),
        },
    );
  };
  const openChatRef = useRef(openChat);
  useEffect(() => {
    openChatRef.current = openChat;
  });

  useEffect(() => {
    setViewingChat(tab === 'chats' ? activeChat : null);
    return () => setViewingChat(null);
  }, [tab, activeChat]);

  // Notification taps: from another screen via ?chat=…, or while this screen is open.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('chat');
    const requestedTab = params.get('tab') as Tab | null;
    if (requested) openChatRef.current(requested);
    else if (requestedTab && TABS.includes(requestedTab)) setTab(requestedTab);
    setTabRestored(true);
    return onOpenChatRequest((username) => openChatRef.current(username));
  }, []);

  // The open tab lives in the address, so a refresh stays on it.
  useEffect(() => {
    if (!tabRestored) return;
    const url = tab === 'chats' ? '/' : `/?tab=${tab}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(window.history.state, '', url);
  }, [tab, tabRestored]);

  const deliver = (item: ThreadItem) => {
    const image = item.kind === 'image' ? parseChatImage(item.body) : null;
    const send = () =>
      item.kind === 'voice' && item.localBlob
        ? uploadVoice(item.to, item.localBlob, item.durationMs ?? 0, item.replyTo?.id)
        : image && item.localBlob
          ? uploadImage(item.to, item.localBlob, image, image.caption, item.replyTo?.id)
          : chat.send(item.to, item.body, item.replyTo?.id);
    let sending: ReturnType<typeof send>;
    if (image) {
      // Photos picked together go up one after the other, so they arrive in the order chosen.
      sending = photoUploads.current.then(send, send);
      photoUploads.current = sending.catch(() => {});
    } else sending = send();
    sending
      .then((saved) => {
        setThread((t) => (t.some((m) => m.id === saved.id) ? t.filter((m) => m.id !== item.id) : t.map((m) => (m.id === item.id ? saved : m))));
        if (image && item.localUrl) rememberMedia(saved.id, item.localUrl);
        else if (item.localUrl) setTimeout(() => URL.revokeObjectURL(item.localUrl!), 60_000);
        bumpConversation(item.to, saved, 0);
      })
      .catch(() => setThread((t) => t.map((m) => (m.id === item.id ? { ...m, pending: false, failed: true } : m))));
  };

  const queue = (fields: Partial<ThreadItem>) => {
    if (!activeChat || !session) return;
    const item: ThreadItem = {
      id: nextPendingId.current--,
      from: session.username,
      to: activeChat,
      group: activeGroup?.id ?? null,
      mine: true,
      body: '',
      createdAt: Date.now(),
      readAt: null,
      kind: 'text',
      durationMs: null,
      replyTo: null,
      forwarded: false,
      deleted: false,
      reactions: [],
      pending: true,
      ...fields,
    };
    setThread((t) => [...t, item]);
    deliver(item);
  };

  const sendMessage = (body: string, replyTo: ChatReplyPreview | null) => queue({ body, replyTo });

  const sendVoice = (recording: Recording, replyTo: ChatReplyPreview | null) =>
    queue({
      kind: 'voice',
      durationMs: recording.durationMs,
      replyTo,
      localBlob: recording.blob,
      localUrl: URL.createObjectURL(recording.blob),
    });

  const sendImages = (photos: OutgoingPhoto[], replyTo: ChatReplyPreview | null) =>
    photos.forEach(({ image, caption }, i) =>
      queue({
        kind: 'image',
        body: JSON.stringify({ width: image.width, height: image.height, caption }),
        replyTo: i === 0 ? replyTo : null,
        localBlob: image.blob,
        localUrl: image.url,
      }),
    );

  const reactTo = async (id: number, emoji: string | null) => {
    await chat.react(id, emoji);
  };

  const deleteMessage = async (id: number, forAll: boolean) => {
    await chat.remove(id, forAll);
  };

  const editMessage = async (id: number, body: string) => {
    await chat.edit(id, body);
  };

  const forwardMessage = async (id: number, to: string[]) => {
    const sent = await chat.forward(id, to);
    for (const message of sent) bumpConversation(message.to, message, 0);
  };

  const reportMessage = async (id: number, reason: string) => {
    await api('/messages/report', { token: getSessionToken(), body: { id, reason } });
  };

  const retryMessage = (item: ThreadItem) => {
    setThread((t) => t.map((m) => (m.id === item.id ? { ...m, pending: true, failed: false } : m)));
    deliver(item);
  };

  const renderChats = () => {
    if (!session) return <SocialGate />;
    if (loadingSocial)
      return (
        <EmptyState icon={<Icon.Hourglass size={36} />} title={t('Chargement des chats', 'Loading chats')}>
          {t('On prépare tes conversations…', 'Getting your conversations ready…')}
        </EmptyState>
      );
    if (!social || (social.friends.length === 0 && social.groups.length === 0)) {
      return (
        <EmptyState icon={<Icon.Chat size={36} />} title={t('Aucune conversation', 'No conversations')}>
          {t('Ajoute un ami avec son pseudo LuChat, puis commence une discussion privée.', 'Add a friend by their LuChat username, then start a private chat.')}
          <button
            type="button"
            onClick={() => setTab('friends')}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] active:opacity-90"
          >
            <Icon.PersonAdd size={20} />
            {t('Ajouter un ami', 'Add a friend')}
          </button>
        </EmptyState>
      );
    }

    if (!activeChat) {
      return (
        <>
          <NotificationsPrompt />
          <ChatList
            me={session.username}
            conversations={social.conversations}
            groups={social.groups}
            online={chat.online}
            typing={chat.typing}
            onOpen={openChat}
            onNewGroup={() => setNewGroupOpen(true)}
          />
          <NewGroupSheet
            open={newGroupOpen}
            friends={social.friends.map((f) => f.username)}
            onClose={() => setNewGroupOpen(false)}
            onCreated={(group, state) => {
              setSocial(state);
              openChat(group.key);
            }}
          />
        </>
      );
    }

    return (
      <>
      <ChatThread
        key={activeChat}
        me={session.username}
        friend={activeChat}
        group={activeGroup}
        forwardTargets={forwardTargets.filter((t) => t.key !== activeChat)}
        level={activeConversation?.friend.level ?? threadLevel}
        online={!activeGroup && chat.online.has(activeChat)}
        typers={chat.typing.get(activeChat) ?? []}
        connected={chat.connected}
        messages={thread}
        loading={loadingThread}
        onBack={() => setActiveChat(null)}
        onSend={sendMessage}
        onSendVoice={sendVoice}
        onSendImages={sendImages}
        onRetry={retryMessage}
        onTyping={() => chat.notifyTyping(activeChat)}
        onReact={reactTo}
        onDelete={deleteMessage}
        onEdit={editMessage}
        onForward={forwardMessage}
        onReport={reportMessage}
        onOpenGroupInfo={() => setGroupInfoOpen(true)}
      />
      {activeGroup && (
        <GroupInfoSheet
          key={`info-${activeGroup.key}`}
          open={groupInfoOpen}
          group={activeGroup}
          me={session.username}
          friends={social.friends.map((f) => f.username)}
          online={chat.online}
          onClose={() => setGroupInfoOpen(false)}
          onSocial={setSocial}
          onLeft={() => {
            setGroupInfoOpen(false);
            setActiveChat(null);
          }}
          onMessage={(message) => {
            setError(null);
            setNotice(message);
          }}
        />
      )}
      </>
    );
  };

  const renderFriends = () => {
    if (!session) return <SocialGate />;
    return (
      <FriendsTab
        me={session.username}
        social={social}
        online={chat.online}
        onSocial={setSocial}
        onOpenChat={openChat}
        onNotice={(message) => {
          setError(null);
          setNotice(message);
        }}
        onError={(message) => {
          setNotice(null);
          setError(message);
        }}
      />
    );
  };

  const renderGames = () => <GamesCatalog />;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#0b141a] text-[#e9edef]">
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-24">
      <header className={`sticky top-0 z-10 -mx-4 items-center justify-between gap-3 bg-[#1f2c33] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${activeChat && tab === 'chats' ? 'hidden' : 'flex'}`}>
        {tab === 'chats' ? (
          <h1 className="flex shrink-0 items-center gap-2">
            <LuChatLogo size={30} />
            <LuChatWordmark />
            <span className="sr-only">{tabTitle('chats')}</span>
          </h1>
        ) : (
          <h1 className="shrink-0 text-[1.35rem] font-medium tracking-tight">{tabTitle(tab)}</h1>
        )}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <CoinBadge />
          <NotificationBell />
          {tab === 'profile' && (
            <Link
              href="/reglages"
              aria-label={t('Réglages', 'Settings')}
              className="grid size-10 place-items-center rounded-full text-[#aebac1] transition active:bg-white/10"
            >
              <Icon.Settings size={24} />
            </Link>
          )}
        </div>
      </header>

      {(notice || error) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
          <p
            role="status"
            className={`pop-in pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-[14px] shadow-xl ${
              error ? 'bg-[#f15c6d] text-[#0b141a]' : 'bg-[#e9edef] text-[#0b141a]'
            }`}
          >
            {error ? <Icon.Info size={18} className="shrink-0" /> : <Icon.Check size={18} className="shrink-0" />}
            {error ?? notice}
          </p>
        </div>
      )}

      {tabRestored && tab === 'chats' && renderChats()}
      {tabRestored && tab === 'friends' && renderFriends()}
      {tabRestored && tab === 'games' && renderGames()}
      {tabRestored && tab === 'profile' && (
        <div className="pt-4">
          <ProfileView />
        </div>
      )}

      {tabRestored && !activeChat && <DailyBonusPrompt />}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[#222d34] bg-[#0b141a] pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md">
          <TabButton
            active={tab === 'chats'}
            name="chats"
            label={tabTitle('chats')}
            badge={totalUnread}
            onClick={() => {
              setActiveChat(null);
              setTab('chats');
            }}
          />
          <TabButton
            active={tab === 'friends'}
            name="friends"
            label={tabTitle('friends')}
            badge={social?.incoming.length}
            onClick={() => setTab('friends')}
          />
          <TabButton active={tab === 'games'} name="games" label={tabTitle('games')} onClick={() => setTab('games')} />
          <TabButton active={tab === 'profile'} name="profile" label={tabTitle('profile')} onClick={() => setTab('profile')} />
        </div>
      </nav>
    </main>
    </div>
  );
}
