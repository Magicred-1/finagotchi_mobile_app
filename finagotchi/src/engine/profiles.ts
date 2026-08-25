/**
 * Radial profiles for the four Finagotchi lifecycle stages.
 *
 * Sampled at 64 angles (same-angle correspondence makes morphing a simple
 * radius interpolation). Theta = 0 points right and grows clockwise, matching
 * SVG's y-down coordinate system.
 */

import { TAU } from '../utils/math';

export const PROFILE_SAMPLES = 64;

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);

function eggRadii(): number[] {
  const base = 0.45;
  return ANGLES.map((theta, i) => {
    const degrees = (i / PROFILE_SAMPLES) * 360;
    const n = degrees < 180 ? 2.5 : 1.8;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const superellipse = Math.pow(Math.pow(cos, n) + Math.pow(sin, n), -1 / n);
    const wobble = 0.015 * Math.sin((degrees * 3 * Math.PI) / 180);
    return Math.max(0, Math.min(1, base * superellipse + wobble));
  });
}

function coinlingRadii(): number[] {
  const base = 0.48;
  const n = 4;
  return ANGLES.map((theta, i) => {
    const degrees = (i / PROFILE_SAMPLES) * 360;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const squircle = Math.pow(Math.pow(cos, n) + Math.pow(sin, n), -1 / n);
    const wobble = 0.01 * Math.sin((degrees * 5 * Math.PI) / 180);
    return Math.max(0, Math.min(1, base * squircle + wobble));
  });
}

function hodlerRadii(): number[] {
  return ANGLES.map((theta) => {
    const base = 0.38 + 0.22 * Math.abs(Math.cos(theta * 2));
    return Math.max(0, Math.min(1, Math.pow(base, 0.4)));
  });
}

function whaleRadii(): number[] {
  const a = 0.58;
  const b = 0.36;
  return ANGLES.map((theta) => {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const denominator = Math.sqrt(Math.pow(b * cos, 2) + Math.pow(a * sin, 2));
    return Math.max(0, Math.min(1, (a * b) / (denominator || 1)));
  });
}

export const PROFILES = {
  egg: eggRadii(),
  coinling: coinlingRadii(),
  hodler: hodlerRadii(),
  whale: whaleRadii(),
} as const;

export type ProfileName = keyof typeof PROFILES;
