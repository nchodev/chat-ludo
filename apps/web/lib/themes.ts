import type { Color } from '@ludo/engine';

export interface ColorShades {
  main: string;
  dark: string;
  light: string;
}

export type Palette = Record<Color, ColorShades>;

export interface BoardTheme {
  id: string;
  name: string;
  icon: string;
  colors: Palette;
  surface: string;
  cell: string;
  cellStroke: string;
  star: string;
  baseInner: string;
  /** CSS background of the frame around the board. */
  frame: string;
  baseStyle: 'filled' | 'outline';
  pawnStyle: 'glossy' | 'flat' | 'neon';
  pattern?: 'wood' | 'wax';
}

const CLASSIC_COLORS: Palette = {
  red: { main: '#d24a42', dark: '#8c2a24', light: '#f4d7d4' },
  green: { main: '#3f985d', dark: '#215c36', light: '#d3eadb' },
  yellow: { main: '#e2ad3b', dark: '#946711', light: '#f7e8c6' },
  blue: { main: '#3d7bc6', dark: '#1f4a82', light: '#d5e3f4' },
};

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'classic',
    name: 'Classique',
    icon: '🎲',
    colors: CLASSIC_COLORS,
    surface: '#f6f4ef',
    cell: '#ffffff',
    cellStroke: '#8e99a8',
    star: '#9aa5b3',
    baseInner: '#fdfcf9',
    frame: 'linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05))',
    baseStyle: 'filled',
    pawnStyle: 'glossy',
  },
  {
    id: 'wood',
    name: 'Bois',
    icon: '🪵',
    colors: {
      red: { main: '#a8432f', dark: '#66231a', light: '#e9cdb9' },
      green: { main: '#55783f', dark: '#2e4a21', light: '#d4dfbf' },
      yellow: { main: '#c99634', dark: '#835b14', light: '#f1e0b8' },
      blue: { main: '#3b6386', dark: '#1d3b56', light: '#c3d3e0' },
    },
    surface: '#bf9064',
    cell: '#f4e6cb',
    cellStroke: '#6e4521',
    star: '#a2723f',
    baseInner: '#f3e2c3',
    frame: 'linear-gradient(135deg, #8b5a2b, #4a2c12)',
    baseStyle: 'filled',
    pawnStyle: 'glossy',
    pattern: 'wood',
  },
  {
    id: 'neon',
    name: 'Néon',
    icon: '🌃',
    colors: {
      red: { main: '#f0598d', dark: '#7f1d45', light: '#f0598d22' },
      green: { main: '#4fdc95', dark: '#126b42', light: '#4fdc9522' },
      yellow: { main: '#f2d55c', dark: '#7d6a12', light: '#f2d55c22' },
      blue: { main: '#52cde8', dark: '#145e72', light: '#52cde822' },
    },
    surface: '#0d0d22',
    cell: '#18183e',
    cellStroke: '#4a4a8c',
    star: '#6a6aa8',
    baseInner: '#0b0b1e',
    frame: 'linear-gradient(135deg, #b8456f, #3f9bb0)',
    baseStyle: 'outline',
    pawnStyle: 'neon',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    icon: '🍬',
    colors: {
      red: { main: '#e88f8a', dark: '#a8524d', light: '#fbe3e1' },
      green: { main: '#8cc7a1', dark: '#447f5a', light: '#e2f2e7' },
      yellow: { main: '#ecc874', dark: '#a07a26', light: '#fbf0d4' },
      blue: { main: '#8db2dc', dark: '#46709c', light: '#e1ecf7' },
    },
    surface: '#fbf6ee',
    cell: '#ffffff',
    cellStroke: '#bfae99',
    star: '#cdb89d',
    baseInner: '#ffffff',
    frame: 'linear-gradient(135deg, #fbcfe8, #bfdbfe)',
    baseStyle: 'filled',
    pawnStyle: 'flat',
  },
  {
    id: 'wax',
    name: 'Wax',
    icon: '🌍',
    colors: {
      red: { main: '#c33a45', dark: '#741822', light: '#f3d0d3' },
      green: { main: '#238b7f', dark: '#0e4d46', light: '#c9e7e2' },
      yellow: { main: '#dc9330', dark: '#8a560a', light: '#f8e1bd' },
      blue: { main: '#3a4a98', dark: '#1a2558', light: '#d0d5ee' },
    },
    surface: '#f8ecd4',
    cell: '#fffaf0',
    cellStroke: '#b48c57',
    star: '#c4a06d',
    baseInner: '#fffaf0',
    frame: 'repeating-linear-gradient(45deg, #b23a44 0 10px, #cc8a2e 10px 20px, #237f74 20px 30px, #364490 30px 40px)',
    baseStyle: 'filled',
    pawnStyle: 'glossy',
    pattern: 'wax',
  },
];

