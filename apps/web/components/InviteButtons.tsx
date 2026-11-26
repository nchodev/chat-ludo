'use client';

import { useState } from 'react';
import { Icon } from './Icons';
import { QrImage } from './ProfileQr';
import { Sheet } from './Sheet';

/** WhatsApp, native share, QR code and copy-link buttons to invite friends into a room. */
export function InviteButtons({ code, path = `/online/${code}`, game = 'au Ludo' }: { code: string; path?: string; game?: string }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}${path}`;
  const text = `Viens jouer ${game} avec moi sur LuChat ! Code du salon : ${code}`;

  const copy = async () => {
    await navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'LuChat', text, url }).catch(() => {});
    else await copy();
  };

  const button = 'flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[12.5px] font-medium transition active:scale-[0.97]';

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
          target="_blank"
          rel="noreferrer"
          className={`${button} bg-[#25d366] text-[#0b141a]`}
        >
          <Icon.WhatsApp size={22} />
          WhatsApp
        </a>
        <button type="button" onClick={share} className={`${button} bg-[#2a3942] text-[#e9edef]`}>
          <Icon.Share size={22} />
          Partager
        </button>
        <button type="button" onClick={() => setQrOpen(true)} className={`${button} bg-[#2a3942] text-[#e9edef]`}>
          <Icon.QrCode size={22} />
          QR code
        </button>
        <button type="button" onClick={copy} className={`${button} bg-[#2a3942] ${copied ? 'text-[#25d366]' : 'text-[#e9edef]'}`}>
          {copied ? <Icon.Check size={22} /> : <Icon.Link size={22} />}
          {copied ? 'Copié' : 'Lien'}
        </button>
      </div>

      <Sheet open={qrOpen} title="Inviter avec un QR code" onClose={() => setQrOpen(false)}>
        <div className="flex flex-col items-center pt-2 pb-2 text-center">
          <QrImage value={url} />
          <p className="mt-4 text-[13px] text-[#8696a0]">Code du salon</p>
          <p className="font-mono text-[32px] leading-tight font-bold tracking-[0.2em]">{code}</p>
          <p className="mt-2 max-w-xs text-[13.5px] text-[#8696a0]">
            Ton ami scanne ce code avec LuChat (onglet Amis) ou l’appareil photo de son téléphone pour rejoindre la partie.
          </p>
        </div>
      </Sheet>
    </>
  );
}
