/**
 * Theme tokens shared by the radial pet engine.
 */

export const colors = {
  background: '#07111F',
  surface: '#0E1B2E',
  text: '#FFFFFF',
  textMuted: '#8FA2B8',
  primary: '#35D7FF',

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
