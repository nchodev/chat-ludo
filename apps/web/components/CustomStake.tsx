'use client';

import { useState } from 'react';
import { MAX_CUSTOM_STAKE, MIN_CUSTOM_STAKE, customStakeIssue, potSplit, tableId, type Currency } from '@ludo/engine';
import { CoinAmount, CoinIcon, GemIcon } from './Coins';
import { Icon } from './Icons';

/**
 * Lets a player type their own stake when none of the offered amounts suits them.
 * `balance` is null for guests; `players` is the number of players the prize is shown for.
 */
export function CustomStake({
  currency,
  balance,
  players,
  initial,
  selected = false,
  action = 'Valider',
  disabled = false,
  onSubmit,
}: {
  currency: Currency;
  balance: number | null;
  players: number | [number, number];
  initial?: number;
  selected?: boolean;
  action?: string;
  disabled?: boolean;
  onSubmit: (table: string) => void;
}) {
  const [text, setText] = useState(initial ? String(initial) : '');
  const premium = currency === 'premium';
  const amount = Number(text);
  const issue = text ? (customStakeIssue(amount) ?? (balance !== null && amount > balance ? 'Solde insuffisant pour cette mise.' : null)) : null;
  const valid = !!text && !issue;
  const [few, many] = Array.isArray(players) ? players : [players, players];

  const submit = () => {
    if (valid && !disabled) onSubmit(tableId(currency, amount));
  };

  return (
    <div className={`rounded-2xl border-2 p-3 transition ${selected ? 'border-[#00a884] bg-[#00a884]/10' : 'border-transparent bg-[#2a3942]'}`}>
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#aebac1]">
        <Icon.Edit size={15} />
        Autre montant
      </span>
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#0b141a]/70 px-3 focus-within:ring-2 focus-within:ring-[#00a884]">
          {premium ? <GemIcon size={18} /> : <CoinIcon size={18} />}
          <input
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6))}
            inputMode="numeric"
            enterKeyHint="done"
            placeholder={`${MIN_CUSTOM_STAKE} à ${MAX_CUSTOM_STAKE.toLocaleString('fr-FR')}`}
            aria-label="Montant de la mise"
            disabled={disabled}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-[#e9edef] tabular-nums outline-none placeholder:font-normal placeholder:text-[#8696a0]/70"
          />
        </label>
        <button
          type="submit"
          disabled={!valid || disabled}
          className="h-11 shrink-0 rounded-full bg-[#00a884] px-4 text-[14px] font-semibold text-[#0b141a] transition active:scale-95 disabled:bg-[#0b141a]/50 disabled:text-[#8696a0]"
        >
          {action}
        </button>
      </form>
      <p className={`mt-1.5 flex min-h-5 flex-wrap items-center gap-1 px-1 text-[12.5px] ${issue ? 'text-[#f15c6d]' : 'text-[#8696a0]'}`}>
        {issue ??
          (valid ? (
            <>
              Gain{' '}
              <CoinAmount value={potSplit(amount, few).prize} premium={premium} size={12} className="text-[#25d366]" />
              {many !== few && (
                <>
                  à <CoinAmount value={potSplit(amount, many).prize} premium={premium} size={12} className="text-[#25d366]" />
                </>
              )}
              <span>· {few === many ? `à ${few} joueurs` : `${few} à ${many} joueurs`}</span>
            </>
          ) : (
            'Choisis la somme que chaque joueur mise.'
          ))}
      </p>
    </div>
  );
}
