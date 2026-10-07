import { BASE, COLORS, FINISHED, HOME_COLUMN_START, START_INDEX, type Color } from '@ludo/engine';
import { DEFAULT_BOARD_THEME } from './themes';

export type Point = [number, number];

function line(from: Point, to: Point): Point[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  return Array.from({ length: steps + 1 }, (_, i) => [
    x1 + Math.sign(x2 - x1) * i,
    y1 + Math.sign(y2 - y1) * i,
  ]);
}

/** Grid cells (column, row) of the 52 shared track squares, clockwise from red's start. */
export const TRACK: Point[] = [
  ...line([1, 6], [5, 6]),
  ...line([6, 5], [6, 0]),
  [7, 0],
  ...line([8, 0], [8, 5]),
  ...line([9, 6], [14, 6]),
  [14, 7],
  ...line([14, 8], [9, 8]),
  ...line([8, 9], [8, 14]),
  [7, 14],
  ...line([6, 14], [6, 9]),
  ...line([5, 8], [0, 8]),
  [0, 7],
  [0, 6],
];

export const HOME_COLUMN: Record<Color, Point[]> = {
  red: line([1, 7], [5, 7]),
  green: line([7, 1], [7, 5]),
  yellow: line([13, 7], [9, 7]),
  blue: line([7, 13], [7, 9]),
};

export const BASE_ORIGIN: Record<Color, Point> = {
  red: [0, 0],
  green: [9, 0],
  yellow: [9, 9],
  blue: [0, 9],
};

const BASE_SLOTS: Point[] = [
  [2, 2],
  [4, 2],
  [2, 4],
  [4, 4],
];

const FINISH_CENTER: Record<Color, Point> = {
  red: [6.65, 7.5],
  green: [7.5, 6.65],
  yellow: [8.35, 7.5],
  blue: [7.5, 8.35],
};

const classic = DEFAULT_BOARD_THEME.colors;
const pick = (shade: 'main' | 'dark' | 'light') =>
  Object.fromEntries(COLORS.map((c) => [c, classic[c][shade]])) as Record<Color, string>;

export const COLOR_HEX = pick('main');
export const COLOR_DARK = pick('dark');
export const COLOR_LIGHT = pick('light');

export function startCell(color: Color): Point {
  return TRACK[START_INDEX[color]];
}

/** Center of a pawn in board units (one unit = one grid cell). */
export function pawnCenter(color: Color, pos: number, pawn: number): Point {
  if (pos === BASE) {
    const [ox, oy] = BASE_ORIGIN[color];
    const [sx, sy] = BASE_SLOTS[pawn % 4];
    return [ox + sx, oy + sy];
  }
  if (pos === FINISHED) {
    const [cx, cy] = FINISH_CENTER[color];
    const dx = (pawn % 2) * 0.36 - 0.18;
    const dy = Math.floor(pawn / 2) * 0.36 - 0.18;
    return [cx + dx, cy + dy];
  }
  const [x, y] = pos >= HOME_COLUMN_START
    ? HOME_COLUMN[color][pos - HOME_COLUMN_START]
    : TRACK[(START_INDEX[color] + pos) % TRACK.length];
  return [x + 0.5, y + 0.5];
}
