'use client';

import { useEffect, useState } from 'react';
import { REACTIONS, REACTION_COOLDOWN_MS } from '@ludo/engine';

const EMOJIS = REACTIONS.filter((r) => !r.text);
const PHRASES = REACTIONS.filter((r) => r.text);

interface ReactionButtonProps {
  onReact: (reaction: string) => void;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
}

/** Button opening a panel of quick emojis and phrases to send to the other players. */
export function ReactionButton({ onReact, hidden, onHiddenChange }: ReactionButtonProps) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), REACTION_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooling]);

  const send = (id: string) => {
    if (cooling) return;
    onReact(id);
    setCooling(true);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`icon-btn relative size-11 shrink-0 text-xl ${open ? 'bg-white/25' : ''}`}
        aria-label="Réagir"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        💬
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer les réactions"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="pop-in absolute right-0 bottom-full left-0 z-40 mb-2 rounded-3xl border border-white/10 bg-[#23244a]/95 p-3 shadow-2xl backdrop-blur">
            <div className="grid grid-cols-6 gap-1">
              {EMOJIS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => send(r.id)}
                  disabled={cooling}
                  className="grid h-12 place-items-center rounded-xl text-[26px] transition hover:bg-white/10 active:scale-90 disabled:opacity-40"
                >
                  {r.emoji}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {PHRASES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => send(r.id)}
                  disabled={cooling}
                  className="truncate rounded-full bg-white/10 px-3 py-2 text-left text-[13px] font-medium transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
                >
                  {r.emoji} {r.text}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-white/60">
              Masquer les réactions des autres
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => onHiddenChange(e.target.checked)}
                className="size-4 accent-emerald-400"
              />
            </label>
          </div>
        </>
      )}
    </>
  );
}
