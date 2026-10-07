'use client';

import { useState } from 'react';

/** WhatsApp, native share and copy-link buttons to invite friends into a room. */
export function InviteButtons({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/online/${code}`;
  const text = `🎲 Viens jouer au Ludo avec moi ! Code du salon : ${code}`;

  const copy = async () => {
    await navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'Ludo', text, url }).catch(() => {});
    else await copy();
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
        target="_blank"
        rel="noreferrer"
        className="btn bg-[#25d366] px-2 text-sm text-white shadow-lg shadow-[#25d366]/20"
      >
        WhatsApp
      </a>
      <button type="button" onClick={share} className="btn btn-light px-2 text-sm">
        📤 Partager
      </button>
      <button type="button" onClick={copy} className="btn btn-ghost px-2 text-sm">
        {copied ? '✓ Copié' : '🔗 Copier'}
      </button>
    </div>
  );
}
