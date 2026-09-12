import { sha256Bytes, utf8Bytes } from './sha256';

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. Consumes exactly one draw. */
  nextRange(min: number, max: number): number;
  /** Uniform element pick. Consumes exactly one draw. Throws on empty array. */
  pick<T>(array: readonly T[]): T;
}

/**
 * Deterministic seeded PRNG (mulberry32).
 *
 * Seed convention (MUST match on client and server):
 *   seedBytes = SHA256(utf8(`${wallet}|${day}`))  where day is UTC `YYYY-MM-DD`
 *   state     = uint32 from seedBytes[0..4], BIG-ENDIAN
 *             = (b[0]<<24 | b[1]<<16 | b[2]<<8 | b[3]) >>> 0
 *
 * Every consumer must draw from the stream in the exact same order;
 * see the determinism contract in index.ts.
 */
export function createRng(seedInput: string | Uint8Array): Rng {
  const seedBytes = typeof seedInput === 'string' ? sha256Bytes(utf8Bytes(seedInput)) : seedInput;
  let state =
    ((seedBytes[0] << 24) | (seedBytes[1] << 16) | (seedBytes[2] << 8) | seedBytes[3]) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) | 0;
    t ^= t >>> 14;
    return (t >>> 0) / 4294967296;
  };

  return {
    next,
    nextRange(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(array: readonly T[]): T {
      if (array.length === 0) throw new Error('rng.pick: empty array');
      return array[Math.floor(next() * array.length)];
    },
  };
}
