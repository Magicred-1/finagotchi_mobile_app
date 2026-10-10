/**
 * Theme tokens shared by the radial pet engine.
 *
 * UI chrome values below track src/theme/tokens.ts; the creature-body
 * palette (egg through evolutionGlow) is engine-owned and frozen.
 */

export const colors = {
  background: '#11171E',
  surface: '#141B24',
  text: '#F6FAFF',
  textMuted: '#9CA9BB',
  primary: '#8DC9F6',

  egg: '#D4C8B8',
  coinling: '#f59e0b',
  coinlingGlow: '#fbbf24',
  hodler: '#3b82f6',
  hodlerGlow: '#60a5fa',
  whale: '#6366f1',
  whaleGlow: '#818cf8',

  sclera: '#f5f5f5',
  pupil: '#0F172A',
  evolutionGlow: '#FFD700',
} as const;

export type ColorToken = keyof typeof colors;
