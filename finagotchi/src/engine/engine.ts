/**
 * Clock-free Finagotchi engine.
 *
 * `engine.sample(t)` is a pure function of time: pause, resume, seek, test, and
 * hardware export all produce the same frame. The only mutable state is the
 * current configuration (shape, expression, state, look), and every setter is
 * dated so transitions remain deterministic.
 */

import { clamp, easings, lerp, r2 } from '../utils/math';
import { blendExpression, DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type BotExpression, type PetMood } from './expressions';
import { blinkScale, eyePoses, liveliness, type HeadGaze, type LivelinessOptions } from './face';
import { PROFILES, PROFILE_SAMPLES, type ProfileName } from './profiles';
import { blend, capsulePath, circle, closedPath, radiusAtAngle, silhouette, toPoints, type Point, type Silhouette } from './shape';

export type StateId = ProfileName;

export interface EyeCfg {
  w: number;
  h: number;
  tilt: number;
  open: number;
}

interface Pose {
  sil: Silhouette;
  offX: number;
  offY: number;
  gaze: HeadGaze;
  split: number;
  eyes: [EyeCfg, EyeCfg];
  eyeAlpha: number;
  bodyAlpha: number;
  color: string;
  glowColor?: string;
}

interface StateDef {
  id: StateId;
  pose: (t: number) => Pose;
  morph: number;
}

export interface Look {
  yaw: number;
  pitch: number;
  mix: number;
  wander: number;
}

export interface RenderedEye {
  d: string;
  matrix: string;
  alpha: number;
}

export interface Frame {
  bodyPath: string;
  bodyAlpha: number;
  color: string;
  glowColor?: string;
  eyes: RenderedEye[];
}

const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, wander: 1 };

const STATE_DEFS: Record<StateId, StateDef> = {
  egg: {
    id: 'egg',
    morph: 0.45,
    pose: () => ({
      sil: silhouette('egg'),
      offX: 0,
      offY: 0.04,
      gaze: { yaw: 0, pitch: 18, roll: 0 },
      split: 12,
      eyes: [
        { w: 0.16, h: 0.06, tilt: 0, open: 1 },
        { w: 0.16, h: 0.06, tilt: 0, open: 1 },
      ],
      eyeAlpha: 1,
      bodyAlpha: 1,
      color: '#D4C8B8',
    }),
  },
  coinling: {
    id: 'coinling',
    morph: 0.45,
    pose: () => ({
      sil: silhouette('coinling'),
      offX: 0,
      offY: 0,
      gaze: { yaw: 0, pitch: -8, roll: 0 },
      split: 16,
      eyes: [
        { w: 0.22, h: 0.22, tilt: 0, open: 1 },
        { w: 0.22, h: 0.22, tilt: 0, open: 1 },
      ],
      eyeAlpha: 1,
      bodyAlpha: 1,
      color: '#f59e0b',
      glowColor: '#fbbf24',
    }),
  },
  hodler: {
    id: 'hodler',
    morph: 0.45,
    pose: () => ({
      sil: silhouette('hodler'),
      offX: 0,
      offY: -0.03,
      gaze: { yaw: 0, pitch: 2, roll: 0 },
      split: 14,
      eyes: [
        { w: 0.22, h: 0.09, tilt: 0, open: 1 },
        { w: 0.22, h: 0.09, tilt: 0, open: 1 },
      ],
      eyeAlpha: 1,
      bodyAlpha: 1,
      color: '#3b82f6',
      glowColor: '#60a5fa',
    }),
  },
  whale: {
    id: 'whale',
    morph: 0.55,
    pose: () => ({
      sil: silhouette('whale'),
      offX: 0,
      offY: 0.05,
      gaze: { yaw: 0, pitch: -12, roll: 0 },
      split: 13,
      eyes: [
        { w: 0.14, h: 0.09, tilt: 0, open: 1 },
        { w: 0.14, h: 0.09, tilt: 0, open: 1 },
      ],
      eyeAlpha: 1,
      bodyAlpha: 1,
      color: '#6366f1',
      glowColor: '#818cf8',
    }),
  },
};

const STATE_ORDER: StateId[] = ['egg', 'coinling', 'hodler', 'whale'];

