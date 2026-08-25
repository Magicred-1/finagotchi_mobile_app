/**
 * Math utilities for the Finagotchi radial engine.
 *
 * Designed to be clock-free: every helper is a pure function of its inputs.
 */

export const TAU = Math.PI * 2;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export type Easing = (t: number) => number;

/**
 * Exponential ease-outs measured from the reference: body transitions never
 * overshoot. Only local effects (eye pop, notification) use spring-like pop.
 */
export const easings = {
  easeOutCubic: (t: number) => 1 - Math.pow(1 - clamp(t), 3),
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutQuint: (t: number) => 1 - Math.pow(1 - clamp(t), 5),
} satisfies Record<string, Easing>;

/**
 * Periodic 1D noise that loops seamlessly over `period`.
 * Used for organic gaze drift without state.
 */
export function loopNoise(t: number, period: number, seed = 0): number {
  const p = (t / period) * TAU;
  return (
    0.55 * Math.sin(p + seed) +
    0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) +
    0.15 * Math.sin(3 * p + seed * 2.3 + 2.4)
  );
}

/**
 * Deterministic PRNG (mulberry32). Same seed always produces the same sequence,
 * which lets us pre-generate blink schedules without timers or state.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Round to 2 decimals. Cuts SVG path string weight roughly in half at 60 fps.
 */
export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Modulo that wraps negative numbers correctly.
 */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
