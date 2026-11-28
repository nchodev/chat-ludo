'use client';

import { useEffect, useState } from 'react';
import { REACTION_COOLDOWN_MS, type Reaction } from '@ludo/engine';
import { tr } from '@/lib/i18n';
import { useProfile } from '@/lib/profile';
import { useReactionRanking } from '@/lib/reactions';
interface ReactionButtonProps {
  onReact: (reaction: string) => void;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  /** Reactions offered in this game. */
  reactions: Reaction[];
}

/**
 * Button opening a panel of quick emojis and phrases to send to the other players, the ones this
 * player sends most first.
 */
export function ReactionButton({ onReact, hidden, onHiddenChange, reactions }: ReactionButtonProps) {
  const { session } = useProfile();
  const { rank, count } = useReactionRanking(session?.username);
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);

  // The panel is only rendered once opened, in the browser: the saved counts can be read here.
  const ranked = open ? rank(reactions) : [];
  const emojis = ranked.filter((r) => !r.text);
  const phrases = ranked.filter((r) => r.text);

  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), REACTION_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooling]);

  const send = (id: string) => {
    if (cooling) return;
    onReact(id);
    count(id);
    setCooling(true);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`icon-btn relative size-11 shrink-0 text-xl ${open ? 'bg-white/25' : ''}`}
        aria-label={tr('Réagir', 'React')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        💬
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={tr('Fermer les réactions', 'Close reactions')}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="pop-in absolute right-0 bottom-full left-0 z-40 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#23244a]/95 py-1.5 shadow-2xl backdrop-blur">
            <div className="flex items-center pr-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {emojis.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => send(r.id)}
                    disabled={cooling}
                    className="grid size-10 shrink-0 place-items-center rounded-xl text-[24px] transition hover:bg-white/10 active:scale-90 disabled:opacity-40"
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onHiddenChange(!hidden)}
                aria-pressed={hidden}
                title={hidden ? tr('Afficher les réactions des autres', 'Show other players’ reactions') : tr('Masquer les réactions des autres', 'Hide other players’ reactions')}
                className={`ml-1 shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition ${
                  hidden ? 'bg-emerald-400/25 text-emerald-200' : 'bg-white/10 text-white/60'
                }`}
              >
                {hidden ? tr('🔕 Masquées', '🔕 Hidden') : tr('🔔 Visibles', '🔔 Shown')}
              </button>
            </div>
            <div className="mt-1 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto overscroll-contain px-2 py-0.5">
              {phrases.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => send(r.id)}
                  disabled={cooling}
                  className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition hover:bg-white/15 active:scale-95 disabled:opacity-40"
                >
                  {r.emoji} {r.text}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
