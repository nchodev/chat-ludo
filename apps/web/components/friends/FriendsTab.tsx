'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar } from '@/components/chat/Avatar';
import { Icon } from '@/components/Icons';
import { ProfileQrSheet } from '@/components/ProfileQr';
import { QrScanner } from '@/components/QrScanner';
import { Sheet } from '@/components/Sheet';
import { profileLink } from '@/lib/profileLink';
import {
  cancelFriendRequest,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  type Friend,
  type SocialState,
} from '@/lib/social';

const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function ago(value: number) {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return `le ${longDate.format(value)}`;
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 px-4 pt-5 pb-1.5 text-[13.5px] font-medium text-[#00a884]">
      {title}
      {!!count && <span className="text-[#8696a0]">{count}</span>}
    </h2>
  );
}

function RoundButton({
  label,
  onClick,
  tone = 'neutral',
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'accent' | 'danger';
  disabled?: boolean;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'text-[#8696a0] active:bg-white/10',
    accent: 'bg-[#00a884] text-[#0b141a] active:opacity-80',
    danger: 'bg-[#2a3942] text-[#f15c6d] active:bg-white/10',
  };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-10 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-[#2a3942]/60 py-3">
      <span className="text-[19px] font-semibold text-[#e9edef]">{value}</span>
      <span className="text-[12px] text-[#8696a0]">{label}</span>
    </div>
  );
}

