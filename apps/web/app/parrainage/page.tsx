'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERRAL, type ReferralView } from '@ludo/engine';
import { AppBar } from '@/components/AppBar';
import { CoinAmount } from '@/components/Coins';
import { Icon } from '@/components/Icons';
import { Avatar } from '@/components/chat/Avatar';
import { api } from '@/lib/api';
import { getSessionToken, useProfile } from '@/lib/profile';
import { referralLink } from '@/lib/referral';

const STEPS = [
  { icon: Icon.Share, text: 'Envoie ton lien à un ami' },
  { icon: Icon.PersonAdd, text: 'Il crée son compte : vous devenez amis' },
  { icon: Icon.Dice, text: `Il joue ${REFERRAL.gamesNeeded} parties en ligne contre de vrais joueurs` },
];

export default function ReferralPage() {
  const { session, ready } = useProfile();
  const [data, setData] = useState<ReferralView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = session ? referralLink(session.username) : '';
  const message = `Viens jouer au Ludo et aux Dames avec moi sur LuChat ! Avec mon lien, tu gagnes ${REFERRAL.newcomerCoins} pièces : ${link}`;

  useEffect(() => {
    if (!ready || !session) return;
    api<ReferralView>('/referrals', { token: getSessionToken() })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Parrainage indisponible.'));
  }, [ready, session]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copie impossible : sélectionne le lien à la main.');
    }
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'LuChat', text: message }).catch(() => {});
    else await copy();
  };

  const rewarded = data?.invited.filter((f) => f.rewarded).length ?? 0;

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title="Parrainage" subtitle="Invite tes amis, gagnez ensemble" backHref="/?tab=profile" backText="Profil" backLabel="Retour au profil" />

      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-16">
        <section className="rounded-[28px] bg-gradient-to-br from-[#00a884]/25 to-[#1f2c33] p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a]">
              <Icon.Gift size={26} />
            </span>
            <div>
              <p className="text-[17px] font-semibold">
                <CoinAmount value={REFERRAL.referrerCoins} size={16} className="inline-flex" /> pour toi
              </p>
              <p className="text-[13.5px] text-[#d1d7db]">
                et <CoinAmount value={REFERRAL.newcomerCoins} size={13} className="inline-flex" /> pour chaque ami invité
              </p>
            </div>
          </div>
          <ol className="mt-4 flex flex-col gap-2.5">
            {STEPS.map(({ icon: StepIcon, text }, i) => (
              <li key={i} className="flex items-center gap-3 text-[14px]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0b141a]/50 text-[#00a884]">
                  <StepIcon size={17} />
                </span>
                {text}
              </li>
            ))}
          </ol>
        </section>

        {!ready ? (
          <div className="h-40 animate-pulse rounded-[28px] bg-[#1f2c33]" />
        ) : !session ? (
          <section className="flex flex-col items-center gap-3 rounded-[28px] bg-[#1f2c33] p-6 text-center">
            <p className="text-[15px] font-medium">Crée un compte pour avoir ton lien de parrainage</p>
            <Link href="/compte" className="h-11 rounded-full bg-[#00a884] px-6 text-[14.5px] leading-[44px] font-semibold text-[#0b141a]">
              Se connecter
            </Link>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-[28px] bg-[#1f2c33] p-4">
              <p className="text-[13px] font-medium text-[#00a884]">Ton lien</p>
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-2 rounded-2xl bg-[#0b141a]/60 px-3 py-3 text-left text-[13.5px] text-[#d1d7db]"
              >
                <span className="min-w-0 flex-1 truncate">{link}</span>
                {copied ? <Icon.Check size={18} className="text-[#25d366]" /> : <Icon.Copy size={18} className="text-[#8696a0]" />}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#25d366] text-[14.5px] font-semibold text-[#0b141a]"
                >
                  <Icon.WhatsApp size={19} />
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={share}
                  className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#2a3942] text-[14.5px] font-semibold"
                >
                  <Icon.Share size={18} />
                  Partager
                </button>
              </div>
            </section>

            {data?.invitedBy && (
              <section className="flex items-center gap-3 rounded-[24px] bg-[#1f2c33] p-4">
                <Avatar name={data.invitedBy.username} size={40} />
                <div className="min-w-0 flex-1 text-[14px]">
                  <p>
                    Invité par <span className="font-semibold">{data.invitedBy.username}</span>
                  </p>
                  <p className="text-[12.5px] text-[#8696a0]">
                    {data.invitedBy.rewarded
                      ? `Bonus de bienvenue reçu : ${REFERRAL.newcomerCoins} pièces`
                      : `${Math.min(data.invitedBy.games, REFERRAL.gamesNeeded)}/${REFERRAL.gamesNeeded} parties en ligne pour ton bonus de ${REFERRAL.newcomerCoins} pièces`}
                  </p>
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between px-1 pb-2">
                <h2 className="text-[13px] font-medium text-[#00a884]">Amis invités</h2>
                {data && (
                  <span className="flex items-center gap-1 text-[12.5px] text-[#8696a0]">
                    Gagné <CoinAmount value={data.earned} size={13} />
                  </span>
                )}
              </div>
              {error && <p className="mb-2 text-center text-[13px] text-[#f15c6d]">{error}</p>}
              {!data ? (
                !error && <div className="h-24 animate-pulse rounded-[24px] bg-[#1f2c33]" />
              ) : data.invited.length === 0 ? (
                <p className="rounded-[24px] bg-[#1f2c33] px-4 py-6 text-center text-[14px] text-[#8696a0]">
                  Personne pour l’instant. Partage ton lien : chaque ami qui joue {REFERRAL.gamesNeeded} parties te rapporte {REFERRAL.referrerCoins} pièces.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-[24px] bg-[#1f2c33]">
                  {data.invited.map((friend) => (
                    <li key={friend.username} className="flex items-center gap-3 px-4 py-3">
                      <Avatar name={friend.username} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px]">{friend.username}</p>
                        {friend.rewarded ? (
                          <p className="text-[12.5px] text-[#25d366]">Parrainage validé</p>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                              <span
                                className="block h-full rounded-full bg-[#ffbc38]"
                                style={{ width: `${(Math.min(friend.games, REFERRAL.gamesNeeded) / REFERRAL.gamesNeeded) * 100}%` }}
                              />
                            </span>
                            <span className="text-[11.5px] text-[#8696a0] tabular-nums">
                              {Math.min(friend.games, REFERRAL.gamesNeeded)}/{REFERRAL.gamesNeeded}
                            </span>
                          </div>
                        )}
                      </div>
                      {friend.rewarded && <Icon.Check size={20} className="text-[#25d366]" />}
                    </li>
                  ))}
                </ul>
              )}
              {rewarded >= REFERRAL.maxRewarded && (
                <p className="mt-2 text-center text-[12.5px] text-[#8696a0]">
                  Tu as atteint {REFERRAL.maxRewarded} parrainages récompensés : tes prochains amis reçoivent toujours leur bonus.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
