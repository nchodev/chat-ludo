'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  HOME_COLUMN_START,
  SHOP_PRICES,
  createGame,
  itemPrice,
  ownsItem,
  type GameState,
  type ShopCategory,
  type ShopItem,
} from '@ludo/engine';
import { Board } from './Board';
import { DiceFace } from './Dice';
import { Sheet } from './Sheet';
import { CoinAmount } from './Coins';
import { Icon } from './Icons';
import { useAppearance } from '@/lib/appearance';
import { tr } from '@/lib/i18n';
import { sfx } from '@/lib/sound';
import { BOARD_THEMES, DICE_STYLES, PAWN_STYLES, type BoardTheme } from '@/lib/themes';
import { PawnPreview } from './Pawn';
import { buy, useProfile } from '@/lib/profile';

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

const CATEGORIES: { id: ShopCategory; readonly label: string }[] = [
  { id: 'board', get label() { return tr('Plateaux', 'Boards'); } },
  { id: 'pawn', get label() { return tr('Pions', 'Pawns'); } },
  { id: 'dice', get label() { return tr('Dés', 'Dice'); } },
];

const ALL_ITEMS = Object.keys(SHOP_PRICES) as ShopItem[];

interface ShopEntry {
  item: ShopItem;
  category: ShopCategory;
  id: string;
  name: string;
  /** How the item reads in a sentence, e.g. "les pions étoiles". */
  label: string;
  price: number;
}

function entriesOf(category: ShopCategory): ShopEntry[] {
  const styles: { id: string; name: string }[] = category === 'board' ? BOARD_THEMES : category === 'pawn' ? PAWN_STYLES : DICE_STYLES;
  const prefix = category === 'board' ? tr('le plateau', 'the board') : category === 'pawn' ? tr('les pions', 'the pawns') : tr('les dés', 'the dice');
  return styles.map((style) => {
    const item = `${category}:${style.id}` as ShopItem;
    return { item, category, id: style.id, name: style.name, label: `${prefix} ${style.name.toLowerCase()}`, price: itemPrice(item) };
  });
}

export function BoardThumb({ theme, pawnId, className = '' }: { theme: BoardTheme; pawnId?: string; className?: string }) {
  const pawn = PAWN_STYLES.find((p) => p.id === pawnId) ?? PAWN_STYLES[0];
  return (
    <span className={`block overflow-hidden rounded-xl p-1 ${className}`} style={{ background: theme.frame }}>
      <span className="block overflow-hidden rounded-lg">
        <Board state={DEMO_STATE} theme={theme} pawnStyle={pawn} />
      </span>
    </span>
  );
}

function Preview({ entry, size }: { entry: ShopEntry; size: 'card' | 'large' }) {
  const { board, pawn } = useAppearance();
  if (entry.category === 'board') {
    const theme = BOARD_THEMES.find((t) => t.id === entry.id)!;
    return <BoardThumb theme={theme} pawnId={pawn.id} className={size === 'large' ? 'mx-auto w-full max-w-[260px]' : 'w-full'} />;
  }
  if (entry.category === 'pawn') {
    const style = PAWN_STYLES.find((p) => p.id === entry.id)!;
    return (
      <span className={`block overflow-hidden rounded-xl ${size === 'large' ? 'mx-auto w-40' : 'w-full'}`}>
        <PawnPreview pawnStyle={style} theme={board} />
      </span>
    );
  }
  const index = DICE_STYLES.findIndex((d) => d.id === entry.id);
  return (
    <span className="grid w-full place-items-center py-2">
      <DiceFace value={(index % 6) + 1} shades={board.colors.blue} diceStyle={DICE_STYLES[index]} size={size === 'large' ? 96 : 52} />
    </span>
  );
}

