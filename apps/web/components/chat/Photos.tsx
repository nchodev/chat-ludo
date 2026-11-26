'use client';

import { useEffect, useRef, useState } from 'react';
import { parseChatImage } from '@ludo/engine';
import { mediaBlob, mediaUrl } from '@/lib/media';
import { Icon } from '../Icons';
import { formatTime } from './format';

const BUBBLE_WIDTH = 260;

/** Shape of the picture in a bubble: very tall or very wide photos are cropped, not shrunk to a sliver. */
function bubbleRatio(width: number, height: number) {
  return Math.min(1.8, Math.max(0.6, width / height));
}

function usePhotoUrl(id: number, localUrl?: string) {
  const [url, setUrl] = useState<string | null>(localUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (localUrl || id <= 0) return;
    let live = true;
    mediaUrl(id)
      .then((u) => live && setUrl(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, localUrl]);
  return { url, failed };
}

/** The picture inside a chat bubble; tapping it opens it full screen. */
export function PhotoInBubble({
  id,
  body,
  localUrl,
  sender,
  createdAt,
  meta,
}: {
  id: number;
  body: string;
  localUrl?: string;
  sender: string;
  createdAt: number;
  meta: React.ReactNode;
}) {
  const image = parseChatImage(body);
  const { url, failed } = usePhotoUrl(id, localUrl);
  const [open, setOpen] = useState(false);
  if (!image) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className="relative block w-full overflow-hidden rounded-md bg-black/25"
        style={{ aspectRatio: bubbleRatio(image.width, image.height), maxWidth: BUBBLE_WIDTH }}
        aria-label="Ouvrir la photo"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={image.caption || 'Photo'} className="size-full object-cover" draggable={false} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[#8696a0]">
            {failed ? (
              <span className="flex flex-col items-center gap-1 text-[12.5px]">
                <Icon.Image size={30} />
                Photo indisponible
              </span>
            ) : (
              <span className="size-8 animate-spin rounded-full border-[3px] border-white/20 border-t-white/70" />
            )}
          </span>
        )}
        {!image.caption && (
          <span className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/50 to-transparent px-2 pt-5 pb-1.5">{meta}</span>
        )}
      </button>
      {image.caption && (
        <span className="block px-1 pt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" style={{ maxWidth: BUBBLE_WIDTH }}>
          {image.caption}
          <span className="inline-block w-[68px]" aria-hidden />
        </span>
      )}
      {image.caption && <span className="absolute right-2 bottom-1.5">{meta}</span>}
      {open && url && <PhotoViewer photos={[{ id, body, localUrl, createdAt }]} start={0} title={sender} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A photo of an album: one chat message of its own. */
export interface AlbumPhoto {
  id: number;
  body: string;
  localUrl?: string;
  createdAt: number;
  selected: boolean;
  highlighted: boolean;
  /** Emojis people reacted with. */
  reactions: string[];
}

const LONG_PRESS_MS = 450;

/** Tap and long-press on a photo tile; a press that moves is a scroll, not a tap. */
function usePress(onTap: () => void, onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const long = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      start.current = { x: e.clientX, y: e.clientY };
      long.current = false;
      clear();
      timer.current = setTimeout(() => {
        long.current = true;
        navigator.vibrate?.(15);
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8)) {
        clear();
        start.current = null;
      }
    },
    onPointerUp: () => {
      const tapped = !!start.current && !long.current;
      clear();
      start.current = null;
      if (tapped) onTap();
    },
    onPointerCancel: () => {
      clear();
      start.current = null;
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (long.current) return;
      clear();
      long.current = true;
      start.current = null;
      onLong();
    },
  };
}

