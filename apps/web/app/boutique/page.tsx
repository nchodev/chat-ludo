'use client';

import { useState, type ComponentType } from 'react';
import { ACHIEVEMENTS, DAILY_CHALLENGES, LEVEL_UP_COINS_PER_LEVEL, LOGIN_REWARDS, REWARDS } from '@ludo/engine';
import { AppearancePicker, BoardThumb, ShopSection, useShopProgress } from '@/components/AppearancePicker';
import { AppBar } from '@/components/AppBar';
import { CoinAmount } from '@/components/Coins';
import { DiceFace } from '@/components/Dice';
import { Icon } from '@/components/Icons';
import { Sheet } from '@/components/Sheet';
import { useAppearance } from '@/lib/appearance';
import { useProfile } from '@/lib/profile';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

const EARNINGS: { icon: IconComponent; label: string; coins: number; note?: string }[] = [
  { icon: Icon.Robot, label: 'Victoire contre un ordi facile', coins: REWARDS.bot.easy },
  { icon: Icon.Robot, label: 'Victoire contre un ordi moyen', coins: REWARDS.bot.medium },
  { icon: Icon.Robot, label: 'Victoire contre un ordi difficile', coins: REWARDS.bot.hard },
  { icon: Icon.Groups, label: 'Victoire contre un joueur en ligne', coins: REWARDS.onlineHuman },
  { icon: Icon.Person, label: 'Victoire sur cet écran', coins: REWARDS.localHuman },
  { icon: Icon.Target, label: 'Par pion capturé', coins: REWARDS.perCapture, note: `max ${REWARDS.maxCaptureBonus}` },
  { icon: Icon.Shield, label: 'Aucun de tes pions capturé', coins: REWARDS.flawless },
  { icon: Icon.Login, label: 'Connexion quotidienne', coins: LOGIN_REWARDS[0], note: `jusqu’à ${LOGIN_REWARDS.at(-1)} le 7ᵉ jour` },
  {
    icon: Icon.Star,
    label: 'Défi du jour réussi',
    coins: Math.min(...DAILY_CHALLENGES.map((c) => c.coins)),
    note: `jusqu’à ${Math.max(...DAILY_CHALLENGES.map((c) => c.coins))}`,
  },
  {
    icon: Icon.Medal,
    label: 'Badge débloqué',
    coins: Math.min(...ACHIEVEMENTS.map((a) => a.coins)),
    note: `jusqu’à ${Math.max(...ACHIEVEMENTS.map((a) => a.coins))}`,
  },
  { icon: Icon.Trophy, label: 'Niveau supérieur', coins: LEVEL_UP_COINS_PER_LEVEL * 2, note: `puis +${LEVEL_UP_COINS_PER_LEVEL} par niveau` },
];

function WalletCard({ onEarn }: { onEarn: () => void }) {
  const { profile } = useProfile();
  const { owned, total } = useShopProgress();
  const { board, dice, pawn } = useAppearance();

  return (
    <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1f2c33] via-[#1a2a2e] to-[#0f3b33] p-4 ring-1 ring-white/[0.06]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[#aebac1]">Ton solde</p>
          <CoinAmount value={profile.coins} size={30} className="mt-1 text-[30px] leading-none" />
          <p className="mt-3 text-[13px] text-[#aebac1]">
            {owned} / {total} articles débloqués
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#00a884] transition-[width]" style={{ width: `${(owned / total) * 100}%` }} />
          </div>
        </div>
        <div className="relative w-[104px] shrink-0">
          <BoardThumb theme={board} pawnId={pawn.id} className="p-0.5 shadow-lg" />
          <span className="absolute -right-2 -bottom-2 drop-shadow-lg">
            <DiceFace value={5} shades={board.colors.red} diceStyle={dice} size={38} />
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onEarn}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white/[0.08] text-[14.5px] font-semibold text-[#e9edef] transition active:bg-white/[0.12]"
      >
        <Icon.Info size={18} />
        Comment gagner des pièces
      </button>
    </section>
  );
}

function EarningsList() {
  return (
    <>
      <p className="text-[14px] text-[#8696a0]">
        Chaque victoire rapporte des pièces pour chaque adversaire battu, plus des bonus. Un adversaire qui abandonne rapporte la moitié.
      </p>
      <ul className="mt-3 divide-y divide-white/[0.06] rounded-2xl bg-[#111b21]">
        {EARNINGS.map(({ icon: EarnIcon, label, coins, note }) => (
          <li key={label} className="flex items-center gap-3 px-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00a884]/12 text-[#00a884]">
              <EarnIcon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] text-[#e9edef]">{label}</span>
              {note && <span className="block text-[12.5px] text-[#8696a0]">{note}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-[14px] font-semibold text-amber-200">
              +<CoinAmount value={coins} size={15} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function ShopPage() {
  const [earnOpen, setEarnOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#0b141a] text-[#e9edef]">
      <AppBar title="Boutique" subtitle="Personnalise tes parties de Ludo" backHref="/ludo" backText="Ludo" backLabel="Retour à Ludo" />
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pt-4 pb-12">
        <WalletCard onEarn={() => setEarnOpen(true)} />
        <ShopSection title="Personnalisation">
          <AppearancePicker showBalance={false} />
        </ShopSection>
      </main>

      <Sheet open={earnOpen} title="Gagner des pièces" onClose={() => setEarnOpen(false)}>
        <EarningsList />
      </Sheet>
    </div>
  );
}
