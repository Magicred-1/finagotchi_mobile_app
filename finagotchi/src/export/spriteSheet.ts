/**
 * Hardware sprite export for the ESP32-S3 companion display.
 *
 * TODO: Implement real rendering + capture once `react-native-view-shot`
 * or `expo-gl` offscreen canvas is wired up. For now returns mock RGB565
 * data so the engine can be consumed and typed immediately.
 *
 * Because the engine is clock-free (`engine.sample(t)`), exact frames can be
 * generated deterministically later by sampling at fixed intervals:
 *
 *   const engine = new FinagotchiEngine({ scale: 64, initial: stage });
 *   for (let i = 0; i < frames; i++) {
 *     const frame = engine.sample(i / fps);
 *     // render frame.bodyPath + frame.eyes to a 128x128 surface
 *   }
 */

import type { StateId } from '../engine/engine';

export interface SpriteSheetResult {
  rgba: Uint8Array;
  width: number;
  height: number;
}

function rgbaToRgb565(r: number, g: number, b: number): number {
  const r5 = (r >> 3) & 0x1f;
  const g6 = (g >> 2) & 0x3f;
  const b5 = (b >> 3) & 0x1f;
  return (r5 << 11) | (g6 << 5) | b5;
}

export async function generateSpriteSheet(
  stage: StateId,
  mood: string,
  frames = 8,
  size = 128
): Promise<SpriteSheetResult> {
  // eslint-disable-next-line no-console
  console.log(
    `[spriteSheet] TODO: render ${frames} frames for ${stage}/${mood} at ${size}px`
  );

  const pixelCount = size * size;
  const rgba = new Uint8Array(pixelCount * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.sqrt(Math.pow(x - size / 2, 2) + Math.pow(y - size / 2, 2));
      const t = Math.min(1, d / (size / 2));
      rgba[i] = Math.floor(245 * (1 - t) + 7 * t);
      rgba[i + 1] = Math.floor(158 * (1 - t) + 17 * t);
      rgba[i + 2] = Math.floor(11 * (1 - t) + 31 * t);
      rgba[i + 3] = 255;
    }
  }

  const rgb565 = new Uint8Array(pixelCount * 2);
  for (let i = 0; i < pixelCount; i++) {
    const value = rgbaToRgb565(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    rgb565[i * 2] = value & 0xff;
    rgb565[i * 2 + 1] = (value >> 8) & 0xff;
  }

  return {
    rgba: rgb565,
    width: size,
    height: size,
  };
}
