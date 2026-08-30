# Landing page prompt — Finagotchi ghost branding

Paste everything below the line into a coding agent tasked with rebuilding, extending, or porting the Finagotchi landing page. It assumes access to this repo; the key source files are referenced by path.

---

# Task: Build the Finagotchi landing page with the live engine creature

## Context

Finagotchi is a Solana tamagotchi: a mobile app (Expo) plus an ESP32-S3 hardware companion. The brand character is a **cute rounded ghost** on solid deep navy `#07111F`. The landing page must show the creature **alive** — not a static image — by running the app's actual creature engine in the browser.

## Non-negotiables

1. **The hero creature is a live engine render**, not an image or video. Use the engine sources at `finagotchi/src/engine/` (`engine.ts`, `face.ts`, `expressions.ts`, `profiles.ts`, `shape.ts`) plus `src/utils/math.ts`. They have zero React Native dependencies — transpile them to ES modules (plain `tsc --module es2020`, then append `.js` to relative imports) or bundle them. Do not reimplement the engine; do not paste a Lottie/GIF.
2. The creature **follows the visitor's cursor with its gaze** (`engine.setLook({ yaw, pitch, mix: 0.85, wander: 0 })`, yaw clamp ±30°, pitch ±25°, computed relative to the creature's center; `setLook(null)` on pointer leave). Tapping/clicking the creature **cycles its six moods** (`happy → excited → calm → waiting → sleepy → sad` via `engine.setExpression(mood, now)`).
3. Include **stage switcher pills** (Egg / Coinling / Hodler / Whale) calling `engine.setState(stage, now)` — the engine morphs silhouettes automatically. This demonstrates the evolution loop, which is the product's core promise.
4. Honor `prefers-reduced-motion`: render one static frame, re-render only on interaction (no rAF loop, no gaze wander).

## Brand system

- Colors: background `#07111F`, surface `#0E1B2E`, surface-light `#162640`, primary cyan `#35D7FF`, purple `#9945FF` (used sparingly, e.g. halo glow), text `#FFFFFF`, muted `#8FA2B8`, border `#243651`.
- Typography: **Poppins** (800 headlines, 500/400 body). Titles at `clamp(40px, 5.2vw, 64px)`, tight tracking.
- Radii: cards 22px, buttons/badges pill. No sharp corners anywhere.
- Logo and artwork: `finagotchi/assets/logos/finagotchi_logo.png` (horizontal lockup) and the ghost colorways in `finagotchi/assets/ip/` — cyan `A2.png` (default), lavender `B3.png` (evolution), cream `C4.png` (rest/hardware). Copy them into the page's local assets; never hotlink the app bundle.
- Voice: short, warm, slightly playful. Headline pattern: "Your daily Solana creature." No crypto jargon walls, no neon chaos (see `PRODUCT.md` anti-references).

## Page structure

1. Header: lockup logo left, pill CTA right.
2. Hero: copy left (eyebrow → headline → 2–3 sentence sub → primary + ghost-button CTAs → one-line playful hint that the ghost watches you), **live creature right** with a faint cyan/purple radial halo behind it, stage pills beneath.
3. "One ghost, many moods": three cards using the colorway ghosts — Daily companion (cyan), Evolves with you (lavender), Lives on your desk (cream/hardware).
4. CTA band: "Hatch yours today" + waitlist button, subtle cyan→purple gradient surface.
5. Footer: copyright + X / finagotchi.app links.

## Constraints

- Static site, no framework, no build step required to *run* — plain HTML/CSS/ES modules that work from any static host (`python3 -m http.server` included).
- Mobile: single column, creature moves above the copy. Respect the 44px touch-target minimum.
- Verify with a real headless-browser screenshot at 1440px wide before declaring done; check the creature's eyes render and the layout doesn't overlap.

## Reference implementation

A working version lives at `finagotchi/landing/` (`index.html`, `main.js`, `engine/`, `assets/`) — match its behavior; improve the design if asked.
