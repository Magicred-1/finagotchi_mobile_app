/**
 * Clock-free Finagotchi engine.
 *
 * `engine.sample(t)` is a pure function of time: pause, resume, seek, test, and
 * hardware export all produce the same frame. The only mutable state is the
 * current configuration (shape, expression, state, look), and every setter is
 * dated so transitions remain deterministic.
 */

import { clamp, easings, lerp, r2, TAU } from '../utils/math';
import { blendExpression, DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type BotExpression, type PetMood } from './expressions';
import { blinkScale, eyePoses, liveliness, type HeadGaze, type LivelinessOptions } from './face';
import { GHOST_PROFILES, PROFILES, PROFILE_SAMPLES, type ProfileName } from './profiles';
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

/**
 * All catalogue poses are time-independent, so each is computed once and the
 * same object is returned on every frame. Poses are treated as immutable
 * everywhere (blends and overrides always allocate a fresh object), which
 * makes sharing them safe and removes steady-state per-frame allocation.
 */
function staticPose(make: () => Pose): (t: number) => Pose {
  let cached: Pose | null = null;
  return () => (cached ??= make());
}

export interface Look {
  yaw: number;
  pitch: number;
  mix: number;
  wander: number;
}

export interface RenderedEye {
  d: string;
  /**
   * SVG affine transform as numbers in `matrix(a,b,c,d,e,f)` order. Numeric so
   * the render hot path never builds or parses a transform string; callers
   * that need the string form (e.g. PetEyes) format it themselves.
   */
  m: [number, number, number, number, number, number];
  alpha: number;
}

/**
 * Named points on the creature that accessories attach to, so cosmetics ride
 * the same pose math as the eyes instead of sitting at fixed coordinates.
 */
export type AnchorName = 'face' | 'headTop' | 'aboveHead' | 'chest' | 'torso' | 'cheek';

/** SVG affine transform in matrix(a,b,c,d,e,f) order, same as RenderedEye.m. */
export type AnchorMatrix = [number, number, number, number, number, number];

export type Anchors = Partial<Record<AnchorName, AnchorMatrix>>;

export interface Frame {
  bodyPath: string;
  bodyAlpha: number;
  color: string;
  glowColor?: string;
  eyes: RenderedEye[];
  anchors: Anchors;
  /**
   * Tee geometry derived from the live body contour, so the shirt wraps the
   * creature's actual silhouette. Only present while the tee is equipped
   * (see setShirtEnabled). `d` is the shirt body, `collar` the collar trim.
   */
  shirt?: { d: string; collar: string };
}

const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, wander: 1 };
const NO_LIVELINESS = {
  dYaw: 0,
  dPitch: 0,
  dRoll: 0,
  lid: 1,
  driftX: 0,
  driftY: 0,
  breath: 1,
};

