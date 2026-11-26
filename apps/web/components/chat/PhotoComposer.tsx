'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { MAX_CAPTION_LENGTH } from '@ludo/engine';
import { exportEdited, loadImage, prepareImage, type PreparedImage } from '@/lib/media';
import {
  FILTERS,
  FULL_CROP,
  NO_EDITS,
  centredCrop,
  dragCrop,
  isEdited,
  isFullCrop,
  renderPhoto,
  rotateCrop,
  rotatedSize,
  type Crop,
  type CropHandle,
  type PhotoEdits,
  type Rotation,
} from '@/lib/photoEdit';
import { Icon } from '../Icons';

export const MAX_PHOTOS = 10;

interface Item {
  key: number;
  image: PreparedImage;
  img: HTMLImageElement | null;
  edits: PhotoEdits;
  caption: string;
}

export interface OutgoingPhoto {
  image: PreparedImage;
  caption: string;
}

let nextKey = 1;

/** Live view of a photo with its retouches, redrawn when they change. */
function EditedView({ img, edits, maxSide, className }: { img: HTMLImageElement; edits: PhotoEdits; maxSide: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (canvas.current) renderPhoto(img, edits, maxSide, canvas.current);
  }, [img, edits, maxSide]);
  return <canvas ref={canvas} className={className} />;
}

function useBoxSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const RATIOS: { label: string; value: (w: number, h: number) => number | null }[] = [
  { label: 'Libre', value: () => null },
  { label: 'Original', value: (w, h) => w / h },
  { label: 'Carré', value: () => 1 },
  { label: '4:3', value: () => 4 / 3 },
  { label: '16:9', value: () => 16 / 9 },
];

