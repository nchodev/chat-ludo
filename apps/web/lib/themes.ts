import type { Color } from '@ludo/engine';

export interface ColorShades {
  main: string;
  dark: string;
  light: string;
}

export type Palette = Record<Color, ColorShades>;

export interface BoardTheme {
  id: string;
  /** Cost in coins in the shop; 0 means free. */
  price: number;
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
  red: { main: '#e53935', dark: '#8e1b18', light: '#ffcdd2' },
  green: { main: '#43a047', dark: '#1f5f22', light: '#c8e6c9' },
  yellow: { main: '#fbc02d', dark: '#9a6f00', light: '#fff3c4' },
  blue: { main: '#1e88e5', dark: '#0d4f8f', light: '#bbdefb' },
};

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'classic',
    price: 0,
    name: 'Classique',
    icon: '🎲',
    colors: CLASSIC_COLORS,
    surface: '#ffffff',
    cell: '#f8fafc',
    cellStroke: '#cbd5e1',
    star: '#cbd5e1',
    baseInner: '#ffffff',
    frame: 'linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.05))',
    baseStyle: 'filled',
    pawnStyle: 'glossy',
  },
  {
    id: 'wood',
    price: 150,
    name: 'Bois',
    icon: '🪵',
    colors: {
      red: { main: '#b23a2b', dark: '#6e1f15', light: '#e8c4b0' },
      green: { main: '#4f7a3a', dark: '#2c4a1f', light: '#cfdcb8' },
      yellow: { main: '#d49a2a', dark: '#8a5f12', light: '#f1ddb0' },
      blue: { main: '#2f5f8a', dark: '#183a59', light: '#bcd0e0' },
    },
    surface: '#c8955c',
    cell: '#f3e2c3',
    cellStroke: '#8b5a2b',
    star: '#b07a45',
    baseInner: '#f3e2c3',
    frame: 'linear-gradient(135deg, #8b5a2b, #4a2c12)',
    baseStyle: 'filled',
    pawnStyle: 'glossy',
    pattern: 'wood',
  },
  {
    id: 'neon',
    price: 300,
    name: 'Néon',
    icon: '🌃',
    colors: {
      red: { main: '#ff2d75', dark: '#8a0036', light: '#ff2d7522' },
      green: { main: '#39ff88', dark: '#007a3a', light: '#39ff8822' },
      yellow: { main: '#ffe53b', dark: '#8a7a00', light: '#ffe53b22' },
      blue: { main: '#2de2ff', dark: '#00708a', light: '#2de2ff22' },
    },
    surface: '#0b0b1e',
    cell: '#15153a',
    cellStroke: '#2a2a5e',
    star: '#4b4b8a',
    baseInner: '#0b0b1e',
    frame: 'linear-gradient(135deg, #ff2d75, #2de2ff)',
    baseStyle: 'outline',
    pawnStyle: 'neon',
  },
  {
    id: 'pastel',
    price: 100,
    name: 'Pastel',
    icon: '🍬',
    colors: {
      red: { main: '#f28b8b', dark: '#b85c5c', light: '#fde2e2' },
      green: { main: '#8fd1a8', dark: '#4f9469', light: '#e2f4e8' },
      yellow: { main: '#f6d47a', dark: '#b8933a', light: '#fdf3d6' },
      blue: { main: '#8fb8e3', dark: '#557fab', light: '#e1edf8' },
    },
    surface: '#fffaf3',
    cell: '#ffffff',
    cellStroke: '#eadfd2',
    star: '#e5d5c0',
    baseInner: '#ffffff',
    frame: 'linear-gradient(135deg, #fbcfe8, #bfdbfe)',
    baseStyle: 'filled',
    pawnStyle: 'flat',
  },
  {
    id: 'wax',
    price: 250,
    name: 'Wax',
    icon: '🌍',
    colors: {
      red: { main: '#d7263d', dark: '#7d0f1e', light: '#f9c9cf' },
      green: { main: '#1b998b', dark: '#0b5149', light: '#c4ebe6' },
      yellow: { main: '#f39c12', dark: '#8f5600', light: '#fde3b8' },
      blue: { main: '#2c3e9e', dark: '#141f5c', light: '#cdd3f2' },
    },
    surface: '#fdf0d5',
    cell: '#fff8ea',
    cellStroke: '#d9b98a',
    star: '#d9b98a',
    baseInner: '#fff8ea',
    frame: 'repeating-linear-gradient(45deg, #d7263d 0 10px, #f39c12 10px 20px, #1b998b 20px 30px, #2c3e9e 30px 40px)',
    baseStyle: 'filled',
    pawnStyle: 'glossy',
    pattern: 'wax',
  },
];

export interface DiceStyle {
  id: string;
  /** Cost in coins in the shop; 0 means free. */
  price: number;
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
    price: 0,
    name: 'Classique',
    face: () => 'linear-gradient(145deg, #ffffff 0%, #e2e8f0 100%)',
    pip: () => '#1e293b',
    one: () => '#e53935',
    edge: () => '#94a3b8',
  },
  {
    id: 'player',
    price: 0,
    name: 'Couleur',
    face: (c) => `linear-gradient(145deg, ${c.main} 0%, ${c.dark} 100%)`,
    pip: () => '#ffffff',
    one: () => '#ffffff',
    edge: (c) => c.dark,
  },
  {
    id: 'wood',
    price: 100,
    name: 'Bois',
    face: () => 'linear-gradient(145deg, #e8bd85 0%, #a0693a 100%)',
    pip: () => '#3b2412',
    one: () => '#3b2412',
    edge: () => '#5b3a1e',
  },
  {
    id: 'neon',
    price: 200,
    name: 'Néon',
    face: () => 'linear-gradient(145deg, #1a1a3d 0%, #0b0b1e 100%)',
    pip: (c) => c.main,
    one: (c) => c.main,
    edge: () => '#000000',
    glow: true,
  },
  {
    id: 'gold',
    price: 400,
    name: 'Or',
    face: () => 'linear-gradient(145deg, #fef3c7 0%, #eab308 55%, #a16207 100%)',
    pip: () => '#422006',
    one: () => '#422006',
    edge: () => '#713f12',
  },
  {
    id: 'numbers',
    price: 50,
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
  /** Cost in coins in the shop; 0 means free. */
  price: number;
  /** 'board' uses the pawns that come with the board theme. */
  shape: 'board' | 'cone' | 'star' | 'gem' | 'animal' | 'crown';
}

export const PAWN_STYLES: PawnStyle[] = [
  { id: 'board', name: 'Du plateau', price: 0, shape: 'board' },
  { id: 'cone', name: 'Traditionnel', price: 100, shape: 'cone' },
  { id: 'star', name: 'Étoiles', price: 150, shape: 'star' },
  { id: 'gem', name: 'Diamants', price: 200, shape: 'gem' },
  { id: 'animal', name: 'Animaux', price: 250, shape: 'animal' },
  { id: 'crown', name: 'Couronnes', price: 400, shape: 'crown' },
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
