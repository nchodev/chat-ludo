'use client';

import { useState } from 'react';
import { describeGroupEvent, parseGroupEvent } from '@ludo/engine';
import type { ChatMessage, Conversation, GroupConversation } from '@/lib/social';
import { Avatar } from './Avatar';
import { Ticks } from './Ticks';
import { Icon } from '../Icons';
import { listStamp, messagePreview } from './format';

interface Row {
  key: string;
  name: string;
  group: boolean;
  lastMessage: ChatMessage | null;
  unread: number;
}

/** Friends' threads and groups together, the most recently active first. */
export function chatRows(conversations: Conversation[], groups: GroupConversation[]): Row[] {
  const rows: Row[] = [
    ...conversations.map((c) => ({ key: c.friend.username, name: c.friend.username, group: false, lastMessage: c.lastMessage, unread: c.unread })),
    ...groups.map((g) => ({ key: g.group.key, name: g.group.name, group: true, lastMessage: g.lastMessage, unread: g.unread })),
  ];
  return rows.sort((a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0));
}

function preview(message: ChatMessage, me: string) {
  if (message.kind === 'system' && !message.deleted) {
    const event = parseGroupEvent(message.body);
    return event ? describeGroupEvent(event, me) : '';
  }
  return messagePreview(message);
}

export function ChatList({
  me,
  conversations,
  groups,
  online,
  typing,
  onOpen,
  onNewGroup,
}: {
  me: string;
  conversations: Conversation[];
  groups: GroupConversation[];
  online: Set<string>;
  typing: Map<string, string[]>;
  onOpen: (key: string) => void;
  onNewGroup: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = chatRows(conversations, groups);
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  return (
    <div className="-mx-4">
      <div className="px-3 pt-2 pb-1">
        <label className="flex items-center gap-3 rounded-full bg-[#202c33] px-4 py-2 text-[#8696a0]">
          <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden>
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
          />
        </label>
      </div>

      {!q && (
        <button type="button" onClick={onNewGroup} className="flex w-full items-center gap-3 px-4 text-left transition active:bg-[#202c33]">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a]">
            <Icon.Groups size={26} />
          </span>
          <span className="min-w-0 flex-1 border-b border-[#222d34] py-4 text-[16.5px] text-[#e9edef]">Nouveau groupe</span>
        </button>
      )}

      {shown.length === 0 && <p className="px-6 py-10 text-center text-sm text-[#8696a0]">Aucune discussion trouvée.</p>}

      <ul>
        {shown.map(({ key, name, group, lastMessage, unread }) => {
          const typers = typing.get(key) ?? [];
          const showSender = group && lastMessage && !lastMessage.mine && !lastMessage.deleted && lastMessage.kind !== 'system';
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onOpen(key)}
                className="flex w-full items-center gap-3 px-4 text-left transition active:bg-[#202c33]"
              >
                <Avatar name={name} group={group} online={!group && online.has(key)} />
                <span className="min-w-0 flex-1 border-b border-[#222d34] py-3">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[16.5px] text-[#e9edef]">{name}</span>
                    {lastMessage && (
                      <span className={`shrink-0 text-[12px] ${unread ? 'font-medium text-[#25d366]' : 'text-[#8696a0]'}`}>
                        {listStamp(lastMessage.createdAt)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-1 text-[14px] text-[#8696a0]">
                      {typers.length > 0 ? (
                        <span className="truncate text-[#25d366]">{group ? `${typers.join(', ')} écrit…` : 'en train d’écrire…'}</span>
                      ) : lastMessage ? (
                        <>
                          {lastMessage.mine && !lastMessage.deleted && lastMessage.kind !== 'system' && (
                            <Ticks state={lastMessage.readAt ? 'read' : 'sent'} />
                          )}
                          {showSender && <span className="shrink-0">{lastMessage.from} :</span>}
                          {lastMessage.deleted ? (
                            <Icon.Ban size={16} className="shrink-0" />
                          ) : lastMessage.kind === 'voice' ? (
                            <Icon.Mic size={17} className={`shrink-0 ${lastMessage.readAt || !lastMessage.mine ? 'text-[#53bdeb]' : ''}`} />
                          ) : lastMessage.kind === 'image' ? (
                            <Icon.Image size={17} className="shrink-0" />
                          ) : null}
                          <span className={`truncate ${unread ? 'text-[#d1d7db]' : ''} ${lastMessage.deleted ? 'italic' : ''}`}>
                            {preview(lastMessage, me)}
                          </span>
                        </>
                      ) : (
                        <span className="truncate italic">Dis bonjour</span>
                      )}
                    </span>
                    {!!unread && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#25d366] px-1.5 text-[11.5px] font-semibold text-[#0b141a]">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center justify-center gap-1.5 px-6 pt-5 pb-2 text-center text-[12px] text-[#8696a0]">
        <svg viewBox="0 0 24 24" className="size-3" aria-hidden>
          <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        Seuls tes amis peuvent t’écrire.
      </p>
    </div>
  );
}