function lerpEyeCfg(a: EyeCfg, b: EyeCfg, t: number): EyeCfg {
  return {
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
    tilt: lerp(a.tilt, b.tilt, t),
    open: lerp(a.open, b.open, t),
  };
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  return {
    sil: blend(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEyeCfg(a.eyes[0], b.eyes[0], t), lerpEyeCfg(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    color: t < 0.5 ? a.color : b.color,
    glowColor: t < 0.5 ? a.glowColor : b.glowColor,
  };
}

export interface FinagotchiEngineOptions {
  scale?: number;
  initial?: StateId;
  liveliness?: LivelinessOptions;
}

export class FinagotchiEngine {
  readonly scale: number;
  private readonly liveOpt: LivelinessOptions;

  private cur: StateId;
  private prev: StateId | null = null;
  private departFige: Pose | null = null;
  private tCur = 0;
  private tPrev = 0;

  private shape: number[] | null = null;
  private shapePrev: number[] | null = null;
  private shapeAt = -10;

  private expr: BotExpression | null = null;
  private exprPrev: BotExpression | null = null;
  private exprAt = -10;

  private look: Look = NO_LOOK;
  private lookPrev: Look = NO_LOOK;
  private lookAt = -10;
  private lookMorph = 0.24;

  private pts: Point[] = [];

  constructor(opts: FinagotchiEngineOptions = {}) {
    this.scale = opts.scale ?? 100;
    this.liveOpt = opts.liveliness ?? { wander: 1, blink: true, float: true };
    this.cur = opts.initial ?? 'egg';
  }

  get state(): StateId {
    return this.cur;
  }

  /** Change lifecycle state. Dated so the transition is deterministic. */
  setState(id: StateId, now: number) {
    if (id === this.cur) return;
    const def = STATE_DEFS[this.cur];
    if (!def) return;

    const inTransition = this.prev !== null && now - this.tCur < def.morph;
    this.departFige = inTransition ? this.poseComposee(now) : null;
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.cur = id;
    this.tCur = now;
  }

  /** Override the body profile (e.g. custom shape picker). */
  setShape(radii: number[] | null, now = 0) {
    if (radii === this.shape) return;
    this.shapePrev = this.shape;
    this.shape = radii;
    this.shapeAt = now;
  }

  /** Override the resting expression (mood). */
  setExpression(mood: PetMood | null, now = 0) {
    const next = mood ? EXPRESSION_BY_ID.get(mood) ?? null : null;
    if (next === this.expr) return;
    this.exprPrev = this.expr;
    this.expr = next;
    this.exprAt = now;
  }

  /** External gaze target, e.g. from touch position. */
  setLook(look: Look | null, now: number, morph = 0.24) {
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.wander)) {
      return;
    }
    this.lookPrev = this.lookAtTime(now);
    this.look = look ?? NO_LOOK;
    this.lookAt = now;
    this.lookMorph = morph;
  }

  private shapeAtTime(now: number): number[] | null {
    const to = this.shape;
    const from = this.shapePrev;
    if (!to || !from) return to;
    const k = (now - this.shapeAt) / 0.45;
    if (k >= 1) return to;
    const t = easings.easeOutQuint(clamp(k));
    return to.map((r, i) => lerp(from[i] ?? r, r, t));
  }

  private exprAtTime(now: number): BotExpression | null {
    const to = this.expr;
    const from = this.exprPrev;
    if (!to || !from) return to;
    const k = (now - this.exprAt) / 0.45;
    if (k >= 1) return to;
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)));
  }

  private lookAtTime(now: number): Look {
    const k = (now - this.lookAt) / this.lookMorph;
    if (k >= 1) return this.look;
    const t = easings.easeOutQuint(clamp(k));
    return {
      yaw: lerp(this.lookPrev.yaw, this.look.yaw, t),
      pitch: lerp(this.lookPrev.pitch, this.look.pitch, t),
      mix: lerp(this.lookPrev.mix, this.look.mix, t),
      wander: lerp(this.lookPrev.wander, this.look.wander, t),
    };
  }

  private posed(def: StateDef, t: number, shape: number[] | null, expr: BotExpression | null): Pose {
    let pose = def.pose(t);
    if (shape) {
      pose = { ...pose, sil: { ...pose.sil, radii: shape } };
    }
    if (expr) {
      pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
    }
    return pose;
  }

  private origine(now: number, shape: number[] | null, expr: BotExpression | null): Pose | null {
    if (this.departFige) return this.departFige;
    if (!this.prev) return null;
    const prevDef = STATE_DEFS[this.prev];
    if (!prevDef) return null;
    return this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr);
  }

  private poseComposee(now: number): Pose {
    const def = STATE_DEFS[this.cur];
    if (!def) return STATE_DEFS.egg.pose(0);

    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    const pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
    const since = now - this.tCur;
    if (since >= def.morph) return pose;

    const origin = this.origine(now, shape, expr);
    if (!origin) return pose;
    return blendPose(origin, pose, easings.easeOutQuint(clamp(since / def.morph)));
  }

  /** Pure function of time. Render this frame, or any other t, identically. */
  sample(now: number): Frame {
    const R = this.scale;
    const def = STATE_DEFS[this.cur];
    if (!def) throw new Error(`Unknown state: ${this.cur}`);

    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);

    const since = now - this.tCur;
    const origin = since < def.morph ? this.origine(now, shape, expr) : null;
    if (origin) {
      const ratio = easings.easeOutQuint(clamp(since / def.morph));
      pose = blendPose(origin, pose, ratio);
    }

    const alive = pose.eyeAlpha > 0.01;
    const look = this.lookAtTime(now);
    const life = liveliness(now, { ...this.liveOpt, wander: alive ? look.wander : 0 });

    const gaze: HeadGaze = {
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      roll: pose.gaze.roll + life.dRoll,
    };

    const lid = blinkScale(life.lid);
    const offX = pose.offX + life.driftX;
    const offY = pose.offY + life.driftY;

    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath,
    };

    const bodyPath = closedPath(toPoints(sil, R, this.pts));

    const bodyRadius = (x: number, y: number) =>
      radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);

    const eyes: RenderedEye[] = [];
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split);
      for (let i = 0; i < 2; i++) {
        const e = poses[i];
        if (!e || e.depth <= 0.02) continue;
        const cfg = pose.eyes[i];
        if (!cfg) continue;

        const fit = bodyRadius(e.x, e.y);
        const phi = (cfg.tilt * Math.PI) / 180;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const ax = e.a * cp + e.c * sp;
        const ay = e.b * cp + e.d * sp;
        const cx = -e.a * sp + e.c * cp;
        const cy = -e.b * sp + e.d * cp;
        const k = blinkScale(Math.min(lid, cfg.open));

        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx)},${r2(cy * k)},${r2(e.x * fit + offX * R)},${r2(e.y * fit + offY * R)})`,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
        });
      }
    }

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      color: pose.color,
      glowColor: pose.glowColor,
      eyes,
    };
  }

  /** Advance to the next lifecycle stage. */
  evolve(now: number): boolean {
    const idx = STATE_ORDER.indexOf(this.cur);
    if (idx >= STATE_ORDER.length - 1) return false;
    this.setState(STATE_ORDER[idx + 1], now);
    return true;
  }
}
