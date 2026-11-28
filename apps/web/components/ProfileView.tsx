'use client';

import Link from 'next/link';
import { useState, type ComponentType } from 'react';
import { ACHIEVEMENTS, levelInfo } from '@ludo/engine';
import { CoinAmount, CoinIcon } from './Coins';
import { DailyCard } from './DailyCard';
import { Icon } from './Icons';
import { LevelBar } from './LevelBar';
import { ProfileQrSheet } from './ProfileQr';
import { QrScanner } from './QrScanner';
import { useProfile } from '@/lib/profile';
import { useReferralRules } from '@/lib/referral';
import { useLang } from '@/lib/i18n';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

/** The player's level, statistics, daily challenges and badges. */
export function ProfileView() {
  const { profile, session, rank } = useProfile();
  const { t } = useLang();
  const referral = useReferralRules();
  const [qrOpen, setQrOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const { level, current, needed } = levelInfo(profile.xp);
  const s = profile.stats;
  const winRate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;

  const stats: { label: string; value: string | number; icon: IconComponent }[] = [
    { label: t('Parties', 'Games'), value: s.games, icon: Icon.Dice },
    { label: t('Victoires', 'Wins'), value: s.wins, icon: Icon.Trophy },
    { label: t('Taux de victoire', 'Win rate'), value: t(`${winRate} %`, `${winRate}%`), icon: Icon.Star },
    { label: t('Captures', 'Captures'), value: s.captures, icon: Icon.Target },
    { label: t('Pions rentrés', 'Pawns home'), value: s.pawnsHome, icon: Icon.Home },
    { label: t('Meilleure série', 'Best streak'), value: s.bestWinStreak, icon: Icon.Bolt },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-4">
          <span className="relative grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-400 to-indigo-600 text-3xl font-bold shadow-lg">
            {session ? session.username[0].toUpperCase() : <Icon.Person size={34} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{session?.username ?? t('Invité', 'Guest')}</p>
            <p className="text-sm text-white/60">
              {t('Niveau', 'Level')} {level}
              {rank && t(` · ${rank}ᵉ au classement`, ` · #${rank} on the leaderboard`)}
            </p>
          </div>
        </div>
        <div>
          <LevelBar xp={profile.xp} />
          <p className="mt-1 text-right text-xs text-white/50">
            {t(`${current} / ${needed} XP avant le niveau ${level + 1}`, `${current} / ${needed} XP to level ${level + 1}`)}
          </p>
        </div>
        {session ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[14.5px] font-semibold text-[#0b141a] active:scale-[0.98]"
              >
                <Icon.QrCode size={19} />
                {t('Mon QR code', 'My QR code')}
              </button>
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[14.5px] font-semibold text-[#00a884] active:bg-white/5"
              >
                <Icon.QrScan size={19} />
                {t('Scanner', 'Scan')}
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-100">
            {t('Ta progression est enregistrée seulement sur cet appareil.', 'Your progress is only saved on this device.')}{' '}
            <Link href="/compte" className="font-bold underline">
              {t('Crée un compte', 'Create an account')}
            </Link>{' '}
            {t('pour la garder partout et apparaître au classement.', 'to keep it everywhere and appear on the leaderboard.')}
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Icon.Medal size={20} className="text-[#00a884]" />
          {t('Statistiques', 'Statistics')}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {stats.map(({ label, value, icon: StatIcon }) => (
            <div key={label} className="flex flex-col items-center rounded-2xl bg-white/5 p-2.5 text-center">
              <StatIcon size={20} className="text-[#8696a0]" />
              <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
              <div className="text-[11px] leading-tight text-white/50">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <Link href="/portefeuille" className="flex items-center gap-4 rounded-[28px] bg-[#1f2c33] p-4 transition active:scale-[0.99]">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-500/15">
          <CoinIcon size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">{t('Portefeuille', 'Wallet')}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-[#8696a0]">
            <CoinAmount value={profile.coins} size={13} /> · {t('historique des gains, mises et achats', 'winnings, stakes and purchases')}
          </span>
        </span>
        <Icon.ChevronRight className="shrink-0 text-[#8696a0]" />
      </Link>

      <Link href="/parrainage" className="flex items-center gap-4 rounded-[28px] bg-[#1f2c33] p-4 transition active:scale-[0.99]">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884]/15 text-[#00a884]">
          <Icon.PersonAdd size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">{t('Inviter des amis', 'Invite friends')}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-[#8696a0]">
            {referral && referral.free.referrerCoins > 0 ? (
              <>
                <CoinAmount value={referral.free.referrerCoins} size={13} />{' '}
                {t(`par ami qui joue ${referral.free.gamesNeeded} parties`, `per friend who plays ${referral.free.gamesNeeded} games`)}
              </>
            ) : (
              t('Gagnez des pièces ensemble', 'Earn coins together')
            )}
          </span>
        </span>
        <Icon.ChevronRight className="shrink-0 text-[#8696a0]" />
      </Link>

      <Link href="/reglages" className="flex items-center gap-4 rounded-[28px] bg-[#1f2c33] p-4 transition active:scale-[0.99]">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#53bdeb]/15 text-[#53bdeb]">
          <Icon.Settings size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">{t('Réglages', 'Settings')}</span>
          <span className="block truncate text-[13px] text-[#8696a0]">
            {t('Langue, sons, notifications, apparence, sécurité', 'Language, sounds, notifications, appearance, security')}
          </span>
        </span>
        <Icon.ChevronRight className="shrink-0 text-[#8696a0]" />
      </Link>

      <DailyCard />

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-bold">
            <Icon.Trophy size={20} className="text-[#00a884]" />
            Badges
          </h2>
          <span className="text-xs text-white/50">
            {profile.achievements.length} / {ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = profile.achievements.includes(a.id);
            return (
              <div
                key={a.id}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2.5 text-center ${
                  unlocked ? 'bg-amber-400/15 ring-1 ring-amber-300/40' : 'bg-white/5 opacity-60'
                }`}
                title={t(a.description, a.descriptionEn)}
              >
                {unlocked ? (
                  <span className="text-3xl">{a.icon}</span>
                ) : (
                  <span className="grid size-9 place-items-center text-[#8696a0]">
                    <Icon.Lock size={24} />
                  </span>
                )}
                <span className="text-xs leading-tight font-semibold">{t(a.name, a.nameEn)}</span>
                <span className="text-[10px] leading-tight text-white/50">{t(a.description, a.descriptionEn)}</span>
                {!unlocked && <CoinAmount value={a.coins} size={12} className="text-[10px] text-amber-200" />}
              </div>
            );
          })}
        </div>
      </section>

      <Link href="/classement" className="btn btn-light flex items-center justify-center gap-2">
        <Icon.Trophy size={20} />
        {t('Voir le classement', 'See the leaderboard')}
      </Link>


      {session && <ProfileQrSheet open={qrOpen} username={session.username} onClose={() => setQrOpen(false)} />}
      {scanning && <QrScanner onClose={() => setScanning(false)} />}
    </div>
  );
}
