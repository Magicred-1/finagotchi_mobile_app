/**
 * Eyes painted on a sphere.
 *
 * Each eye is projected through the tangent basis of the sphere at its position,
 * giving real 3D foreshortening, compression, and tilt automatically.
 */
import { clamp, createRng, loopNoise, toRadians } from '../utils/math.js';
/** Half eye separation on the sphere, in degrees. */
export const EYE_SPLIT = 19;
/** Rest eye size in ball-radius units. Round-ish, matching the ghost IP. */
export const EYE_W = 0.2;
export const EYE_H = 0.28;
/** Rest head orientation tuned to the ghost's gentle forward gaze. */
export const REST_GAZE = { yaw: 0, pitch: -12, roll: 0 };
/**
 * Rotate two orthonormal vectors in their common plane by `angle` radians.
 */
function spin(u, v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
        [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s],
    ];
}
/**
 * Compute the two eye poses for a given head gaze.
 *
 * Screen coordinates: x right, y down, z toward viewer.
 * Index 0 = inner eye, index 1 = outer eye.
 */
export function eyePoses(gaze, scale, split = EYE_SPLIT) {
    let forward = [0, 0, 1];
    let right = [1, 0, 0];
    let down = [0, 1, 0];
    [forward, right] = spin(forward, right, toRadians(gaze.yaw));
    [down, forward] = spin(down, forward, toRadians(gaze.pitch));
    [right, down] = spin(right, down, toRadians(gaze.roll));
    const build = (side) => {
        const [ef, er] = spin(forward, right, toRadians(split * side));
        return {
            x: ef[0] * scale,
            y: ef[1] * scale,
            a: er[0],
            b: er[1],
            c: down[0],
            d: down[1],
            depth: ef[2],
        };
    };
    return [build(-1), build(1)];
}
const BLINK_RNG = createRng(0x5eed);
/** Deterministic blink schedule pre-generated once. */
const BLINKS = (() => {
    const out = [];
    let t = 1.4;
    while (t < 900) {
        out.push(t);
        t += 1.9 + BLINK_RNG() * 2.7;
        if (BLINK_RNG() < 0.18) {
            out.push(t);
            t += 0.24;
        }
    }
    return out;
})();
const BLINK_DUR = 0.18;
function blinkLid(t) {
    for (let i = 0; i < BLINKS.length; i++) {
        const start = BLINKS[i];
        if (start === undefined || t < start)
            break;
        const k = (t - start) / BLINK_DUR;
        if (k >= 0 && k <= 1) {
            // Fast close, slightly slower reopen.
            return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55;
        }
    }
    return 1;
}
/**
 * Pure function of time producing rest liveliness: gaze drift, saccades,
 * blinks, and subtle breath.
 */
export function liveliness(t, opt = {}) {
    const { wander = 1, blink = true, float = true } = opt;
    return {
        dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
        dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
        dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
        lid: blink ? blinkLid(t) : 1,
        driftX: float ? loopNoise(t, 7.9, 1.9) * 0.006 : 0,
        driftY: float ? loopNoise(t, 5.3, 0.3) * 0.007 : 0,
        breath: float ? 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 : 1,
    };
}
/**
 * Vertical eye squish in screen space around the eye center.
 */
export function blinkScale(lid) {
    return 0.06 + 0.94 * clamp(lid);
}
