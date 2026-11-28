'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { Avatar } from '@/components/chat/Avatar';
import { Icon } from '@/components/Icons';
import { ProfileQrSheet } from '@/components/ProfileQr';
import { ApiError } from '@/lib/api';
import { useProfile } from '@/lib/profile';
import { fetchPublicPlayer, type PublicPlayer } from '@/lib/profileLink';
import { respondToFriendRequest, sendFriendRequest } from '@/lib/social';
import { tr } from '@/lib/i18n';

const primary =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:opacity-60';
const secondary =
  'flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884] transition active:bg-white/5 disabled:opacity-60';

export default function PlayerPage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username);
  const router = useRouter();
  const { session, ready } = useProfile();
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlayer(await fetchPublicPlayer(username));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'notfound' : err instanceof Error ? err.message : tr('Erreur inattendue.', 'Unexpected error.'));
    }
  }, [username]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, session, load]);

  const act = async (action: () => Promise<{ message: string }>) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await action();
      setNotice(res.message);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : tr('Action impossible.', 'Could not do that.'));
    } finally {
      setBusy(false);
    }
  };

  const chat = () => router.push(`/?chat=${encodeURIComponent(player!.username)}`);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title={tr('Profil', 'Profile')} subtitle={tr('Joueur LuChat', 'LuChat player')} backHref="/?tab=friends" backText={tr('Amis', 'Friends')} backLabel={tr('Retour aux amis', 'Back to friends')} />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-6 pb-12">
        {error === 'notfound' ? (
          <section className="flex flex-col items-center pt-8 text-center">
            <span className="grid size-24 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
              <Icon.Search size={46} />
            </span>
            <h1 className="mt-5 text-[22px] font-semibold">{tr('Joueur introuvable', 'Player not found')}</h1>
            <p className="mt-1.5 max-w-xs text-[14.5px] text-[#8696a0]">{tr(`Aucun compte LuChat ne porte le pseudo « ${username} ».`, `No LuChat account has the username “${username}”.`)}</p>
            <Link href="/?tab=friends" className={`${primary} mt-8 max-w-xs`}>
              {tr("Retour aux amis", "Back to friends")}
            </Link>
          </section>
        ) : error ? (
          <section className="flex flex-col items-center pt-8 text-center">
            <p className="text-[15px] text-[#8696a0]">{error}</p>
            <button type="button" onClick={() => void load()} className={`${secondary} mt-6 max-w-xs`}>
              <Icon.Refresh size={20} />
              {tr("Réessayer", "Try again")}
            </button>
          </section>
        ) : !player ? (
          <span className="mx-auto mt-16 size-10 animate-spin rounded-full border-4 border-[#00a884]/20 border-t-[#00a884]" />
        ) : (
          <>
            <section className="flex flex-col items-center rounded-[28px] bg-[#1f2c33] px-4 pt-6 pb-5 text-center">
              <Avatar name={player.username} size={96} />
              <h1 className="mt-3 text-[24px] font-semibold">{player.username}</h1>
              <p className="text-[14px] text-[#8696a0]">
                {tr(`Niveau ${player.level} · ${player.rank}ᵉ au classement`, `Level ${player.level} · ranked #${player.rank}`)}
              </p>
              <div className="mt-5 grid w-full grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[#111b21] py-3">
                  <p className="text-[20px] font-bold tabular-nums">{player.games}</p>
                  <p className="text-[12px] text-[#8696a0]">{tr('Parties', 'Games')}</p>
                </div>
                <div className="rounded-2xl bg-[#111b21] py-3">
                  <p className="text-[20px] font-bold tabular-nums">{player.wins}</p>
                  <p className="text-[12px] text-[#8696a0]">{tr('Victoires', 'Wins')}</p>
                </div>
              </div>
            </section>

            {notice && <p className="pop-in rounded-2xl bg-[#1f2c33] px-4 py-3 text-center text-[14px] text-[#d1d7db]">{notice}</p>}

            <div className="flex flex-col gap-2">
              {player.relation === null && (
                <>
                  <p className="text-center text-[14px] text-[#8696a0]">{tr(`Connecte-toi pour ajouter ${player.username} en ami.`, `Sign in to add ${player.username} as a friend.`)}</p>
                  <Link href="/compte" className={primary}>
                    <Icon.Login size={20} />
                    {tr("Se connecter ou créer un compte", "Sign in or create an account")}
                  </Link>
                </>
              )}
              {player.relation === 'none' && (
                <button type="button" disabled={busy} onClick={() => act(() => sendFriendRequest(player.username))} className={primary}>
                  <Icon.PersonAdd size={20} />
                  {tr("Ajouter en ami", "Add friend")}
                </button>
              )}
              {player.relation === 'outgoing' && (
                <button type="button" disabled className={secondary}>
                  <Icon.Hourglass size={20} />
                  {tr("Invitation envoyée", "Request sent")}
                </button>
              )}
              {player.relation === 'incoming' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => respondToFriendRequest(player.username, 'accept'))}
                  className={primary}
                >
                  <Icon.Check size={20} />
                  {tr("Accepter son invitation", "Accept their request")}
                </button>
              )}
              {player.relation === 'friend' && (
                <button type="button" onClick={chat} className={primary}>
                  <Icon.Chat size={20} />
                  {tr("Envoyer un message", "Send a message")}
                </button>
              )}
              {player.relation === 'self' && (
                <>
                  <p className="text-center text-[14px] text-[#8696a0]">{tr('C’est ton profil, tel que tes amis le voient.', 'This is your profile, as your friends see it.')}</p>
                  <button type="button" onClick={() => setQrOpen(true)} className={primary}>
                    <Icon.QrCode size={20} />
                    {tr("Afficher mon QR code", "Show my QR code")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </main>
      {session && <ProfileQrSheet open={qrOpen} username={session.username} onClose={() => setQrOpen(false)} />}
    </div>
  );
}
