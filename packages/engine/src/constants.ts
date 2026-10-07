export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export type Color = (typeof COLORS)[number];

/** Index of each color's start square on the shared 52-square track. */
export const START_INDEX: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const TEAMMATE: Record<Color, Color> = {
  red: 'yellow',
  yellow: 'red',
  green: 'blue',
  blue: 'green',
};

export const TRACK_LENGTH = 52;

/**
 * Pawn positions are stored relative to the pawn's own start square:
 * - BASE (-1): in the corner base
 * - 0..50: on the shared track (51 only happens when looping, see mustCaptureToEnterHome)
 * - HOME_COLUMN_START..HOME_COLUMN_START+4: in the colored home column
 * - FINISHED: in the center
 */
export const BASE = -1;
export const LAST_TRACK_STEP = 50;
export const HOME_COLUMN_START = 52;
export const HOME_COLUMN_LENGTH = 5;
export const FINISHED = HOME_COLUMN_START + HOME_COLUMN_LENGTH;

export const STAR_SQUARES = [8, 21, 34, 47];
export const START_SQUARES = [0, 13, 26, 39];