function AlbumTile({
  photo,
  className = '',
  more = 0,
  selecting,
  meta,
  onOpen,
  onSelect,
  onReactions,
}: {
  photo: AlbumPhoto;
  className?: string;
  /** Photos hidden behind this one, shown as "+N". */
  more?: number;
  selecting: boolean;
  meta?: React.ReactNode;
  onOpen: () => void;
  onSelect: () => void;
  onReactions?: () => void;
}) {
  const { url, failed } = usePhotoUrl(photo.id, photo.localUrl);
  const press = usePress(() => (selecting && photo.id > 0 ? onSelect() : onOpen()), () => photo.id > 0 && onSelect());
  return (
    <div
      id={photo.id > 0 ? `msg-${photo.id}` : undefined}
      role="button"
      tabIndex={0}
      aria-label={more ? `Voir les ${more} autres photos` : 'Ouvrir la photo'}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      {...press}
      className={`relative cursor-pointer overflow-hidden rounded-md bg-black/25 select-none [-webkit-touch-callout:none] ${className} ${
        photo.highlighted ? 'ring-2 ring-[#53bdeb]' : ''
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Photo" className="pointer-events-none size-full object-cover" draggable={false} />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-[#8696a0]">
          {failed ? <Icon.Image size={26} /> : <span className="size-7 animate-spin rounded-full border-[3px] border-white/20 border-t-white/70" />}
        </span>
      )}
      {more > 0 && <span className="absolute inset-0 grid place-items-center bg-black/55 text-[30px] font-medium text-white">+{more}</span>}
      {photo.selected && (
        <span className="absolute inset-0 grid place-items-center bg-[#00a884]/35">
          <span className="grid size-8 place-items-center rounded-full bg-[#00a884] text-[#0b141a]">
            <Icon.Check size={20} />
          </span>
        </span>
      )}
      {photo.reactions.length > 0 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onReactions?.();
          }}
          className="absolute bottom-1 left-1 flex h-6 items-center gap-0.5 rounded-full bg-[#0b141a]/80 px-1.5 text-[13px]"
          aria-label="Voir les réactions"
        >
          {[...new Set(photo.reactions)].slice(0, 3).join('')}
          {photo.reactions.length > 1 && <span className="text-[11px] text-[#aebac1]">{photo.reactions.length}</span>}
        </button>
      )}
      {meta && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/50 to-transparent px-2 pt-5 pb-1.5">
          {meta}
        </span>
      )}
    </div>
  );
}

/**
 * Photos sent together, as one bubble: side by side for two, one large and two small for three,
 * a 2 × 2 grid beyond, the last tile opening the whole gallery.
 */
export function PhotoAlbum({
  photos,
  sender,
  meta,
  selecting,
  onSelect,
  onReactions,
}: {
  photos: AlbumPhoto[];
  sender: string;
  meta: React.ReactNode;
  selecting: boolean;
  onSelect: (id: number) => void;
  onReactions: (id: number) => void;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const [gallery, setGallery] = useState(false);
  const shown = photos.length > 4 ? photos.slice(0, 4) : photos;
  const hidden = photos.length - shown.length;
  return (
    <>
      <div className="grid w-[260px] max-w-full grid-cols-2 gap-1">
        {shown.map((photo, i) => {
          const last = i === shown.length - 1;
          return (
            <AlbumTile
              key={photo.id}
              photo={photo}
              className={photos.length === 3 && i === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-square'}
              more={last ? hidden : 0}
              selecting={selecting}
              meta={last && !hidden ? meta : undefined}
              onOpen={() => (last && hidden ? setGallery(true) : setViewing(i))}
              onSelect={() => onSelect(photo.id)}
              onReactions={() => onReactions(photo.id)}
            />
          );
        })}
      </div>
      {hidden > 0 && <span className="flex justify-end px-1 pt-1">{meta}</span>}
      {gallery && (
        <PhotoGallery
          photos={photos}
          title={sender}
          onOpen={(i) => setViewing(i)}
          onSelect={(id) => {
            setGallery(false);
            onSelect(id);
          }}
          onClose={() => setGallery(false)}
        />
      )}
      {viewing !== null && <PhotoViewer photos={photos} start={viewing} title={sender} onClose={() => setViewing(null)} />}
    </>
  );
}

/** Closes an overlay with the back gesture or Escape. */
function useBackToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    window.history.pushState({ ...window.history.state, overlay: true }, '');
    const onPop = () => closeRef.current();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && window.history.back();
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}

/** Every photo of an album in a scrolling grid. */
function PhotoGallery({
  photos,
  title,
  onOpen,
  onSelect,
  onClose,
}: {
  photos: AlbumPhoto[];
  title: string;
  onOpen: (index: number) => void;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  useBackToClose(onClose);
  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[#0b141a]" role="dialog" aria-label="Photos" onPointerDown={(e) => e.stopPropagation()}>
      <header className="flex items-center gap-2 bg-[#1f2c33] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[#e9edef]">
        <button type="button" onClick={() => window.history.back()} className="grid size-11 place-items-center rounded-full active:bg-white/10" aria-label="Fermer la galerie">
          <Icon.Back size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium">{title}</p>
          <p className="text-[12.5px] text-[#aebac1]">{photos.length} photos</p>
        </div>
      </header>
      <div className="grid flex-1 auto-rows-max grid-cols-3 gap-0.5 overflow-y-auto p-0.5 pb-[env(safe-area-inset-bottom)]">
        {photos.map((photo, i) => (
          <AlbumTile
            key={photo.id}
            photo={{ ...photo, highlighted: false }}
            className="aspect-square rounded-none"
            selecting={false}
            onOpen={() => onOpen(i)}
            onSelect={() => {
              window.history.back();
              onSelect(photo.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ViewerImage({ photo }: { photo: { id: number; localUrl?: string } }) {
  const { url, failed } = usePhotoUrl(photo.id, photo.localUrl);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Photo" className="pointer-events-none max-h-full max-w-full object-contain" draggable={false} />;
  }
  return failed ? (
    <span className="flex flex-col items-center gap-1 text-[13px] text-[#8696a0]">
      <Icon.Image size={36} />
      Photo indisponible
    </span>
  ) : (
    <span className="size-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white/70" />
  );
}

/** Full-screen photos, swiped left and right, closed with the back gesture, the cross or Escape. */
function PhotoViewer({
  photos,
  start,
  title,
  onClose,
}: {
  photos: { id: number; body: string; localUrl?: string; createdAt: number }[];
  start: number;
  title: string;
  onClose: () => void;
}) {
  useBackToClose(onClose);
  const [index, setIndex] = useState(start);
  const [dx, setDx] = useState(0);
  const swipeFrom = useRef<number | null>(null);
  const photo = photos[Math.min(index, photos.length - 1)];
  const caption = parseChatImage(photo.body)?.caption ?? '';
  const go = (step: number) => setIndex((i) => Math.max(0, Math.min(photos.length - 1, i + step)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    const { id } = photo;
    const blob = id > 0 ? await mediaBlob(id) : await fetch(photo.localUrl!).then((r) => r.blob());
    const file = new File([blob], `luchat-photo-${id > 0 ? id : Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      role="dialog"
      aria-label="Photo"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[#e9edef]">
        <button type="button" onClick={() => window.history.back()} className="grid size-11 place-items-center rounded-full active:bg-white/10" aria-label="Fermer la photo">
          <Icon.Back size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium">{title}</p>
          <p className="text-[12.5px] text-[#aebac1]">
            {photos.length > 1 && `${index + 1} sur ${photos.length} · `}
            {formatTime(photo.createdAt)}
          </p>
        </div>
        <button type="button" onClick={() => void save()} className="grid size-11 place-items-center rounded-full active:bg-white/10" aria-label="Enregistrer la photo">
          <Icon.Download size={24} />
        </button>
      </header>
      <div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden"
        onPointerDown={(e) => {
          if (photos.length > 1) swipeFrom.current = e.clientX;
        }}
        onPointerMove={(e) => swipeFrom.current !== null && setDx(e.clientX - swipeFrom.current)}
        onPointerUp={() => {
          if (dx < -60) go(1);
          else if (dx > 60) go(-1);
          swipeFrom.current = null;
          setDx(0);
        }}
        onPointerCancel={() => {
          swipeFrom.current = null;
          setDx(0);
        }}
      >
        <div
          key={photo.id}
          className={`flex size-full items-center justify-center ${dx ? '' : 'transition-transform duration-200'}`}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        >
          <ViewerImage photo={photo} />
        </div>
        {photos.length > 1 && index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 hidden size-11 place-items-center rounded-full bg-black/50 text-white sm:grid"
            aria-label="Photo précédente"
          >
            <Icon.ChevronLeft size={26} />
          </button>
        )}
        {photos.length > 1 && index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 hidden size-11 place-items-center rounded-full bg-black/50 text-white sm:grid"
            aria-label="Photo suivante"
          >
            <Icon.ChevronRight size={26} />
          </button>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {photos.map((p, i) => (
            <span key={p.id} className={`size-1.5 rounded-full ${i === index ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
      )}
      {caption && (
        <p className="max-h-[30%] overflow-y-auto bg-black/60 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[15px] whitespace-pre-wrap text-[#e9edef]">
          {caption}
        </p>
      )}
    </div>
  );
}
