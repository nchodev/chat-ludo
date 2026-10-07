'use client';

import { useState } from 'react';
import { HOME_COLUMN_START, createGame, type GameState } from '@ludo/engine';
import { Board } from './Board';
import { DiceFace } from './Dice';
import { Sheet } from './Sheet';
import { CoinAmount } from './Coins';
import { useAppearance } from '@/lib/appearance';
import { sfx } from '@/lib/sound';
import { BOARD_THEMES, DICE_STYLES, PAWN_STYLES } from '@/lib/themes';
import { PawnPreview } from './Pawn';
import { useWallet, type ShopItem } from '@/lib/wallet';

const DEMO_STATE: GameState = (() => {
  const game = createGame([
    { color: 'red', name: 'A' },
    { color: 'green', name: 'B' },
    { color: 'yellow', name: 'C' },
    { color: 'blue', name: 'D' },
  ]);
  return {
    ...game,
    pawns: {
      red: [4, 18, -1, HOME_COLUMN_START + 1],
      green: [7, -1, -1, -1],
      yellow: [12, 30, -1, -1],
      blue: [44, 2, -1, -1],
    },
  };
})();

function Check() {
  return (
    <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow">
      ✓
    </span>
  );
}

function PriceTag({ price, affordable }: { price: number; affordable: boolean }) {
  return (
    <span
      className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs shadow ${
        affordable ? 'bg-amber-400 text-amber-950' : 'bg-black/60 text-white/80'
      }`}
    >
      <CoinAmount value={price} size={14} />
    </span>
  );
}

export function AppearancePicker() {
  const { board, dice, pawn, update } = useAppearance();
  const { coins, owns, buy } = useWallet();
  const [message, setMessage] = useState<string | null>(null);

  /** Equips an item, buying it first if needed. */
  const pick = (item: ShopItem, name: string, price: number, equip: () => void) => {
    setMessage(null);
    if (owns(item, price)) return equip();
    if (coins < price) {
      setMessage(`Il te manque ${price - coins} pièces pour « ${name} ». Gagne des parties pour en obtenir !`);
      return;
    }
    if (!confirm(`Acheter « ${name} » pour ${price} pièces ?`)) return;
    if (buy(item, price)) {
      equip();
      sfx.finish();
      setMessage(`« ${name} » débloqué !`);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2 text-sm">
        <span className="text-white/70">Tes pièces</span>
        <CoinAmount value={coins} size={22} className="text-base" />
      </div>
      {message && <p className="pop-in -mt-2 rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-100">{message}</p>}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Plateau</h3>
        <div className="grid grid-cols-2 gap-3">
          {BOARD_THEMES.map((theme) => {
            const selected = board.id === theme.id;
            const owned = owns(`board:${theme.id}`, theme.price);
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => pick(`board:${theme.id}`, theme.name, theme.price, () => update({ board: theme.id }))}
                aria-pressed={selected}
                className={`relative flex flex-col gap-2 rounded-2xl p-2 text-left transition active:scale-[0.97] ${
                  selected ? 'bg-white/15 ring-2 ring-emerald-400' : 'bg-white/5'
                }`}
              >
                <span
                  className={`block overflow-hidden rounded-xl p-1 ${owned ? '' : 'opacity-60 saturate-50'}`}
                  style={{ background: theme.frame }}
                >
                  <span className="block overflow-hidden rounded-lg">
                    <Board state={DEMO_STATE} theme={theme} pawnStyle={pawn} />
                  </span>
                </span>
                <span className="px-1 text-sm font-semibold">
                  {owned ? theme.icon : '🔒'} {theme.name}
                </span>
                {selected && <Check />}
                {!owned && <PriceTag price={theme.price} affordable={coins >= theme.price} />}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Pions</h3>
        <div className="grid grid-cols-3 gap-3">
          {PAWN_STYLES.map((style) => {
            const selected = pawn.id === style.id;
            const owned = owns(`pawn:${style.id}`, style.price);
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => pick(`pawn:${style.id}`, `Pions ${style.name.toLowerCase()}`, style.price, () => update({ pawn: style.id }))}
                aria-pressed={selected}
                className={`relative flex flex-col items-center gap-2 rounded-2xl p-2 pt-5 transition active:scale-[0.97] ${
                  selected ? 'bg-white/15 ring-2 ring-emerald-400' : 'bg-white/5'
                }`}
              >
                <span className={`block w-full overflow-hidden rounded-xl ${owned ? '' : 'opacity-60 saturate-50'}`}>
                  <PawnPreview pawnStyle={style} theme={board} />
                </span>
                <span className="text-center text-sm leading-tight font-semibold">
                  {owned ? '' : '🔒 '}
                  {style.name}
                </span>
                {selected && <Check />}
                {!owned && <PriceTag price={style.price} affordable={coins >= style.price} />}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">Dés</h3>
        <div className="grid grid-cols-3 gap-3">
          {DICE_STYLES.map((style, i) => {
            const selected = dice.id === style.id;
            const owned = owns(`dice:${style.id}`, style.price);
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => pick(`dice:${style.id}`, `Dés ${style.name.toLowerCase()}`, style.price, () => update({ dice: style.id }))}
                aria-pressed={selected}
                className={`relative flex flex-col items-center gap-3 rounded-2xl px-2 pt-5 pb-2 transition active:scale-[0.97] ${
                  selected ? 'bg-white/15 ring-2 ring-emerald-400' : 'bg-white/5'
                }`}
              >
                <span className={owned ? '' : 'opacity-60 saturate-50'}>
                  <DiceFace value={(i % 6) + 1} shades={board.colors.blue} diceStyle={style} size={54} />
                </span>
                <span className="text-sm font-semibold">
                  {owned ? '' : '🔒 '}
                  {style.name}
                </span>
                {selected && <Check />}
                {!owned && <PriceTag price={style.price} affordable={coins >= style.price} />}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Summary of the current appearance, opening the picker. */
export function AppearanceCard({ note }: { note?: string }) {
  const [open, setOpen] = useState(false);
  const { board, dice, pawn } = useAppearance();

  return (
    <section className="card p-4">
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-4 text-left">
        <span className="block w-20 shrink-0 overflow-hidden rounded-xl p-0.5" style={{ background: board.frame }}>
          <span className="block overflow-hidden rounded-[10px]">
            <Board state={DEMO_STATE} theme={board} pawnStyle={pawn} />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Apparence</span>
          <span className="block text-sm text-white/70">
            {board.icon} {board.name} · dés {dice.name.toLowerCase()} · pions {pawn.name.toLowerCase()}
          </span>
          {note && <span className="mt-0.5 block text-xs text-white/50">{note}</span>}
        </span>
        <DiceFace value={5} shades={board.colors.red} diceStyle={dice} size={40} />
        <span className="text-xl text-white/40">›</span>
      </button>

      <Sheet open={open} title="Apparence" onClose={() => setOpen(false)}>
        <AppearancePicker />
      </Sheet>
    </section>
  );
}
