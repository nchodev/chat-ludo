'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { potSplit, stakeTable, type Currency } from '@ludo/engine';
import { useAdultGate } from './AdultNotice';
import { CoinAmount, CoinIcon, GemIcon } from './Coins';
import { CustomStake } from './CustomStake';
import { Icon } from './Icons';
import { useProfile } from '@/lib/profile';
import { useStakeConfig } from '@/lib/stakes';
import { useLang } from '@/lib/i18n';

type Kind = 'none' | Currency;

const KINDS: { id: Kind; label: [string, string] }[] = [
  { id: 'none', label: ['Sans mise', 'No stake'] },
  { id: 'free', label: ['Free', 'Free'] },
  { id: 'premium', label: ['Premium', 'Premium'] },
];

/**
 * Asks what kind of game this is: friendly, or staked with Free (earned) or Premium (bought)
 * coins, and how much each player puts in. `value` is a stake table id, or null for no stake.
 */
export function StakePicker({
  value,
  onChange,
  players,
  freeOnly = false,
}: {
  value: string | null;
  onChange: (table: string | null) => void;
  players: number;
  /** One device plays every seat: Premium coins can't be staked there. */
  freeOnly?: boolean;
}) {
  const { session, profile, premiumCoins } = useProfile();
  const stakes = useStakeConfig();
  const { gate, notice } = useAdultGate();
  const { t } = useLang();
  const kinds = freeOnly || !stakes.premiumEnabled ? KINDS.filter((k) => k.id !== 'premium') : KINDS;
  const current = stakeTable(value);
  const [pickedKind, setKind] = useState<Kind>(current?.currency ?? 'none');
  const kind: Kind = pickedKind === 'premium' && !kinds.some((k) => k.id === 'premium') ? 'none' : pickedKind;

  useEffect(() => {
    if (value?.startsWith('premium-') && !stakes.premiumEnabled) onChange(null);
  }, [value, stakes.premiumEnabled, onChange]);
  const premium = kind === 'premium';
  const balance = premium ? premiumCoins : profile.coins;
  const tables = kind === 'none' ? [] : stakes.tables.filter((t) => t.currency === kind);
  const custom = !!current && !tables.some((t) => t.id === current.id);

  const pickKind = (next: Kind) => (next === 'premium' ? gate(() => applyKind(next)) : applyKind(next));
  const applyKind = (next: Kind) => {
    setKind(next);
    if (next === 'none') return onChange(null);
    const options = stakes.tables.filter((t) => t.currency === next);
    const affordable = options.filter((t) => t.stake <= (next === 'premium' ? premiumCoins : profile.coins));
    onChange((affordable[0] ?? options[0]).id);
  };

  return (
    <div className="flex flex-col gap-3">
      {notice}
      <div
        className={`grid gap-1 rounded-full bg-[#0b141a]/70 p-1 ${kinds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
        role="radiogroup"
        aria-label={t('Type de partie', 'Game type')}
      >
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => pickKind(k.id)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold transition ${
              kind === k.id ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#aebac1] active:bg-white/5'
            }`}
          >
            {k.id === 'premium' ? <GemIcon size={16} /> : k.id === 'free' ? <CoinIcon size={16} /> : <Icon.Block size={16} />}
            {t(...k.label)}
          </button>
        ))}
      </div>

      {kind === 'none' ? (
        <p className="px-1 text-[13px] text-[#8696a0]">{t('Partie amicale : personne ne mise, ordinateurs autorisés.', 'Friendly game: nobody stakes, computer players allowed.')}</p>
      ) : !session ? (
        <p className="flex items-start gap-2 rounded-2xl bg-[#ffbc38]/10 px-3 py-2.5 text-[13px] text-[#ffd279]">
          <Icon.Lock size={16} className="mt-px shrink-0" />
          <span>
            <Link href="/compte" className="font-semibold text-[#00a884]">
              {t('Connecte-toi', 'Sign in')}
            </Link>{' '}
            {t('pour jouer avec mise : les pièces sont liées à ton compte.', 'to play with a stake: coins are tied to your account.')}
          </span>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {tables.map((table) => {
              const selected = value === table.id;
              const short = balance < table.stake;
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => onChange(table.id)}
                  aria-pressed={selected}
                  className={`flex h-14 flex-col items-center justify-center rounded-2xl border-2 transition ${
                    selected ? 'border-[#00a884] bg-[#00a884]/10' : 'border-transparent bg-[#2a3942]'
                  } ${short ? 'opacity-50' : ''}`}
                >
                  <CoinAmount value={table.stake} premium={premium} size={14} className="text-[15px]" />
                  {short && <span className="text-[10.5px] text-[#f15c6d]">{t('Solde bas', 'Low balance')}</span>}
                </button>
              );
            })}
          </div>
          <CustomStake
            key={kind}
            currency={kind}
            balance={balance}
            players={players}
            initial={custom ? current.stake : undefined}
            selected={custom}
            action={custom ? t('Modifier', 'Change') : t('Valider', 'Confirm')}
            onSubmit={onChange}
          />
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-[13px] text-[#8696a0]">
            {t('Ton solde', 'Your balance')} <CoinAmount value={balance} premium={premium} size={13} />
            {current && (
              <>
                <span>·</span> {t(`à ${players} joueurs, le gagnant remporte`, `with ${players} players, the winner gets`)}{' '}
                <CoinAmount value={potSplit(current.stake, players).prize} premium={premium} size={13} className="text-[#25d366]" />
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
