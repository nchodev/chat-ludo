'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { useProfile } from '@/lib/profile';
import { getSocialState, respondToFriendRequest, sendFriendRequest, type SocialState } from '@/lib/social';
import { getSocket } from '@/lib/socket';
import { Avatar } from './chat/Avatar';
import { Icon } from './Icons';
import { Sheet } from './Sheet';

export interface GamePlayer {
  /** Name shown in the game. */
  name: string;
  /** Verified account of the player; null for a guest. */
  username: string | null;
}

/**
 * Button of an online game to add the other players as friends, or accept their request, without
 * leaving the game. A dot tells that one of them sent a request.
 */
export function GameFriendsButton({ players, className }: { players: GamePlayer[]; className: string }) {
  const { session } = useProfile();
  const signedIn = !!session;
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [social, setSocial] = useState<SocialState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The same account can't be both you and an opponent.
  const others = players.filter((p) => !p.username || p.username !== session?.username);

  const load = useCallback(() => {
    getSocialState()
      .then((next) => {
        setSocial(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!signedIn) return setSocial(null);
    load();
    const socket = getSocket();
    socket.on('social:changed', load);
    return () => {
      socket.off('social:changed', load);
    };
  }, [signedIn, load, open]);

  if (!others.length) return null;

  const has = (list: { username: string }[] | undefined, username: string | null) => !!username && !!list?.some((e) => e.username === username);
  const asked = others.some((p) => has(social?.incoming, p.username));

  const act = async (username: string, request: () => Promise<SocialState>) => {
    setBusy(username);
    setError(null);
    try {
      setSocial(await request());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const action = 'flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#00a884] px-3.5 text-[13px] font-semibold text-[#0b141a] disabled:opacity-60';
  const done = 'flex shrink-0 items-center gap-1.5 text-[13px] text-[#8696a0]';

  const status = ({ username }: GamePlayer) => {
    if (!username || !social) return null;
    if (has(social.friends, username)) {
      return (
        <span className={done}>
          <Icon.Check size={16} className="text-[#25d366]" />
          {t('Ami', 'Friend')}
        </span>
      );
    }
    if (has(social.outgoing, username)) {
      return (
        <span className={done}>
          <Icon.Hourglass size={16} />
          {t('Demande envoyée', 'Request sent')}
        </span>
      );
    }
    const incoming = has(social.incoming, username);
    return (
      <button
        type="button"
        disabled={busy === username}
        onClick={() => act(username, () => (incoming ? respondToFriendRequest(username, 'accept') : sendFriendRequest(username)))}
        className={action}
      >
        {incoming ? <Icon.Check size={16} /> : <Icon.PersonAdd size={16} />}
        {incoming ? t('Accepter', 'Accept') : t('Ajouter', 'Add')}
      </button>
    );
  };

  return (
    <>
      <button
        type="button"
        className={`relative ${className}`}
        aria-label={asked ? t('Amis : un joueur t’a envoyé une demande', 'Friends: a player sent you a request') : t('Ajouter un joueur en ami', 'Add a player as a friend')}
        title={t('Ajouter en ami', 'Add friend')}
        onClick={() => setOpen(true)}
      >
        <Icon.PersonAdd size={20} />
        {asked && <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-[#25d366] ring-2 ring-[#0b141a]" />}
      </button>

      <Sheet open={open} title={t('Ajouter en ami', 'Add friend')} onClose={() => setOpen(false)}>
        <ul className="divide-y divide-white/[0.06]">
          {others.map((p, i) => (
            <li key={p.username ?? `guest-${i}`} className="flex items-center gap-3 py-2.5">
              <Avatar name={p.username ?? p.name} size={42} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-medium">{p.username ?? p.name}</span>
                {!p.username && <span className="block text-[12.5px] text-[#8696a0]">{t('Invité, sans compte', 'Guest, no account')}</span>}
                {has(social?.incoming, p.username) && <span className="block text-[12.5px] text-[#25d366]">{t('Veut être ton ami', 'Wants to be your friend')}</span>}
              </span>
              {status(p)}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="mt-2 rounded-2xl bg-[#f15c6d]/12 px-3 py-2 text-[13px]">{error}</p>}
        {!signedIn && (
          <p className="mt-3 text-[13.5px] text-[#8696a0]">
            <Link href="/compte" className="font-semibold text-[#00a884]">
              {t('Connecte-toi', 'Sign in')}
            </Link>{' '}
            {t('pour ajouter des amis. Le raccourci flottant te ramènera à la partie.', 'to add friends. The floating shortcut will bring you back to the game.')}
          </p>
        )}
      </Sheet>
    </>
  );
}