export interface DiceStyle {
  id: string;
  name: string;
  face: (c: ColorShades) => string;
  pip: (c: ColorShades) => string;
  /** Color of the single pip on the "1" face. */
  one: (c: ColorShades) => string;
  /** Color of the 3D edge under the die. */
  edge: (c: ColorShades) => string;
  glow?: boolean;
  numeric?: boolean;
}

export const DICE_STYLES: DiceStyle[] = [
  {
    id: 'classic',
    name: 'Classique',
    face: () => 'linear-gradient(145deg, #ffffff 0%, #e2e8f0 100%)',
    pip: () => '#1e293b',
    one: () => '#c8423b',
    edge: () => '#94a3b8',
  },
  {
    id: 'player',
    name: 'Couleur',
    face: (c) => `linear-gradient(145deg, ${c.main} 0%, ${c.dark} 100%)`,
    pip: () => '#ffffff',
    one: () => '#ffffff',
    edge: (c) => c.dark,
  },
  {
    id: 'wood',
    name: 'Bois',
    face: () => 'linear-gradient(145deg, #e8bd85 0%, #a0693a 100%)',
    pip: () => '#3b2412',
    one: () => '#3b2412',
    edge: () => '#5b3a1e',
  },
  {
    id: 'neon',
    name: 'Néon',
    face: () => 'linear-gradient(145deg, #1a1a3d 0%, #0b0b1e 100%)',
    pip: (c) => c.main,
    one: (c) => c.main,
    edge: () => '#000000',
    glow: true,
  },
  {
    id: 'gold',
    name: 'Or',
    face: () => 'linear-gradient(145deg, #fbefc8 0%, #d6a42b 55%, #8f5c0e 100%)',
    pip: () => '#422006',
    one: () => '#422006',
    edge: () => '#713f12',
  },
  {
    id: 'numbers',
    name: 'Chiffres',
    face: () => 'linear-gradient(145deg, #ffffff 0%, #e2e8f0 100%)',
    pip: () => '#1e293b',
    one: () => '#1e293b',
    edge: () => '#94a3b8',
    numeric: true,
  },
];

export interface PawnStyle {
  id: string;
  name: string;
  /** 'board' uses the pawns that come with the board theme. */
  shape: 'board' | 'cone' | 'star' | 'gem' | 'animal' | 'crown';
}

export const PAWN_STYLES: PawnStyle[] = [
  { id: 'board', name: 'Du plateau', shape: 'board' },
  { id: 'cone', name: 'Traditionnel', shape: 'cone' },
  { id: 'star', name: 'Étoiles', shape: 'star' },
  { id: 'gem', name: 'Diamants', shape: 'gem' },
  { id: 'animal', name: 'Animaux', shape: 'animal' },
  { id: 'crown', name: 'Couronnes', shape: 'crown' },
];

export const DEFAULT_BOARD_THEME = BOARD_THEMES[0];
export const DEFAULT_DICE_STYLE = DICE_STYLES[0];
export const DEFAULT_PAWN_STYLE = PAWN_STYLES[0];

export function pawnStyle(id: string | undefined): PawnStyle {
  return PAWN_STYLES.find((p) => p.id === id) ?? DEFAULT_PAWN_STYLE;
}

export function boardTheme(id: string | undefined): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? DEFAULT_BOARD_THEME;
}

export function diceStyle(id: string | undefined): DiceStyle {
  return DICE_STYLES.find((d) => d.id === id) ?? DEFAULT_DICE_STYLE;
}