const STATE_DEFS: Record<StateId, StateDef> = {
  egg: {
    id: 'egg',
    morph: 0.45,
    pose: staticPose(() => ({
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
    })),
  },
  coinling: {
    id: 'coinling',
    morph: 0.45,
    pose: staticPose(() => ({
      sil: silhouette('coinling', { radii: [...GHOST_PROFILES.hem] }),
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
    })),
  },
  hodler: {
    id: 'hodler',
    morph: 0.45,
    pose: staticPose(() => ({
      sil: silhouette('hodler', { radii: [...GHOST_PROFILES.curl] }),
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
    })),
  },
  whale: {
    id: 'whale',
    morph: 0.55,
    pose: staticPose(() => ({
      sil: silhouette('whale', { radii: [...GHOST_PROFILES.arms] }),
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
    })),
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

/** Glasses artwork rests with lens centers at ±0.22R; scale x to the live eye separation. */
const GLASSES_REST_HALF_SEP = 0.22;
/** Rest direction of the cheek charm (normalized from the original 0.46, -0.34 spot). */
const CHEEK_DIR = { x: 0.804, y: -0.595 };
/**
 * Body radius the accessory artwork is drawn for. Anchors scale the artwork
 * by (contour fit / REF_RADIUS) so the same cosmetic fits a small egg and a
 * wide whale instead of being one absolute size.
 */
const REF_RADIUS = 0.5;

/**
 * Accessory anchors derived from the same pose math that places the eyes:
 * contour fit, body drift, gaze roll, and breath. Accessories rendered through
 * these matrices track the creature's posture instead of floating at fixed
 * canvas fractions.
 */
function composeAnchors(
  eyeCenters: Point[],
  gaze: HeadGaze,
  radii: number[],
  rot: number,
  offX: number,
  offY: number,
  breath: number,
  R: number
): Anchors {
  const anchors: Anchors = {};
  const roll = (gaze.roll * Math.PI) / 180;

  const matrix = (x: number, y: number, rotAngle: number, sx: number, sy: number): AnchorMatrix => {
    const c = Math.cos(rotAngle);
    const s = Math.sin(rotAngle);
    return [sx * c, sx * s, -sy * s, sy * c, x, y];
  };

  /** Contour radius along a unit direction, same fit math as the eyes. */
  const fitAt = (dx: number, dy: number): number => {
    // radiusAtAngle indexes by floor, so the angle must be normalized to
    // [0, TAU) — raw atan2 goes negative for the whole upper half.
    const angle = (((Math.atan2(dy, dx) - rot) % TAU) + TAU) % TAU;
    return radiusAtAngle(radii, angle);
  };

  /** Point on the body contour along a unit direction. */
  const contour = (dx: number, dy: number, frac: number): Point => {
    const fit = fitAt(dx, dy);
    return { x: dx * fit * frac * R + offX * R, y: dy * fit * frac * R + offY * R };
  };

  /** Artwork scale for a direction: body size relative to the reference body. */
  const sizeAt = (dx: number, dy: number): number =>
    clamp(fitAt(dx, dy) / REF_RADIUS, 0.7, 1.4);

  const [left, right] = eyeCenters;
  if (left && right) {
    const mx = (left.x + right.x) / 2;
    const my = (left.y + right.y) / 2;
    const tilt = Math.atan2(right.y - left.y, right.x - left.x);
    const sep = Math.hypot(right.x - left.x, right.y - left.y) / 2;
    const sx = clamp(sep / (GLASSES_REST_HALF_SEP * R), 0.4, 1.6);
    anchors.face = matrix(mx, my, tilt, sx, 1);
  }

  const top = contour(0, -1, 1);
  const headSize = breath * sizeAt(0, -1);
  anchors.headTop = matrix(top.x, top.y, roll, headSize, headSize);
  anchors.aboveHead = matrix(top.x, top.y - 0.18 * R * headSize, roll, headSize, headSize);

  const chest = contour(0, 1, 0.78);
  const chestSize = breath * sizeAt(0, 1);
  anchors.chest = matrix(chest.x, chest.y, roll, chestSize, chestSize);

  // Shirt center sits higher than the bowtie and wraps the whole torso.
  const torso = contour(0, 1, 0.42);
  anchors.torso = matrix(torso.x, torso.y, roll, chestSize, chestSize);

  const cheek = contour(CHEEK_DIR.x, CHEEK_DIR.y, 0.95);
  const cheekSize = breath * sizeAt(CHEEK_DIR.x, CHEEK_DIR.y);
  anchors.cheek = matrix(cheek.x, cheek.y, roll, cheekSize, cheekSize);

  return anchors;
}

/**
 * Tee outline built from the live body contour points: the hem follows the
 * creature's silhouette (slightly inset, leaving a body-colored hem line),
 * with sleeves poking out at the shoulders and a scooped collar chord.
 * Screen angles, y-down: 90° is the bottom of the creature.
 */
function composeShirt(
  body: Point[],
  cx: number,
  cy: number,
  R: number
): { d: string; collar: string } {
  /** Contour point at a screen angle, lerped between the two nearest samples. */
  const ptAt = (deg: number): Point => {
    const t = (deg / 360) * body.length;
    const i0 = ((Math.floor(t) % body.length) + body.length) % body.length;
    const i1 = (i0 + 1) % body.length;
    const k = t - Math.floor(t);
    const a = body[i0];
    const b = body[i1];
    if (!a || !b) return { x: cx, y: cy };
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
  };

  /** Contour point scaled toward (k < 1) or past (k > 1) the body center. */
  const at = (deg: number, k: number): Point => {
    const p = ptAt(deg);
    return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k };
  };

  const outline: Point[] = [
    at(20, 0.9), // right collar
    at(25, 1.16), // right sleeve
    at(37, 1.16),
    at(45, 0.93), // right underarm
    at(54, 0.95),
    at(66, 0.95),
    at(78, 0.95),
    at(90, 0.95), // hem bottom
    at(102, 0.95),
    at(114, 0.95),
    at(126, 0.95),
    at(135, 0.93), // left underarm
    at(143, 1.16), // left sleeve
    at(155, 1.16),
    at(160, 0.9), // left collar
  ];

  const c1 = at(24, 0.87);
  const c2 = at(156, 0.87);
  const collar =
    `M${r2(c1.x)} ${r2(c1.y)}` +
    `Q${r2((c1.x + c2.x) / 2)} ${r2(Math.max(c1.y, c2.y) + 0.06 * R)} ${r2(c2.x)} ${r2(c2.y)}`;

  return { d: closedPath(outline), collar };
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

  /** Whether frames include fitted-tee geometry (on while the tee is equipped). */
  private shirtEnabled = false;

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

  /** Compute the fitted-tee path each frame (only while the tee is equipped). */
  setShirtEnabled(enabled: boolean) {
    this.shirtEnabled = enabled;
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

  private composeFrame(
    R: number,
    def: StateDef,
    now: number,
    shape: number[] | null,
    expr: BotExpression | null,
    includeLiveliness: boolean
  ): Frame {
    let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);

    const since = now - this.tCur;
    const origin = since < def.morph ? this.origine(now, shape, expr) : null;
    if (origin) {
      const ratio = easings.easeOutQuint(clamp(since / def.morph));
      pose = blendPose(origin, pose, ratio);
    }

    const alive = pose.eyeAlpha > 0.01;
    const look = includeLiveliness ? this.lookAtTime(now) : NO_LOOK;
    const life = includeLiveliness
      ? liveliness(now, { ...this.liveOpt, wander: alive ? look.wander : 0 })
      : NO_LIVELINESS;

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

    // Fitted tee: derived from the same contour points as the body, so it
    // wraps the current silhouette (and breathes) instead of a fixed shape.
    const shirt = this.shirtEnabled
      ? composeShirt(this.pts, sil.cx * R, sil.cy * R, R)
      : undefined;

    const bodyRadius = (x: number, y: number) =>
      radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);

    const eyes: RenderedEye[] = [];
    const eyeCenters: Point[] = [];
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split);
      for (let i = 0; i < 2; i++) {
        const e = poses[i];
        if (!e || e.depth <= 0.02) continue;
        const cfg = pose.eyes[i];
        if (!cfg) continue;

        const fit = bodyRadius(e.x, e.y);
        const ex = e.x * fit + offX * R;
        const ey = e.y * fit + offY * R;
        eyeCenters.push({ x: ex, y: ey });
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
          m: [ax, ay * k, cx, cy * k, ex, ey],
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
        });
      }
    }

    const anchors = composeAnchors(eyeCenters, gaze, pose.sil.radii, pose.sil.rot, offX, offY, life.breath, R);

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      color: pose.color,
      glowColor: pose.glowColor,
      eyes,
      anchors,
      shirt,
    };
  }

  /** Pure function of time. Render this frame, or any other t, identically. */
  sample(now: number): Frame {
    const R = this.scale;
    const def = STATE_DEFS[this.cur];
    if (!def) throw new Error(`Unknown state: ${this.cur}`);

    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    return this.composeFrame(R, def, now, shape, expr, true);
  }

  /**
   * Fast path for callers that only need a still frame (no liveliness, blink,
   * gaze drift, or breath). Used by RadialPet when the creature is not moving.
   */
  sampleStatic(now = 0): Frame {
    const R = this.scale;
    const def = STATE_DEFS[this.cur];
    if (!def) throw new Error(`Unknown state: ${this.cur}`);

    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    return this.composeFrame(R, def, now, shape, expr, false);
  }

  /** Advance to the next lifecycle stage. */
  evolve(now: number): boolean {
    const idx = STATE_ORDER.indexOf(this.cur);
    if (idx >= STATE_ORDER.length - 1) return false;
    this.setState(STATE_ORDER[idx + 1], now);
    return true;
  }
}
