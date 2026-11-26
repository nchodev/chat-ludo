'use client';

import { COLORS, type Color } from '@ludo/engine';
import { useAppearance } from '@/lib/appearance';
import { COLOR_LABEL } from '@/lib/labels';
import { setPreferredColor, usePreferredColor } from '@/lib/perspective';
import { Icon } from './Icons';

/** The colour this player sees their camp in during online games, whatever seat they get. */
export function ColorPreference({ assigned }: { assigned?: Color | null }) {
  const preferred = usePreferredColor();
  const { board } = useAppearance();
  const shown = preferred ?? assigned ?? null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Ta couleur">
        {COLORS.map((color) => {
          const selected = shown === color;
          const shades = board.colors[color];
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreferredColor(color)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 py-2.5 transition active:scale-95 ${
                selected ? 'border-[#00a884] bg-[#00a884]/10' : 'border-transparent bg-[#2a3942]'
              }`}
            >
              <span
                className="grid size-9 place-items-center rounded-full text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]"
                style={{ background: `radial-gradient(circle at 35% 30%, ${shades.light}, ${shades.main} 55%, ${shades.dark})` }}
              >
                {selected && <Icon.Check size={20} />}
              </span>
              <span className="text-[12.5px] font-medium text-[#e9edef]">{COLOR_LABEL[color]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[12.5px] leading-relaxed text-[#8696a0]">
        Ton camp est toujours en bas du plateau, face à toi, dans cette couleur, même si un autre joueur a choisi la même : chacun
        la voit sur son écran, et à deux vous restez face à face en diagonale.
      </p>
    </div>
  );
}