function StatusLine({ equipped, owned, price, coins }: { equipped: boolean; owned: boolean; price: number; coins: number }) {
  if (equipped) {
    return (
      <span className="flex items-center gap-1 text-[12.5px] font-semibold text-[#00a884]">
        <Icon.Check size={15} />
        {tr('Équipé', 'Equipped')}
      </span>
    );
  }
  if (owned) return <span className="text-[12.5px] font-medium text-[#8696a0]">{price === 0 ? tr('Gratuit', 'Free') : tr('Débloqué', 'Unlocked')}</span>;
  const affordable = coins >= price;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] ${
        affordable ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.06] text-[#8696a0]'
      }`}
    >
      <CoinAmount value={price} size={14} />
    </span>
  );
}

/** Confirmation before spending coins, shown over everything (the picker may itself be in a sheet). */
function PurchaseDialog({
  entry,
  coins,
  busy,
  error,
  onBuy,
  onClose,
}: {
  entry: ShopEntry;
  coins: number;
  busy: boolean;
  error: string | null;
  onBuy: () => void;
  onClose: () => void;
}) {
  const missing = entry.price - coins;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
        onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full max-w-md rounded-t-[28px] bg-[#1f2c33] px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[#e9edef] shadow-2xl sm:rounded-3xl"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="mt-4 rounded-3xl bg-[#111b21] p-4">
          <Preview entry={entry} size="large" />
        </div>
        <h2 className="mt-4 text-center text-[20px] font-semibold">{entry.name}</h2>
        <p className="mt-0.5 text-center text-[14px] text-[#8696a0]">
          {CATEGORIES.find((c) => c.id === entry.category)?.label}
        </p>

        <dl className="mt-4 divide-y divide-white/[0.06] rounded-2xl bg-[#111b21] text-[14.5px]">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-[#aebac1]">{tr('Prix', 'Price')}</dt>
            <dd>
              <CoinAmount value={entry.price} size={18} />
            </dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-[#aebac1]">{tr('Ton solde', 'Your balance')}</dt>
            <dd>
              <CoinAmount value={coins} size={18} />
            </dd>
          </div>
          {missing <= 0 && (
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-[#aebac1]">{tr('Après l’achat', 'After purchase')}</dt>
              <dd>
                <CoinAmount value={coins - entry.price} size={18} className="text-[#8696a0]" />
              </dd>
            </div>
          )}
        </dl>

        {error && <p className="mt-3 rounded-xl bg-[#f15c6d]/15 px-3 py-2 text-center text-[13.5px] text-[#ffb3bd]">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          {missing > 0 ? (
            <>
              <p className="flex items-center justify-center gap-1.5 text-center text-[14px] text-amber-200">
                <Icon.Lock size={16} />
                {tr('Il te manque', 'You need')} <CoinAmount value={missing} size={15} />
              </p>
              <button type="button" onClick={onClose} className="h-12 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98]">
                {tr('Compris', 'Got it')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onBuy}
                disabled={busy}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] transition active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-[#0b141a]/30 border-t-[#0b141a]" />
                ) : (
                  <Icon.Cart size={20} />
                )}
                {tr('Acheter et équiper', 'Buy and equip')}
              </button>
              <button type="button" onClick={onClose} className="h-11 text-[14.5px] font-medium text-[#8696a0]">
                {tr('Annuler', 'Cancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Boards, pawns and dice: equips owned items, buys the others after a confirmation. */
export function AppearancePicker({ showBalance = true }: { showBalance?: boolean }) {
  const { board, dice, pawn, update } = useAppearance();
  const { profile } = useProfile();
  const coins = profile.coins;
  const [tab, setTab] = useState<ShopCategory>('board');
  const [buying, setBuying] = useState<ShopEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const equippedId = { board: board.id, pawn: pawn.id, dice: dice.id };
  const owns = (item: ShopItem) => ownsItem(profile, item);
  const ownedCount = (category: ShopCategory) => entriesOf(category).filter((e) => owns(e.item)).length;

  const equip = async (entry: ShopEntry) => {
    await update({ [entry.category]: entry.id });
    setToast(tr(`${entry.name} équipé`, `${entry.name} equipped`));
  };

  const choose = (entry: ShopEntry) => {
    if (equippedId[entry.category] === entry.id) return;
    if (owns(entry.item)) {
      void equip(entry);
      return;
    }
    setError(null);
    setBuying(entry);
  };

  const confirmBuy = async () => {
    if (!buying) return;
    setBusy(true);
    setError(null);
    try {
      await buy(buying.item);
      sfx.finish();
      await update({ [buying.category]: buying.id });
      setToast(tr(`${buying.name} débloqué et équipé`, `${buying.name} unlocked and equipped`));
      setBuying(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Achat impossible.');
    } finally {
      setBusy(false);
    }
  };

  const entries = entriesOf(tab);

  return (
    <div className="flex flex-col gap-4">
      {showBalance && (
        <div className="flex items-center justify-between rounded-2xl bg-[#111b21] px-4 py-2.5">
          <span className="text-[14px] text-[#aebac1]">{tr('Tes pièces', 'Your coins')}</span>
          <CoinAmount value={coins} size={22} className="text-[16px]" />
        </div>
      )}

      <div role="tablist" aria-label={tr('Catégories', 'Categories')} className="grid grid-cols-3 gap-1 rounded-full bg-[#111b21] p-1">
        {CATEGORIES.map((c) => {
          const active = tab === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(c.id)}
              className={`flex h-10 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition ${
                active ? 'bg-[#00a884] text-[#0b141a]' : 'text-[#aebac1] active:bg-white/5'
              }`}
            >
              {c.label}
              <span className={`text-[11.5px] font-medium ${active ? 'text-[#0b141a]/70' : 'text-[#8696a0]'}`}>
                {ownedCount(c.id)}/{entriesOf(c.id).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className={`grid gap-3 ${tab === 'board' ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {entries.map((entry) => {
          const equipped = equippedId[entry.category] === entry.id;
          const owned = owns(entry.item);
          return (
            <button
              key={entry.item}
              type="button"
              onClick={() => choose(entry)}
              aria-pressed={equipped}
              aria-label={owned ? tr(`Équiper ${entry.label}`, `Equip ${entry.label}`) : tr(`Acheter ${entry.label} pour ${entry.price} pièces`, `Buy ${entry.label} for ${entry.price} coins`)}
              className={`relative flex flex-col gap-2 rounded-2xl p-2 pb-2.5 text-left transition active:scale-[0.97] ${
                equipped ? 'bg-[#00a884]/10 ring-2 ring-[#00a884]' : 'bg-[#111b21] ring-1 ring-white/[0.06]'
              }`}
            >
              <span className={`relative block ${owned ? '' : 'opacity-55 saturate-50'}`}>
                <Preview entry={entry} size="card" />
              </span>
              {!owned && (
                <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-[#0b141a]/85 text-[#e9edef] shadow">
                  <Icon.Lock size={15} />
                </span>
              )}
              {equipped && (
                <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-[#00a884] text-[#0b141a] shadow">
                  <Icon.Check size={16} />
                </span>
              )}
              <span className="flex flex-col gap-1 px-1">
                <span className="truncate text-[14px] leading-tight font-semibold text-[#e9edef]">{entry.name}</span>
                <StatusLine equipped={equipped} owned={owned} price={entry.price} coins={coins} />
              </span>
            </button>
          );
        })}
      </div>

      {toast &&
        createPortal(
          <div className="pop-in fixed inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full bg-[#e9edef] px-4 py-3 text-[14px] font-semibold text-[#0b141a] shadow-xl">
            <Icon.Check size={18} className="text-[#00a884]" />
            {toast}
          </div>,
          document.body,
        )}

      {buying && (
        <PurchaseDialog
          entry={buying}
          coins={coins}
          busy={busy}
          error={error}
          onBuy={confirmBuy}
          onClose={() => !busy && setBuying(null)}
        />
      )}
    </div>
  );
}

/** Items unlocked so far, out of the whole catalogue. */
export function useShopProgress() {
  const { profile } = useProfile();
  const owned = ALL_ITEMS.filter((item) => ownsItem(profile, item)).length;
  return { owned, total: ALL_ITEMS.length };
}

/** Summary of the current appearance, opening the picker. */
export function AppearanceCard({ note }: { note?: string }) {
  const [open, setOpen] = useState(false);
  const { board, dice, pawn } = useAppearance();

  return (
    <section className="card p-4">
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-4 text-left">
        <BoardThumb theme={board} pawnId={pawn.id} className="w-20 shrink-0 p-0.5" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{tr('Apparence', 'Appearance')}</span>
          <span className="block text-sm text-white/70">
            {tr(`${board.name} · dés ${dice.name.toLowerCase()} · pions ${pawn.name.toLowerCase()}`, `${board.name} · ${dice.name.toLowerCase()} dice · ${pawn.name.toLowerCase()} pawns`)}
          </span>
          {note && <span className="mt-0.5 block text-xs text-white/50">{note}</span>}
        </span>
        <DiceFace value={5} shades={board.colors.red} diceStyle={dice} size={40} />
        <Icon.ChevronRight size={22} className="text-white/40" />
      </button>

      <Sheet open={open} title="Apparence" onClose={() => setOpen(false)}>
        <AppearancePicker />
      </Sheet>
    </section>
  );
}

export function ShopSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-[#00a884] uppercase">{title}</h2>
      {children}
    </section>
  );
}
