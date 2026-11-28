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
import { tr } from '@/lib/i18n';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

/** A function, so the texts come in the current language. */
const earnings = (): { icon: IconComponent; label: string; coins: number; note?: string }[] => [
  { icon: Icon.Robot, label: tr('Victoire contre un ordi facile', 'Win against an easy computer'), coins: REWARDS.bot.easy },
  { icon: Icon.Robot, label: tr('Victoire contre un ordi moyen', 'Win against a medium computer'), coins: REWARDS.bot.medium },
  { icon: Icon.Robot, label: tr('Victoire contre un ordi difficile', 'Win against a hard computer'), coins: REWARDS.bot.hard },
  { icon: Icon.Groups, label: tr('Victoire contre un joueur en ligne', 'Win against an online player'), coins: REWARDS.onlineHuman },
  { icon: Icon.Person, label: tr('Victoire sur cet écran', 'Win on this screen'), coins: REWARDS.localHuman },
  { icon: Icon.Target, label: tr('Par pion capturé', 'Per pawn captured'), coins: REWARDS.perCapture, note: `max ${REWARDS.maxCaptureBonus}` },
  { icon: Icon.Shield, label: tr('Aucun de tes pions capturé', 'None of your pawns captured'), coins: REWARDS.flawless },
  { icon: Icon.Login, label: tr('Connexion quotidienne', 'Daily sign-in'), coins: LOGIN_REWARDS[0], note: tr(`jusqu’à ${LOGIN_REWARDS.at(-1)} le 7ᵉ jour`, `up to ${LOGIN_REWARDS.at(-1)} on day 7`) },
  {
    icon: Icon.Star,
    label: tr('Défi du jour réussi', 'Daily challenge done'),
    coins: Math.min(...DAILY_CHALLENGES.map((c) => c.coins)),
    note: tr(`jusqu’à ${Math.max(...DAILY_CHALLENGES.map((c) => c.coins))}`, `up to ${Math.max(...DAILY_CHALLENGES.map((c) => c.coins))}`),
  },
  {
    icon: Icon.Medal,
    label: tr('Badge débloqué', 'Badge unlocked'),
    coins: Math.min(...ACHIEVEMENTS.map((a) => a.coins)),
    note: tr(`jusqu’à ${Math.max(...ACHIEVEMENTS.map((a) => a.coins))}`, `up to ${Math.max(...ACHIEVEMENTS.map((a) => a.coins))}`),
  },
  { icon: Icon.Trophy, label: tr('Niveau supérieur', 'Level up'), coins: LEVEL_UP_COINS_PER_LEVEL * 2, note: tr(`puis +${LEVEL_UP_COINS_PER_LEVEL} par niveau`, `then +${LEVEL_UP_COINS_PER_LEVEL} per level`) },
];

function WalletCard({ onEarn }: { onEarn: () => void }) {
  const { profile } = useProfile();
  const { owned, total } = useShopProgress();
  const { board, dice, pawn } = useAppearance();

  return (
    <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1f2c33] via-[#1a2a2e] to-[#0f3b33] p-4 ring-1 ring-white/[0.06]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[#aebac1]">{tr('Ton solde', 'Your balance')}</p>
          <CoinAmount value={profile.coins} size={30} className="mt-1 text-[30px] leading-none" />
          <p className="mt-3 text-[13px] text-[#aebac1]">
            {tr(`${owned} / ${total} articles débloqués`, `${owned} / ${total} items unlocked`)}
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
        {tr('Comment gagner des pièces', 'How to earn coins')}
      </button>
    </section>
  );
}

function EarningsList() {
  return (
    <>
      <p className="text-[14px] text-[#8696a0]">
        {tr(
          'Chaque victoire rapporte des pièces pour chaque adversaire battu, plus des bonus. Un adversaire qui abandonne rapporte la moitié.',
          'Every win earns coins for each opponent beaten, plus bonuses. An opponent who gives up earns half.',
        )}
      </p>
      <ul className="mt-3 divide-y divide-white/[0.06] rounded-2xl bg-[#111b21]">
        {earnings().map(({ icon: EarnIcon, label, coins, note }) => (
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
      <AppBar title={tr('Boutique', 'Shop')} subtitle={tr('Personnalise tes parties de Ludo', 'Customise your Ludo games')} backHref="/ludo" backText="Ludo" backLabel={tr('Retour à Ludo', 'Back to Ludo')} />
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pt-4 pb-12">
        <WalletCard onEarn={() => setEarnOpen(true)} />
        <ShopSection title={tr('Personnalisation', 'Customisation')}>
          <AppearancePicker showBalance={false} />
        </ShopSection>
      </main>

      <Sheet open={earnOpen} title={tr('Gagner des pièces', 'Earn coins')} onClose={() => setEarnOpen(false)}>
        <EarningsList />
      </Sheet>
    </div>
  );
}
