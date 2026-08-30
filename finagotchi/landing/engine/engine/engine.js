/**
 * Clock-free Finagotchi engine.
 *
 * `engine.sample(t)` is a pure function of time: pause, resume, seek, test, and
 * hardware export all produce the same frame. The only mutable state is the
 * current configuration (shape, expression, state, look), and every setter is
 * dated so transitions remain deterministic.
 */
import { clamp, easings, lerp, r2 } from '../utils/math.js';
import { blendExpression, EXPRESSION_BY_ID } from './expressions.js';
import { blinkScale, eyePoses, liveliness } from './face.js';
import { GHOST_PROFILES } from './profiles.js';
import { blend, capsulePath, closedPath, radiusAtAngle, silhouette, toPoints } from './shape.js';
const NO_LOOK = { yaw: 0, pitch: 0, mix: 0, wander: 1 };
const NO_LIVELINESS = {
    dYaw: 0,
    dPitch: 0,
    dRoll: 0,
    lid: 1,
    driftX: 0,
    driftY: 0,
    breath: 1,
};
const STATE_DEFS = {
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
        }),
    },
    hodler: {
        id: 'hodler',
        morph: 0.45,
        pose: () => ({
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
        }),
    },
    whale: {
        id: 'whale',
        morph: 0.55,
        pose: () => ({
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
        }),
    },
};
const STATE_ORDER = ['egg', 'coinling', 'hodler', 'whale'];
function lerpEyeCfg(a, b, t) {
    return {
        w: lerp(a.w, b.w, t),
        h: lerp(a.h, b.h, t),
        tilt: lerp(a.tilt, b.tilt, t),
        open: lerp(a.open, b.open, t),
    };
}
function blendPose(a, b, t) {
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
export class FinagotchiEngine {
    constructor(opts = {}) {
        this.prev = null;
        this.departFige = null;
        this.tCur = 0;
        this.tPrev = 0;
        this.shape = null;
        this.shapePrev = null;
        this.shapeAt = -10;
        this.expr = null;
        this.exprPrev = null;
        this.exprAt = -10;
        this.look = NO_LOOK;
        this.lookPrev = NO_LOOK;
        this.lookAt = -10;
        this.lookMorph = 0.24;
        this.pts = [];
        this.scale = opts.scale ?? 100;
        this.liveOpt = opts.liveliness ?? { wander: 1, blink: true, float: true };
        this.cur = opts.initial ?? 'egg';
    }
    get state() {
        return this.cur;
    }
    /** Change lifecycle state. Dated so the transition is deterministic. */
    setState(id, now) {
        if (id === this.cur)
            return;
        const def = STATE_DEFS[this.cur];
        if (!def)
            return;
        const inTransition = this.prev !== null && now - this.tCur < def.morph;
        this.departFige = inTransition ? this.poseComposee(now) : null;
        this.prev = this.cur;
        this.tPrev = this.tCur;
        this.cur = id;
        this.tCur = now;
    }
    /** Override the body profile (e.g. custom shape picker). */
    setShape(radii, now = 0) {
        if (radii === this.shape)
            return;
        this.shapePrev = this.shape;
        this.shape = radii;
        this.shapeAt = now;
    }
    /** Override the resting expression (mood). */
    setExpression(mood, now = 0) {
        const next = mood ? EXPRESSION_BY_ID.get(mood) ?? null : null;
        if (next === this.expr)
            return;
        this.exprPrev = this.expr;
        this.expr = next;
        this.exprAt = now;
    }
    /** External gaze target, e.g. from touch position. */
    setLook(look, now, morph = 0.24) {
        if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.wander)) {
            return;
        }
        this.lookPrev = this.lookAtTime(now);
        this.look = look ?? NO_LOOK;
        this.lookAt = now;
        this.lookMorph = morph;
    }
    shapeAtTime(now) {
        const to = this.shape;
        const from = this.shapePrev;
        if (!to || !from)
            return to;
        const k = (now - this.shapeAt) / 0.45;
        if (k >= 1)
            return to;
        const t = easings.easeOutQuint(clamp(k));
        return to.map((r, i) => lerp(from[i] ?? r, r, t));
    }
    exprAtTime(now) {
        const to = this.expr;
        const from = this.exprPrev;
        if (!to || !from)
            return to;
        const k = (now - this.exprAt) / 0.45;
        if (k >= 1)
            return to;
        return blendExpression(from, to, easings.easeOutQuint(clamp(k)));
    }
    lookAtTime(now) {
        const k = (now - this.lookAt) / this.lookMorph;
        if (k >= 1)
            return this.look;
        const t = easings.easeOutQuint(clamp(k));
        return {
            yaw: lerp(this.lookPrev.yaw, this.look.yaw, t),
            pitch: lerp(this.lookPrev.pitch, this.look.pitch, t),
            mix: lerp(this.lookPrev.mix, this.look.mix, t),
            wander: lerp(this.lookPrev.wander, this.look.wander, t),
        };
    }
    posed(def, t, shape, expr) {
        let pose = def.pose(t);
        if (shape) {
            pose = { ...pose, sil: { ...pose.sil, radii: shape } };
        }
        if (expr) {
            pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
        }
        return pose;
    }
    origine(now, shape, expr) {
        if (this.departFige)
            return this.departFige;
        if (!this.prev)
            return null;
        const prevDef = STATE_DEFS[this.prev];
        if (!prevDef)
            return null;
        return this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr);
    }
    poseComposee(now) {
        const def = STATE_DEFS[this.cur];
        if (!def)
            return STATE_DEFS.egg.pose(0);
        const shape = this.shapeAtTime(now);
        const expr = this.exprAtTime(now);
        const pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
        const since = now - this.tCur;
        if (since >= def.morph)
            return pose;
        const origin = this.origine(now, shape, expr);
        if (!origin)
            return pose;
        return blendPose(origin, pose, easings.easeOutQuint(clamp(since / def.morph)));
    }
    composeFrame(R, def, now, shape, expr, includeLiveliness) {
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
        const gaze = {
            yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw,
            pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
            roll: pose.gaze.roll + life.dRoll,
        };
        const lid = blinkScale(life.lid);
        const offX = pose.offX + life.driftX;
        const offY = pose.offY + life.driftY;
        const sil = {
            ...pose.sil,
            cx: pose.sil.cx + offX,
            cy: pose.sil.cy + offY,
            sy: pose.sil.sy * life.breath,
        };
        const bodyPath = closedPath(toPoints(sil, R, this.pts));
        const bodyRadius = (x, y) => radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);
        const eyes = [];
        if (pose.eyeAlpha > 0.01) {
            const poses = eyePoses(gaze, R, pose.split);
            for (let i = 0; i < 2; i++) {
                const e = poses[i];
                if (!e || e.depth <= 0.02)
                    continue;
                const cfg = pose.eyes[i];
                if (!cfg)
                    continue;
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
    /** Pure function of time. Render this frame, or any other t, identically. */
    sample(now) {
        const R = this.scale;
        const def = STATE_DEFS[this.cur];
        if (!def)
            throw new Error(`Unknown state: ${this.cur}`);
        const shape = this.shapeAtTime(now);
        const expr = this.exprAtTime(now);
        return this.composeFrame(R, def, now, shape, expr, true);
    }
    /**
     * Fast path for callers that only need a still frame (no liveliness, blink,
     * gaze drift, or breath). Used by RadialPet when the creature is not moving.
     */
    sampleStatic(now = 0) {
        const R = this.scale;
        const def = STATE_DEFS[this.cur];
        if (!def)
            throw new Error(`Unknown state: ${this.cur}`);
        const shape = this.shapeAtTime(now);
        const expr = this.exprAtTime(now);
        return this.composeFrame(R, def, now, shape, expr, false);
    }
    /** Advance to the next lifecycle stage. */
    evolve(now) {
        const idx = STATE_ORDER.indexOf(this.cur);
        if (idx >= STATE_ORDER.length - 1)
            return false;
        this.setState(STATE_ORDER[idx + 1], now);
        return true;
    }
}
