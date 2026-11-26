'use client';

export type Rotation = 0 | 90 | 180 | 270;

/** Part of the (rotated) photo kept, in fractions of its width and height. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FilterId = 'none' | 'bright' | 'contrast' | 'vivid' | 'warm' | 'cool' | 'mono' | 'sepia';

export interface PhotoEdits {
  rotation: Rotation;
  crop: Crop | null;
  filter: FilterId;
}

export const NO_EDITS: PhotoEdits = { rotation: 0, crop: null, filter: 'none' };
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

export function isEdited(edits: PhotoEdits) {
  return edits.rotation !== 0 || edits.crop !== null || edits.filter !== 'none';
}

/** Colour transform as a 3×4 matrix: each output channel = a·r + b·g + c·b + offset. */
type Matrix = [number, number, number, number, number, number, number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function compose(...steps: Matrix[]): Matrix {
  return steps.reduce((acc, m) => {
    const out = [] as unknown as Matrix;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        let v = col === 3 ? m[row * 4 + 3] : 0;
        for (let k = 0; k < 3; k++) v += m[row * 4 + k] * acc[k * 4 + col];
        out[row * 4 + col] = v;
      }
    }
    return out;
  }, IDENTITY);
}

const brightness = (d: number): Matrix => [1, 0, 0, d, 0, 1, 0, d, 0, 0, 1, d];
const contrast = (c: number): Matrix => {
  const o = 128 * (1 - c);
  return [c, 0, 0, o, 0, c, 0, o, 0, 0, c, o];
};
const saturation = (s: number): Matrix => {
  const [r, g, b] = [0.2126 * (1 - s), 0.7152 * (1 - s), 0.0722 * (1 - s)];
  return [r + s, g, b, 0, r, g + s, b, 0, r, g, b + s, 0];
};
const tint = (r: number, g: number, b: number, d: [number, number, number] = [0, 0, 0]): Matrix => [r, 0, 0, d[0], 0, g, 0, d[1], 0, 0, b, d[2]];

export const FILTERS: { id: FilterId; label: string; matrix: Matrix }[] = [
  { id: 'none', label: 'Original', matrix: IDENTITY },
  { id: 'bright', label: 'Lumineux', matrix: compose(brightness(22), contrast(1.05)) },
  { id: 'contrast', label: 'Contraste', matrix: compose(contrast(1.3), saturation(1.1)) },
  { id: 'vivid', label: 'Éclatant', matrix: compose(saturation(1.55), contrast(1.08)) },
  { id: 'warm', label: 'Chaud', matrix: compose(tint(1.08, 1, 0.88, [12, 4, 0]), saturation(1.1)) },
  { id: 'cool', label: 'Froid', matrix: compose(tint(0.9, 1, 1.1, [0, 4, 14])) },
  { id: 'mono', label: 'Noir et blanc', matrix: compose(saturation(0), contrast(1.15)) },
  {
    id: 'sepia',
    label: 'Sépia',
    matrix: [0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0],
  },
];

function applyFilter(canvas: HTMLCanvasElement, filter: FilterId) {
  const matrix = FILTERS.find((f) => f.id === filter)?.matrix;
  if (!matrix || filter === 'none') return;
  const context = canvas.getContext('2d')!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  const [a, b, c, o1, e, f, g, o2, h, i, j, o3] = matrix;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p];
    const gr = d[p + 1];
    const bl = d[p + 2];
    d[p] = a * r + b * gr + c * bl + o1;
    d[p + 1] = e * r + f * gr + g * bl + o2;
    d[p + 2] = h * r + i * gr + j * bl + o3;
  }
  context.putImageData(pixels, 0, 0);
}

export function rotatedSize(img: HTMLImageElement, rotation: Rotation) {
  return rotation % 180 ? { width: img.naturalHeight, height: img.naturalWidth } : { width: img.naturalWidth, height: img.naturalHeight };
}

/** Draws the photo rotated, cropped and filtered, at most `maxSide` pixels long, into `target` (or a new canvas). */
export function renderPhoto(img: HTMLImageElement, edits: PhotoEdits, maxSide: number, target?: HTMLCanvasElement): HTMLCanvasElement {
  const { width: rw, height: rh } = rotatedSize(img, edits.rotation);
  const crop = edits.crop ?? FULL_CROP;
  const cw = crop.w * rw;
  const ch = crop.h * rh;
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const canvas = target ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const context = canvas.getContext('2d')!;
  // Transparent PNGs would turn black in JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(scale, scale);
  context.translate(-crop.x * rw, -crop.y * rh);
  if (edits.rotation === 90) {
    context.translate(rw, 0);
    context.rotate(Math.PI / 2);
  } else if (edits.rotation === 180) {
    context.translate(rw, rh);
    context.rotate(Math.PI);
  } else if (edits.rotation === 270) {
    context.translate(0, rh);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
  context.restore();
  applyFilter(canvas, edits.filter);
  return canvas;
}

const MIN_CROP = 0.08;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/**
 * Moves the crop frame or one of its corners by (dx, dy) fractions of the photo. `ratio` is the
 * frame's width / height in fractions (null for free), kept while resizing.
 */
export function dragCrop(handle: CropHandle, c: Crop, dx: number, dy: number, ratio: number | null): Crop {
  if (handle === 'move') return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
  const left = handle === 'nw' || handle === 'sw';
  const top = handle === 'nw' || handle === 'ne';
  const ax = left ? c.x + c.w : c.x;
  const ay = top ? c.y + c.h : c.y;
  const maxW = left ? ax : 1 - ax;
  const maxH = top ? ay : 1 - ay;
  let w = clamp(left ? c.w - dx : c.w + dx, MIN_CROP, maxW);
  let h = clamp(top ? c.h - dy : c.h + dy, MIN_CROP, maxH);
  if (ratio) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    if (w > maxW) [w, h] = [maxW, maxW / ratio];
    if (h > maxH) [w, h] = [maxH * ratio, maxH];
  }
  return { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
}

/** Largest centred frame with the given width / height ratio (in fractions). */
export function centredCrop(ratio: number | null): Crop {
  if (!ratio) return FULL_CROP;
  let w = 1;
  let h = w / ratio;
  if (h > 1) [w, h] = [ratio, 1];
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** The same frame once the photo has turned a quarter clockwise. */
export function rotateCrop(c: Crop): Crop {
  return { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w };
}

export function isFullCrop(c: Crop) {
  return c.x < 0.002 && c.y < 0.002 && c.w > 0.996 && c.h > 0.996;
}