function SheetRow({ icon, label, onClick, danger, href }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean; href?: string }) {
  const className = `flex h-[52px] w-full items-center gap-4 rounded-xl px-3 text-left text-[15.5px] active:bg-white/5 ${danger ? 'text-[#f15c6d]' : 'text-[#e9edef]'}`;
  const iconBox = <span className={danger ? 'text-[#f15c6d]' : 'text-[#00a884]'}>{icon}</span>;
  if (href) {
    return (
      <Link href={href} className={className}>
        {iconBox}
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {iconBox}
      {label}
    </button>
  );
}

export function FriendsTab({
  me,
  social,
  online,
  onSocial,
  onOpenChat,
  onNotice,
  onError,
}: {
  me: string;
  social: SocialState | null;
  online: Set<string>;
  onSocial: (state: SocialState) => void;
  onOpenChat: (username: string) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [profile, setProfile] = useState<Friend | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const friends = social?.friends ?? [];
  const incoming = social?.incoming ?? [];
  const outgoing = social?.outgoing ?? [];
  const q = query.trim();
  const qLower = q.toLowerCase();

  const sorted = useMemo(
    () =>
      [...friends].sort((a, b) => {
        const ao = online.has(a.username) ? 0 : 1;
        const bo = online.has(b.username) ? 0 : 1;
        return ao - bo || a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' });
      }),
    [friends, online],
  );
  const shown = qLower ? sorted.filter((f) => f.username.toLowerCase().includes(qLower)) : sorted;
  const onlineCount = friends.filter((f) => online.has(f.username)).length;
  const isKnown =
    qLower === me.toLowerCase() ||
    friends.some((f) => f.username.toLowerCase() === qLower) ||
    outgoing.some((r) => r.username.toLowerCase() === qLower);
  const canInvite = q.length >= 3 && !isKnown;

  const act = async (key: string, action: () => Promise<SocialState & { message: string }>) => {
    setBusy(key);
    try {
      const res = await action();
      onSocial(res);
      onNotice(res.message);
      return res;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Action impossible.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canInvite) return;
    const res = await act('invite', () => sendFriendRequest(q) as Promise<SocialState & { message: string; status: string }>);
    if (res) setQuery('');
  };

  const shareMe = async () => {
    const text = `Ajoute-moi sur LuChat, mon pseudo : ${me}`;
    const url = profileLink(me);
    try {
      if (navigator.share) await navigator.share({ title: 'LuChat', text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        onNotice('Invitation copiée, colle-la à tes amis.');
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) onError('Partage impossible.');
    }
  };

  const copyMe = async () => {
    try {
      await navigator.clipboard.writeText(me);
      onNotice('Pseudo copié.');
    } catch {
      onError('Copie impossible.');
    }
  };

  const openProfile = (friend: Friend) => {
    setConfirmRemove(false);
    setProfile(friend);
  };

  return (
    <div className="-mx-4 pb-4">
      <form onSubmit={invite} className="px-3 pt-2">
        <label className="flex items-center gap-3 rounded-full bg-[#202c33] px-4 py-2.5 text-[#8696a0] focus-within:ring-2 focus-within:ring-[#00a884]/50">
          <Icon.Search size={20} className="shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={16}
            enterKeyHint="send"
            placeholder="Rechercher ou ajouter un pseudo"
            className="min-w-0 flex-1 bg-transparent text-[15.5px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
          />
          {q ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Effacer" className="-mr-1 grid size-7 place-items-center rounded-full active:bg-white/10">
              <Icon.Close size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label="Scanner le QR code d’un ami"
              className="-mr-1.5 grid size-8 place-items-center rounded-full text-[#00a884] active:bg-white/10"
            >
              <Icon.QrScan size={21} />
            </button>
          )}
        </label>
      </form>

      {canInvite && (
        <button
          type="button"
          onClick={() => invite()}
          disabled={busy === 'invite'}
          className="pop-in mt-2 flex w-full items-center gap-4 px-4 py-2.5 text-left active:bg-[#202c33] disabled:opacity-60"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a]">
            <Icon.PersonAdd size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] text-[#e9edef]">
              Inviter <span className="font-semibold">{q}</span>
            </span>
            <span className="block text-[13px] text-[#8696a0]">{busy === 'invite' ? 'Envoi…' : 'Envoyer une invitation d’ami'}</span>
          </span>
        </button>
      )}

      {!q && (
        <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-[#1f2c33] p-3">
          <Avatar name={me} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-[#8696a0]">Ton pseudo LuChat</span>
            <span className="block truncate text-[17px] font-semibold text-[#e9edef]">{me}</span>
          </span>
          <RoundButton label="Copier mon pseudo" onClick={copyMe}>
            <Icon.Copy size={20} />
          </RoundButton>
          <RoundButton label="Mon QR code" onClick={() => setQrOpen(true)}>
            <Icon.QrCode size={20} />
          </RoundButton>
          <RoundButton label="Inviter des amis sur LuChat" onClick={shareMe} tone="accent">
            <Icon.Share size={20} />
          </RoundButton>
        </div>
      )}

      {!q && incoming.length > 0 && (
        <section>
          <SectionHeader title="Invitations reçues" count={incoming.length} />
          <ul>
            {incoming.map((request) => (
              <li key={request.username} className="flex items-center gap-3 px-4 py-2">
                <Avatar name={request.username} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] text-[#e9edef]">{request.username}</span>
                  <span className="block truncate text-[13px] text-[#8696a0]">Veut devenir ton ami · {ago(request.createdAt)}</span>
                </span>
                <RoundButton
                  label={`Refuser ${request.username}`}
                  tone="danger"
                  disabled={!!busy}
                  onClick={() => act(`decline:${request.username}`, () => respondToFriendRequest(request.username, 'decline'))}
                >
                  <Icon.Close size={20} />
                </RoundButton>
                <RoundButton
                  label={`Accepter ${request.username}`}
                  tone="accent"
                  disabled={!!busy}
                  onClick={async () => {
                    const res = await act(`accept:${request.username}`, () => respondToFriendRequest(request.username, 'accept'));
                    if (res) onOpenChat(request.username);
                  }}
                >
                  <Icon.Check size={22} />
                </RoundButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {friends.length > 0 && (
        <section>
          <SectionHeader
            title={q ? 'Résultats' : onlineCount ? `Amis · ${onlineCount} en ligne` : 'Amis'}
            count={q ? shown.length : friends.length}
          />
          {shown.length === 0 ? (
            <p className="px-6 py-6 text-center text-[14px] text-[#8696a0]">Aucun ami ne correspond à « {q} ».</p>
          ) : (
            <ul>
              {shown.map((friend) => {
                const isOnline = online.has(friend.username);
                return (
                  <li key={friend.username}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openProfile(friend)}
                      onKeyDown={(e) => e.key === 'Enter' && openProfile(friend)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 text-left transition active:bg-[#202c33]"
                    >
                      <Avatar name={friend.username} size={48} online={isOnline} />
                      <span className="min-w-0 flex-1 border-b border-[#222d34] py-3">
                        <span className="block truncate text-[16px] text-[#e9edef]">{friend.username}</span>
                        <span className="block truncate text-[13px] text-[#8696a0]">
                          {isOnline && <span className="text-[#25d366]">En ligne · </span>}
                          Niveau {friend.level} · {friend.wins} victoire{friend.wins > 1 ? 's' : ''}
                        </span>
                      </span>
                      <RoundButton label={`Discuter avec ${friend.username}`} onClick={() => onOpenChat(friend.username)}>
                        <Icon.Chat size={21} />
                      </RoundButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!q && outgoing.length > 0 && (
        <section>
          <SectionHeader title="Invitations envoyées" count={outgoing.length} />
          <ul>
            {outgoing.map((request) => (
              <li key={request.username} className="flex items-center gap-3 px-4 py-2">
                <span className="opacity-70">
                  <Avatar name={request.username} size={44} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] text-[#e9edef]">{request.username}</span>
                  <span className="flex items-center gap-1 text-[13px] text-[#8696a0]">
                    <Icon.Hourglass size={14} />
                    En attente · {ago(request.createdAt)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act(`cancel:${request.username}`, () => cancelFriendRequest(request.username))}
                  className="h-9 rounded-full px-3.5 text-[14px] font-medium text-[#00a884] active:bg-white/5 disabled:opacity-40"
                >
                  Annuler
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!q && friends.length === 0 && incoming.length === 0 && (
        <section className="flex flex-col items-center px-6 pt-10 text-center">
          <span className="relative mb-5 grid size-24 place-items-center rounded-full bg-gradient-to-br from-[#00a884]/25 to-[#00a884]/5 text-[#00a884] ring-1 ring-[#00a884]/30">
            <Icon.Groups size={46} />
          </span>
          <h2 className="text-[19px] font-semibold text-[#e9edef]">Joue avec tes amis</h2>
          <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[#8696a0]">
            Tape le pseudo d’un ami dans la barre ci-dessus pour l’inviter, ou partage le tien pour qu’il t’ajoute.
          </p>
          <button
            type="button"
            onClick={shareMe}
            className="mt-6 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] active:opacity-90"
          >
            <Icon.Share size={20} />
            Partager mon pseudo
          </button>
        </section>
      )}

      <Sheet open={!!profile} title={profile?.username ?? ''} onClose={() => setProfile(null)}>
        {profile && (
          <div className="flex flex-col pb-1">
            <div className="flex flex-col items-center pt-1 pb-4">
              <Avatar name={profile.username} size={88} online={online.has(profile.username)} />
              <p className={`mt-2 text-[13.5px] ${online.has(profile.username) ? 'text-[#25d366]' : 'text-[#8696a0]'}`}>
                {online.has(profile.username) ? 'En ligne' : 'Hors ligne'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Niveau" value={profile.level} />
              <Stat label="Victoires" value={profile.wins} />
              <Stat label="XP" value={profile.xp.toLocaleString('fr-FR')} />
            </div>
            <p className="mt-3 text-center text-[12.5px] text-[#8696a0]">Amis depuis le {longDate.format(profile.since)}</p>
            <div className="mt-3 -mx-2 flex flex-col">
              <SheetRow
                icon={<Icon.Chat size={22} />}
                label="Envoyer un message"
                onClick={() => {
                  const name = profile.username;
                  setProfile(null);
                  onOpenChat(name);
                }}
              />
              <SheetRow icon={<Icon.Dice size={22} />} label="Inviter à une partie" href="/online" />
              {confirmRemove ? (
                <div className="mx-2 mt-1 rounded-2xl bg-[#f15c6d]/10 p-3">
                  <p className="text-[14px] text-[#e9edef]">
                    Retirer <span className="font-semibold">{profile.username}</span> de tes amis ? Vous ne pourrez plus vous écrire.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(false)}
                      className="h-10 flex-1 rounded-full border border-[#2a3942] text-[14px] font-medium text-[#e9edef] active:bg-white/5"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={async () => {
                        const res = await act(`remove:${profile.username}`, () => removeFriend(profile.username));
                        if (res) setProfile(null);
                      }}
                      className="h-10 flex-1 rounded-full bg-[#f15c6d] text-[14px] font-semibold text-[#0b141a] disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ) : (
                <SheetRow icon={<Icon.PersonRemove size={22} />} label="Retirer des amis" danger onClick={() => setConfirmRemove(true)} />
              )}
            </div>
          </div>
        )}
      </Sheet>
      <ProfileQrSheet open={qrOpen} username={me} onClose={() => setQrOpen(false)} onNotice={onError} />
      {scanning && <QrScanner onClose={() => setScanning(false)} />}
    </div>
  );
}
