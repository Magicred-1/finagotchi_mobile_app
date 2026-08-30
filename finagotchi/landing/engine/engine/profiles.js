/**
 * Radial profiles for the four Finagotchi lifecycle stages.
 *
 * Sampled at 64 angles (same-angle correspondence makes morphing a simple
 * radius interpolation). Theta = 0 points right and grows clockwise, matching
 * SVG's y-down coordinate system.
 */
import { TAU } from '../utils/math.js';
export const PROFILE_SAMPLES = 64;
const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);
function eggRadii() {
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
function coinlingRadii() {
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
function hodlerRadii() {
    return ANGLES.map((theta) => {
        const base = 0.38 + 0.22 * Math.abs(Math.cos(theta * 2));
        return Math.max(0, Math.min(1, Math.pow(base, 0.4)));
    });
}
function whaleRadii() {
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
};
/**
 * Ghost IP character silhouettes, generated from the artwork in
 * `assets/ip/` by `tools/radial_convert.py` (64 same-angle samples, max
 * radius normalized to 0.55). Regenerate with that script — do not
 * hand-edit. Used as radii overrides on the lifecycle stages in engine.ts.
 */
export const GHOST_PROFILES = {
    hem: [
        0.3912, 0.3923, 0.3965, 0.4039, 0.4144, 0.4281, 0.4451, 0.4662,
        0.4900, 0.5104, 0.5190, 0.5092, 0.4776, 0.4559, 0.4468, 0.4538,
        0.4466, 0.4399, 0.4479, 0.4681, 0.4849, 0.4837, 0.4959, 0.5184,
        0.5477, 0.5500, 0.5180, 0.4687, 0.4199, 0.3910, 0.3763, 0.3691,
        0.3670, 0.3687, 0.3733, 0.3809, 0.3914, 0.4045, 0.4186, 0.4329,
        0.4464, 0.4592, 0.4708, 0.4816, 0.4910, 0.4988, 0.5047, 0.5087,
        0.5113, 0.5121, 0.5110, 0.5079, 0.5033, 0.4965, 0.4881, 0.4778,
        0.4666, 0.4546, 0.4418, 0.4283, 0.4157, 0.4051, 0.3978, 0.3931,
    ],
    curl: [
        0.4336, 0.4319, 0.4317, 0.4331, 0.4359, 0.4401, 0.4447, 0.4495,
        0.4544, 0.4586, 0.4619, 0.4640, 0.4657, 0.4668, 0.4680, 0.4693,
        0.4718, 0.4758, 0.4819, 0.4899, 0.4998, 0.5109, 0.5231, 0.5342,
        0.5439, 0.5500, 0.5477, 0.4891, 0.4302, 0.3783, 0.3819, 0.3878,
        0.3947, 0.4031, 0.4117, 0.4203, 0.4289, 0.4376, 0.4460, 0.4535,
        0.4609, 0.4678, 0.4743, 0.4798, 0.4844, 0.4882, 0.4914, 0.4937,
        0.4956, 0.4962, 0.4966, 0.4962, 0.4951, 0.4926, 0.4895, 0.4853,
        0.4800, 0.4739, 0.4672, 0.4605, 0.4531, 0.4464, 0.4407, 0.4365,
    ],
    arms: [
        0.4486, 0.4351, 0.4082, 0.3940, 0.4023, 0.4486, 0.5026, 0.5448,
        0.5500, 0.5282, 0.4971, 0.4683, 0.4467, 0.4310, 0.4203, 0.4141,
        0.4122, 0.4141, 0.4203, 0.4310, 0.4467, 0.4663, 0.4834, 0.4915,
        0.4869, 0.4731, 0.4541, 0.4342, 0.4161, 0.4045, 0.4139, 0.4384,
        0.4659, 0.4484, 0.4240, 0.4004, 0.4106, 0.4213, 0.4327, 0.4436,
        0.4539, 0.4628, 0.4705, 0.4764, 0.4810, 0.4836, 0.4851, 0.4851,
        0.4845, 0.4825, 0.4797, 0.4757, 0.4709, 0.4642, 0.4561, 0.4462,
        0.4362, 0.4248, 0.4128, 0.3999, 0.3879, 0.3772, 0.3975, 0.4244,
    ],
};