/** Crop frame with draggable corners over the whole photo, plus quarter turns. */
function CropEditor({ img, edits, onDone, onCancel }: { img: HTMLImageElement; edits: PhotoEdits; onDone: (edits: PhotoEdits) => void; onCancel: () => void }) {
  const [rotation, setRotation] = useState<Rotation>(edits.rotation);
  const [crop, setCrop] = useState<Crop>(edits.crop ?? FULL_CROP);
  const [ratioIndex, setRatioIndex] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const box = useBoxSize(area);
  const drag = useRef<{ handle: CropHandle; x: number; y: number; crop: Crop } | null>(null);

  const { width: rw, height: rh } = rotatedSize(img, rotation);
  const fit = box.width && box.height ? Math.min((box.width - 40) / rw, (box.height - 40) / rh) : 0;
  const shown = { width: rw * fit, height: rh * fit };
  const pixelRatio = RATIOS[ratioIndex].value(rw, rh);
  // The frame's ratio in fractions of the photo, which is what the crop is stored in.
  const fractionRatio = pixelRatio ? (pixelRatio * rh) / rw : null;
  // Stable while dragging the frame, so the photo underneath is not redrawn on every move.
  const preview = useMemo<PhotoEdits>(() => ({ rotation, crop: null, filter: edits.filter }), [rotation, edits.filter]);

  const chooseRatio = (index: number) => {
    setRatioIndex(index);
    const value = RATIOS[index].value(rw, rh);
    setCrop(centredCrop(value ? (value * rh) / rw : null));
  };

  const rotate = () => {
    setRotation((r) => ((r + 90) % 360) as Rotation);
    setCrop((c) => rotateCrop(c));
    setRatioIndex(0);
  };

  const start = (handle: CropHandle) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, crop };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !fit) return;
    setCrop(dragCrop(d.handle, d.crop, (e.clientX - d.x) / shown.width, (e.clientY - d.y) / shown.height, fractionRatio));
  };
  const end = () => {
    drag.current = null;
  };

  const corner = (handle: CropHandle, position: string) => (
    <span
      onPointerDown={start(handle)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`absolute size-9 touch-none ${position}`}
      aria-hidden
    >
      <span className={`absolute size-5 border-white ${handle.includes('n') ? 'top-1.5 border-t-[3px]' : 'bottom-1.5 border-b-[3px]'} ${handle.includes('w') ? 'left-1.5 border-l-[3px]' : 'right-1.5 border-r-[3px]'}`} />
    </span>
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black">
      <header className="flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[#e9edef]">
        <button type="button" onClick={onCancel} className="h-10 rounded-full px-4 text-[15px] active:bg-white/10">
          Annuler
        </button>
        <button type="button" onClick={rotate} className="grid size-11 place-items-center rounded-full active:bg-white/10" aria-label="Pivoter d’un quart de tour">
          <Icon.RotateRight size={24} />
        </button>
        <button
          type="button"
          onClick={() => onDone({ ...edits, rotation, crop: isFullCrop(crop) ? null : crop })}
          className="h-10 rounded-full bg-[#00a884] px-4 text-[15px] font-semibold text-[#0b141a] active:opacity-80"
        >
          Valider
        </button>
      </header>
      <div ref={area} className="grid min-h-0 flex-1 place-items-center">
        {fit > 0 && (
          <div className="relative overflow-hidden" style={shown}>
            <EditedView img={img} edits={preview} maxSide={1200} className="size-full" />
            <div
              onPointerDown={start('move')}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className="absolute touch-none border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
            >
              <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="border-[0.5px] border-white/30" />
                ))}
              </span>
              {corner('nw', '-top-1.5 -left-1.5')}
              {corner('ne', '-top-1.5 -right-1.5')}
              {corner('sw', '-bottom-1.5 -left-1.5')}
              {corner('se', '-right-1.5 -bottom-1.5')}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-center gap-1.5 overflow-x-auto px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {RATIOS.map((ratio, i) => (
          <button
            key={ratio.label}
            type="button"
            onClick={() => chooseRatio(i)}
            aria-pressed={ratioIndex === i}
            className={`h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-medium ${ratioIndex === i ? 'bg-[#00a884] text-[#0b141a]' : 'bg-white/10 text-[#e9edef]'}`}
          >
            {ratio.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Picked photos, before sending: retouch each one, caption it, add or remove photos, then send them all. */
export function PhotoComposer({
  images,
  friend,
  onSend,
  onCancel,
}: {
  images: PreparedImage[];
  friend: string;
  onSend: (photos: OutgoingPhoto[]) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<Item[]>(() => images.map((image) => ({ key: nextKey++, image, img: null, edits: NO_EDITS, caption: '' })));
  const [active, setActive] = useState(0);
  const [tool, setTool] = useState<'filters' | 'crop' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const current = items[Math.min(active, items.length - 1)];

  // Decodes each photo once, for drawing its retouches.
  useEffect(() => {
    for (const item of items) {
      if (item.img) continue;
      void loadImage(item.image.url).then((img) => setItems((list) => list.map((it) => (it.key === item.key ? { ...it, img } : it))));
    }
  }, [items]);

  const update = (change: Partial<Item>) => setItems((list) => list.map((it) => (it.key === current.key ? { ...it, ...change } : it)));

  const close = () => {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.image.url);
    onCancel();
  };

  const remove = () => {
    if (items.length === 1) return close();
    URL.revokeObjectURL(current.image.url);
    setItems((list) => list.filter((it) => it.key !== current.key));
    setActive((i) => Math.max(0, Math.min(i, items.length - 2)));
    setTool(null);
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - items.length;
    const picked = Array.from(files).slice(0, room);
    setError(files.length > room ? `${MAX_PHOTOS} photos maximum par envoi.` : null);
    setBusy(true);
    try {
      const prepared: Item[] = [];
      for (const file of picked) prepared.push({ key: nextKey++, image: await prepareImage(file), img: null, edits: NO_EDITS, caption: '' });
      setItems((list) => [...list, ...prepared]);
      setActive(items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo impossible à ouvrir.');
    } finally {
      setBusy(false);
      if (addInput.current) addInput.current.value = '';
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const out: OutgoingPhoto[] = [];
      for (const item of items) {
        let image = item.image;
        if (isEdited(item.edits)) {
          const img = item.img ?? (await loadImage(item.image.url));
          image = await exportEdited(img, item.edits);
          URL.revokeObjectURL(item.image.url);
        }
        out.push({ image, caption: item.caption.trim() });
      }
      onSend(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
      setBusy(false);
    }
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b141a]" role="dialog" aria-label="Envoyer des photos">
      <header className="flex items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[#e9edef]">
        <button type="button" onClick={close} className="grid size-11 place-items-center rounded-full active:bg-white/10" aria-label="Annuler">
          <Icon.Close size={24} />
        </button>
        <p className="min-w-0 flex-1 truncate pl-1 text-[16px] font-medium">
          {items.length > 1 ? `${items.length} photos pour ${friend}` : `Photo pour ${friend}`}
        </p>
        <button
          type="button"
          onClick={() => setTool('crop')}
          disabled={!current.img}
          className="grid size-11 place-items-center rounded-full active:bg-white/10 disabled:opacity-40"
          aria-label="Recadrer et pivoter"
        >
          <Icon.Crop size={23} />
        </button>
        <button
          type="button"
          onClick={() => setTool((t) => (t === 'filters' ? null : 'filters'))}
          disabled={!current.img}
          aria-pressed={tool === 'filters'}
          className={`grid size-11 place-items-center rounded-full active:bg-white/10 disabled:opacity-40 ${tool === 'filters' ? 'text-[#00a884]' : ''}`}
          aria-label="Filtres"
        >
          <Icon.Filter size={23} />
        </button>
        {items.length > 1 && (
          <button type="button" onClick={remove} className="grid size-11 place-items-center rounded-full active:bg-white/10" aria-label="Retirer cette photo">
            <Icon.Delete size={23} />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-2">
        {current.img ? (
          <EditedView img={current.img} edits={current.edits} maxSide={1400} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="size-9 animate-spin rounded-full border-[3px] border-white/20 border-t-white/70" />
        )}
      </div>

      {tool === 'filters' && current.img && (
        <div className="flex gap-2 overflow-x-auto bg-black px-3 pt-3 pb-2">
          {FILTERS.map((filter) => {
            const on = current.edits.filter === filter.id;
            return (
              <button key={filter.id} type="button" onClick={() => update({ edits: { ...current.edits, filter: filter.id } })} aria-pressed={on} className="flex shrink-0 flex-col items-center gap-1">
                <span className={`block size-[68px] overflow-hidden rounded-xl ring-2 ${on ? 'ring-[#00a884]' : 'ring-transparent'}`}>
                  <EditedView img={current.img!} edits={{ ...current.edits, filter: filter.id }} maxSide={140} className="size-full object-cover" />
                </span>
                <span className={`text-[11.5px] ${on ? 'font-semibold text-[#00a884]' : 'text-[#d1d7db]'}`}>{filter.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="bg-black px-4 py-1.5 text-center text-[13px] text-[#f15c6d]">{error}</p>}

      <div className="flex items-center gap-2 overflow-x-auto bg-black px-3 py-2">
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setActive(i);
              setTool((t) => (t === 'crop' ? null : t));
            }}
            className={`size-14 shrink-0 overflow-hidden rounded-lg ring-2 ${item.key === current.key ? 'ring-[#00a884]' : 'ring-transparent opacity-70'}`}
            aria-label={`Photo ${i + 1}`}
            aria-current={item.key === current.key}
          >
            {item.img ? (
              <EditedView img={item.img} edits={item.edits} maxSide={120} className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image.url} alt="" className="size-full object-cover" />
            )}
          </button>
        ))}
        {items.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => addInput.current?.click()}
            disabled={busy}
            className="grid size-14 shrink-0 place-items-center rounded-lg border-2 border-dashed border-white/25 text-[#d1d7db] disabled:opacity-50"
            aria-label="Ajouter des photos"
          >
            <Icon.Add size={26} />
          </button>
        )}
        <input ref={addInput} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 bg-black px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <input
          key={current.key}
          value={current.caption}
          onChange={(e) => update({ caption: e.target.value })}
          maxLength={MAX_CAPTION_LENGTH}
          placeholder="Ajouter une légende…"
          className="h-12 min-w-0 flex-1 rounded-full bg-[#2a3942] px-5 text-[16px] text-[#e9edef] outline-none placeholder:text-[#8696a0]"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={items.length > 1 ? `Envoyer les ${items.length} photos` : 'Envoyer la photo'}
          className="relative grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-[#0b141a] active:scale-95 disabled:opacity-60"
        >
          {busy ? <span className="size-5 animate-spin rounded-full border-2 border-black/20 border-t-[#0b141a]" /> : <Icon.Send size={24} className="translate-x-px" />}
          {items.length > 1 && !busy && (
            <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#e9edef] px-1 text-[11px] font-bold text-[#0b141a]">{items.length}</span>
          )}
        </button>
      </form>

      {tool === 'crop' && current.img && (
        <CropEditor
          key={current.key}
          img={current.img}
          edits={current.edits}
          onCancel={() => setTool(null)}
          onDone={(edits) => {
            update({ edits });
            setTool(null);
          }}
        />
      )}
    </div>
  );
}
