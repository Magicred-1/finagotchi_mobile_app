/**
 * Landing-page creature: the real FinagotchiEngine (same code as the app and
 * firmware) driving an SVG ghost. Pointer gaze, tap-to-react moods, and stage
 * morphing included.
 */
import { FinagotchiEngine } from './engine/engine/engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 380;
const MAX_YAW = 30;
const MAX_PITCH = 25;
const GLOW_SCALE = 1.15;
const GLOW_OPACITY = 0.22;
const EYE_FILL = '#f5f5f5';
const MOODS = ['happy', 'excited', 'calm', 'waiting', 'sleepy', 'sad'];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const engine = new FinagotchiEngine({
  scale: SIZE / 2,
  initial: 'whale',
  liveliness: { wander: reducedMotion ? 0 : 1, blink: true, float: !reducedMotion },
});

// --- SVG scaffold -----------------------------------------------------------

const svg = document.createElementNS(SVG_NS, 'svg');
svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

const root = document.createElementNS(SVG_NS, 'g');
root.setAttribute('transform', `translate(${SIZE / 2}, ${SIZE / 2})`);

const glow = document.createElementNS(SVG_NS, 'g');
glow.setAttribute('transform', `scale(${GLOW_SCALE})`);
const glowPath = document.createElementNS(SVG_NS, 'path');
glowPath.setAttribute('opacity', String(GLOW_OPACITY));
glow.appendChild(glowPath);

const bodyPath = document.createElementNS(SVG_NS, 'path');
const eyePaths = [0, 1].map(() => {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('fill', EYE_FILL);
  return p;
});

root.appendChild(glow);
root.appendChild(bodyPath);
eyePaths.forEach((p) => root.appendChild(p));
svg.appendChild(root);

const host = document.getElementById('creature');
host.appendChild(svg);

// --- frame loop --------------------------------------------------------------

const start = performance.now();
const now = () => (performance.now() - start) / 1000;

function render() {
  const frame = engine.sample(now());
  bodyPath.setAttribute('d', frame.bodyPath);
  bodyPath.setAttribute('fill', frame.color);
  bodyPath.setAttribute('opacity', String(frame.bodyAlpha));
  glowPath.setAttribute('d', frame.bodyPath);
  glowPath.setAttribute('fill', frame.glowColor ?? frame.color);
  glowPath.setAttribute('opacity', String(frame.bodyAlpha * GLOW_OPACITY));
  frame.eyes.forEach((eye, i) => {
    const p = eyePaths[i];
    if (!p) return;
    p.setAttribute('d', eye.d);
    p.setAttribute('transform', eye.matrix);
    p.setAttribute('opacity', String(eye.alpha));
  });
}

if (reducedMotion) {
  // Static frame, re-rendered only on interaction.
  const tick = () => render();
  tick();
  window.__renderCreature = tick;
} else {
  const loop = () => {
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// --- pointer gaze ------------------------------------------------------------

host.addEventListener('pointermove', (event) => {
  const rect = host.getBoundingClientRect();
  const half = rect.width / 2;
  const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, ((event.clientX - rect.left - half) / half) * MAX_YAW));
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, ((event.clientY - rect.top - half) / half) * MAX_PITCH));
  engine.setLook({ yaw, pitch, mix: 0.85, wander: 0 }, now());
  if (reducedMotion) render();
});

host.addEventListener('pointerleave', () => {
  engine.setLook(null, now());
  if (reducedMotion) render();
});

// --- tap to cycle moods -------------------------------------------------------

let moodIndex = -1;
host.addEventListener('pointerdown', () => {
  moodIndex = (moodIndex + 1) % MOODS.length;
  engine.setExpression(MOODS[moodIndex], now());
  if (reducedMotion) render();
});

// --- stage switcher ------------------------------------------------------------

document.getElementById('stages').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-stage]');
  if (!button) return;
  engine.setState(button.dataset.stage, now());
  document.querySelectorAll('#stages button').forEach((b) => b.classList.toggle('active', b === button));
  if (reducedMotion) render();
});
