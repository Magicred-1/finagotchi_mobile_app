/**
 * Mood expressions for Finagotchi.
 *
 * Each expression defines head orientation (gaze), eye separation, and the
 * width/height/tilt/open of each eye. The engine blends between them smoothly.
 */

import { EYE_H, EYE_SPLIT, EYE_W, REST_GAZE, type HeadGaze } from './face';

export type PetMood = 'happy' | 'sleepy' | 'waiting' | 'calm' | 'excited' | 'sad';

export interface EyeCfg {
  w: number;
  h: number;
  /** Degrees, positive = top of the eye tilts right. */
  tilt: number;
  /** 1 = fully open, 0 = closed. Applied as vertical screen-space squish. */
  open: number;
}

export interface BotExpression {
  id: PetMood;
  gaze: HeadGaze;
  /** Eye separation half-angle in degrees. */
  split: number;
  eyes: [EyeCfg, EyeCfg];
}

const eye = (w: number, h: number, tilt = 0, open = 1): EyeCfg => ({
  w,
  h,
  tilt,
  open,
});

const pair = (w: number, h: number, tilt = 0, open = 1): [EyeCfg, EyeCfg] => [
  eye(w, h, tilt, open),
  eye(w, h, -tilt, open),
];

export const EXPRESSIONS: BotExpression[] = [
  {
    id: 'calm',
    gaze: { ...REST_GAZE },
    split: EYE_SPLIT,
    eyes: pair(EYE_W, EYE_H),
  },
  {
    id: 'happy',
    gaze: { yaw: 2, pitch: -10, roll: 0 },
    split: 19.5,
    eyes: pair(0.24, 0.15, 18),
  },
  {
    id: 'excited',
    gaze: { yaw: 4, pitch: -16, roll: 0 },
    split: 20.5,
    eyes: pair(0.3, 0.34, -8),
  },
  {
    id: 'waiting',
    gaze: { yaw: -8, pitch: -4, roll: -6 },
    split: 18.5,
    eyes: pair(0.22, 0.32, -6),
  },
  {
    id: 'sleepy',
    gaze: { yaw: 0, pitch: -4, roll: 0 },
    split: 18,
    eyes: pair(0.2, 0.34, 0, 0.42),
  },
  {
    id: 'sad',
    gaze: { yaw: 2, pitch: -2, roll: 0 },
    split: 18.5,
    eyes: pair(0.22, 0.32, -24),
  },
];

export const EXPRESSION_BY_ID = new Map<PetMood, BotExpression>(
  EXPRESSIONS.map((e) => [e.id, e])
);

export const DEFAULT_EXPRESSION: PetMood = 'calm';

function lerpEyeCfg(a: EyeCfg, b: EyeCfg, t: number): EyeCfg {
  return {
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
    tilt: a.tilt + (b.tilt - a.tilt) * t,
    open: a.open + (b.open - a.open) * t,
  };
}

export function blendExpression(a: BotExpression, b: BotExpression, t: number): BotExpression {
  return {
    id: b.id,
    gaze: {
      yaw: a.gaze.yaw + (b.gaze.yaw - a.gaze.yaw) * t,
      pitch: a.gaze.pitch + (b.gaze.pitch - a.gaze.pitch) * t,
      roll: a.gaze.roll + (b.gaze.roll - a.gaze.roll) * t,
    },
    split: a.split + (b.split - a.split) * t,
    eyes: [lerpEyeCfg(a.eyes[0], b.eyes[0], t), lerpEyeCfg(a.eyes[1], b.eyes[1], t)],
  };
}
