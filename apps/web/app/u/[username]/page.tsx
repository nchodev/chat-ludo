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
      setError(err instanceof ApiError && err.status === 404 ? 'notfound' : err instanceof Error ? err.message : 'Erreur inattendue.');
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
      setNotice(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const chat = () => router.push(`/?chat=${encodeURIComponent(player!.username)}`);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title="Profil" subtitle="Joueur LuChat" backHref="/?tab=friends" backText="Amis" backLabel="Retour aux amis" />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-6 pb-12">
        {error === 'notfound' ? (
          <section className="flex flex-col items-center pt-8 text-center">
            <span className="grid size-24 place-items-center rounded-full bg-[#1f2c33] text-[#8696a0]">
              <Icon.Search size={46} />
            </span>
            <h1 className="mt-5 text-[22px] font-semibold">Joueur introuvable</h1>
            <p className="mt-1.5 max-w-xs text-[14.5px] text-[#8696a0]">Aucun compte LuChat ne porte le pseudo « {username} ».</p>
            <Link href="/?tab=friends" className={`${primary} mt-8 max-w-xs`}>
              Retour aux amis
            </Link>
          </section>
        ) : error ? (
          <section className="flex flex-col items-center pt-8 text-center">
            <p className="text-[15px] text-[#8696a0]">{error}</p>
            <button type="button" onClick={() => void load()} className={`${secondary} mt-6 max-w-xs`}>
              <Icon.Refresh size={20} />
              Réessayer
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
                Niveau {player.level} · {player.rank}ᵉ au classement
              </p>
              <div className="mt-5 grid w-full grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[#111b21] py-3">
                  <p className="text-[20px] font-bold tabular-nums">{player.games}</p>
                  <p className="text-[12px] text-[#8696a0]">Parties</p>
                </div>
                <div className="rounded-2xl bg-[#111b21] py-3">
                  <p className="text-[20px] font-bold tabular-nums">{player.wins}</p>
                  <p className="text-[12px] text-[#8696a0]">Victoires</p>
                </div>
              </div>
            </section>

            {notice && <p className="pop-in rounded-2xl bg-[#1f2c33] px-4 py-3 text-center text-[14px] text-[#d1d7db]">{notice}</p>}

            <div className="flex flex-col gap-2">
              {player.relation === null && (
                <>
                  <p className="text-center text-[14px] text-[#8696a0]">Connecte-toi pour ajouter {player.username} en ami.</p>
                  <Link href="/compte" className={primary}>
                    <Icon.Login size={20} />
                    Se connecter ou créer un compte
                  </Link>
                </>
              )}
              {player.relation === 'none' && (
                <button type="button" disabled={busy} onClick={() => act(() => sendFriendRequest(player.username))} className={primary}>
                  <Icon.PersonAdd size={20} />
                  Ajouter en ami
                </button>
              )}
              {player.relation === 'outgoing' && (
                <button type="button" disabled className={secondary}>
                  <Icon.Hourglass size={20} />
                  Invitation envoyée
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
                  Accepter son invitation
                </button>
              )}
              {player.relation === 'friend' && (
                <button type="button" onClick={chat} className={primary}>
                  <Icon.Chat size={20} />
                  Envoyer un message
                </button>
              )}
              {player.relation === 'self' && (
                <>
                  <p className="text-center text-[14px] text-[#8696a0]">C’est ton profil, tel que tes amis le voient.</p>
                  <button type="button" onClick={() => setQrOpen(true)} className={primary}>
                    <Icon.QrCode size={20} />
                    Afficher mon QR code
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
