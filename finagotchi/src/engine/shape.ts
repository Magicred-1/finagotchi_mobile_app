/**
 * Silhouette geometry: radial profile + pose.
 *
 * All shapes share the same number of sample angles, so any two silhouettes
 * can be morphed by linearly interpolating their radii.
 */

import { TAU, lerp, r2 } from '../utils/math';
import { PROFILE_SAMPLES, PROFILES, type ProfileName } from './profiles';

export interface Point {
  x: number;
  y: number;
}

export interface Silhouette {
  radii: number[];
  /** Rotation of the profile, in radians. */
  rot: number;
  /** Center offset in ball-radius units. */
  cx: number;
  cy: number;
  /** Squash & stretch applied in screen space (after rotation). */
  sx: number;
  sy: number;
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

export function silhouette(name: ProfileName, pose: Partial<Silhouette> = {}): Silhouette {
  return {
    radii: [...PROFILES[name]],
    rot: 0,
    cx: 0,
    cy: 0,
    sx: 1,
    sy: 1,
    ...pose,
  };
}

export function circle(radius: number, pose: Partial<Silhouette> = {}): Silhouette {
  return {
    radii: new Array(PROFILE_SAMPLES).fill(radius),
    rot: 0,
    cx: 0,
    cy: 0,
    sx: 1,
    sy: 1,
    ...pose,
  };
}

/**
 * Blend two silhouettes. Reuses `out` to avoid per-frame allocation.
 */
export function blend(
  a: Silhouette,
  b: Silhouette,
  t: number,
  out?: Silhouette
): Silhouette {
  const dst =
    out ?? {
      radii: new Array<number>(PROFILE_SAMPLES),
      rot: 0,
      cx: 0,
      cy: 0,
      sx: 1,
      sy: 1,
    };

  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    dst.radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t);
  }

  let dRot = b.rot - a.rot;
  while (dRot > Math.PI) dRot -= TAU;
  while (dRot < -Math.PI) dRot += TAU;

  dst.rot = a.rot + dRot * t;
  dst.cx = lerp(a.cx, b.cx, t);
  dst.cy = lerp(a.cy, b.cy, t);
  dst.sx = lerp(a.sx, b.sx, t);
  dst.sy = lerp(a.sy, b.sy, t);

  return dst;
}

/**
 * Project a silhouette to screen points. Reuses `out` to avoid allocation.
 */
export function toPoints(s: Silhouette, scale: number, out: Point[] = []): Point[] {
  const cr = Math.cos(s.rot);
  const sr = Math.sin(s.rot);

  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const r = s.radii[i] ?? 1;
    const x = r * (COS[i] ?? 0);
    const y = r * (SIN[i] ?? 0);
    const rx = x * cr - y * sr;
    const ry = x * sr + y * cr;
    const p = out[i] ?? { x: 0, y: 0 };
    p.x = (rx * s.sx + s.cx) * scale;
    p.y = (ry * s.sy + s.cy) * scale;
    out[i] = p;
  }

  out.length = PROFILE_SAMPLES;
  return out;
}

/**
 * Closed polyline → cubic Catmull-Rom. With 64 points centered tangents are
 * plenty smooth, and r2() keeps the path string short.
 */
export function closedPath(pts: Point[], tension = 1 / 6): string {
  const n = pts.length;
  if (n < 3) return '';

  const first = pts[0];
  if (!first) return '';

  let d = `M${r2(first.x)} ${r2(first.y)}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i % n];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (!p0 || !p1 || !p2 || !p3) continue;

    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;

    d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
  }

  return `${d}Z`;
}

/**
 * Radius at an arbitrary angle by linear interpolation between the two nearest
 * sample angles. Used to fit eyes to the current silhouette contour.
 */
export function radiusAtAngle(radii: number[], angle: number): number {
  const n = radii.length;
  const t = (angle / TAU) * n;
  const i0 = Math.floor(t) % n;
  const i1 = (i0 + 1) % n;
  const k = t - Math.floor(t);
  const a = radii[i0];
  const b = radii[i1];
  if (a === undefined || b === undefined) return 1;
  return a + (b - a) * k;
}

/**
 * Capsule (stadium) centered at the origin.
 * This is the exact eye shape used by the engine.
 */
export function capsulePath(w: number, h: number): string {
  const hw = Math.max(w, 0.01) / 2;
  const hh = Math.max(h, 0.01) / 2;
  const r = Math.min(hw, hh);
  return (
    `M${r2(-hw)} ${r2(-hh + r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}` +
    `L${r2(hw - r)} ${r2(-hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}` +
    `L${r2(hw)} ${r2(hh - r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}` +
    `L${r2(-hw + r)} ${r2(hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`
  );
}
