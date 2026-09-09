export const PLAYER_SUITS = ['♠', '♥', '♦', '♣'] as const;

export interface PlayerColors {
  color: string;
  suit: string;
  suitChar: string;
}

const hashString = (str: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const hslToHex = (h: number, s: number, l: number): string => {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
};

export const getPlayerColors = (name: string): PlayerColors => {
  const hash = hashString(name);
  const hue = hash % 360;
  const color = hslToHex(hue, 70, 55);
  const suitChar = PLAYER_SUITS[hash % PLAYER_SUITS.length];
  return { color, suit: suitChar, suitChar };
};

export const getPlayerSuitChar = (name: string): string => getPlayerColors(name).suitChar;

export const getContrastTextColor = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#000000' : '#ffffff';
};