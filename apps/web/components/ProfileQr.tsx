'use client';

import { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { profileLink } from '@/lib/profileLink';
import { Avatar } from './chat/Avatar';
import { Icon } from './Icons';
import { LuChatLogo } from './LuChatLogo';
import { QrScanner } from './QrScanner';
import { Sheet } from './Sheet';

/** QR code drawn as one SVG path; the high error correction leaves room for the logo in the middle. */
export function QrImage({ value, size = 232 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'Q' });
    let d = '';
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { path: d, count: modules.size };
  }, [value]);
  const quiet = 2;
  return (
    <span className="relative inline-block rounded-3xl bg-white p-3 shadow-lg" style={{ width: size, height: size }}>
      <svg viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} className="size-full" shapeRendering="crispEdges" role="img" aria-label="QR code du profil">
        <path d={path} fill="#0b141a" />
      </svg>
      <span className="absolute top-1/2 left-1/2 grid size-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-white p-1">
        <LuChatLogo size={size * 0.18} />
      </span>
    </span>
  );
}

/** "My QR code" sheet: the profile's code and link, with share and scan shortcuts. */
export function ProfileQrSheet({
  open,
  username,
  onClose,
  onNotice,
}: {
  open: boolean;
  username: string;
  onClose: () => void;
  onNotice?: (message: string) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = open ? profileLink(username) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotice?.('Copie impossible.');
    }
  };

  const share = async () => {
    const text = `Ajoute-moi sur LuChat : ${username}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Mon profil LuChat', text, url: link });
      else await copy();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) onNotice?.('Partage impossible.');
    }
  };

  return (
    <>
      <Sheet open={open && !scanning} title="Mon QR code" onClose={onClose}>
        <div className="flex flex-col items-center pt-1">
          <div className="flex items-center gap-3">
            <Avatar name={username} size={44} />
            <span className="text-left">
              <span className="block text-[17px] font-semibold text-[#e9edef]">{username}</span>
              <span className="block text-[13px] text-[#8696a0]">Profil LuChat</span>
            </span>
          </div>
          <div className="mt-5">{open && <QrImage value={link} />}</div>
          <p className="mt-4 max-w-xs text-center text-[13.5px] text-[#8696a0]">
            Fais scanner ce code à un ami pour qu’il t’ajoute en un instant.
          </p>
          <button
            type="button"
            onClick={copy}
            className="mt-3 flex max-w-full items-center gap-2 rounded-full bg-[#111b21] px-4 py-2 text-[13px] text-[#aebac1] active:bg-white/5"
          >
            {copied ? <Icon.Check size={16} className="shrink-0 text-[#00a884]" /> : <Icon.Link size={16} className="shrink-0" />}
            <span className="truncate">{copied ? 'Lien copié' : link.replace(/^https?:\/\//, '')}</span>
          </button>
          <div className="mt-5 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={share}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-[15px] font-semibold text-[#0b141a] active:scale-[0.98]"
            >
              <Icon.Share size={20} />
              Partager
            </button>
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#2a3942] text-[15px] font-semibold text-[#00a884] active:bg-white/5"
            >
              <Icon.QrScan size={20} />
              Scanner
            </button>
          </div>
        </div>
      </Sheet>
      {scanning && <QrScanner onClose={() => setScanning(false)} />}
    </>
  );
}
