# Firmware prompt — Finagotchi ghost creature

Paste everything below the line into a coding agent working on the `finagotchi_firmware` (ESP32-S3) repo. It assumes the agent can also read this app repo; if not, copy the referenced files alongside the prompt.

---

# Task: Port the Finagotchi ghost creature to ESP32-S3 firmware

## Context

Finagotchi is a Solana tamagotchi: a mobile app (Expo/React Native) plus an ESP32-S3 companion device with a 128×128 RGB565 display. The creature is a **cute rounded ghost IP character** on a solid deep-navy background `#07111F`. The app renders it with a clock-free radial engine; the firmware currently shows a placeholder. Your job is to make the device render the **same ghost creature** as the app, driven by the same BLE commands.

## Source of truth (in the app repo)

Read these files and port their behavior exactly:

- `finagotchi/src/engine/profiles.ts` — radial profiles. `GHOST_PROFILES.hem` / `.curl` / `.arms` are the ghost silhouettes: 64 radii sampled at equal angles, theta = 0 pointing right and growing **clockwise** (y-down screen coordinates), radius 1.0 = half the canvas. Copy these arrays verbatim into firmware as constant tables.
- `finagotchi/src/engine/engine.ts` — `STATE_DEFS`: per-stage pose (gaze, eye split, eye width/height, body color, morph duration) and the morph/blend logic.
- `finagotchi/src/engine/expressions.ts` — the 6 moods (`calm`, `happy`, `excited`, `waiting`, `sleepy`, `sad`): gaze, split, per-eye w/h/tilt/open, and expression blending.
- `finagotchi/src/engine/face.ts` — eye projection (`eyePoses`: eyes painted on a sphere, rotated by yaw/pitch/roll), `blinkScale`, and the deterministic `liveliness(t)` (gaze wander, blink schedule, breath).
- `finagotchi/src/engine/shape.ts` — `toPoints` (radii → polygon), `closedPath` (Catmull-Rom), `radiusAtAngle` (eye-to-contour fit), `capsulePath` (eye shape).

## Rendering model to implement

Everything is a **pure function of time**: `sample(t)` must be deterministic — same `t`, same frame. No wall-clock state machines; all transitions (stage morphs, mood blends, gaze changes) are dated blends of 0.24–0.45 s with easeOutQuint. This makes app and device frames identical and testable.

Per frame:

1. Interpolate the 64 radii between stages during morphs (same-angle correspondence, linear radius lerp).
2. Convert radii → polygon points around the display center (scale = half display, i.e. 64 px at 128×128). A plain 64-gon is fine on device; Catmull-Rom only if cycles allow.
3. Fill the polygon with the stage body color over the navy background.
4. Eyes: two capsules (stadiums), positioned by `eyePoses(gaze, split)`, each transformed by its 2×2 tangent-basis matrix, position fitted to the silhouette via `radiusAtAngle`, vertically squished by `blinkScale(lid * open)`. Eye fill `#f5f5f5`.
5. Apply liveliness: deterministic blink schedule, gaze wander noise, subtle breath (`sy *= 1 + sin(t/3.4 * 2π) * 0.005`).

## Stage → shape/color mapping

| Stage (BLE name) | Silhouette | Body color | Glow |
|---|---|---|---|
| `egg` | `PROFILES.egg` (unchanged) | `#D4C8B8` | — |
| `coinling` | `GHOST_PROFILES.hem` | `#f59e0b` | `#fbbf24` |
| `hodler` | `GHOST_PROFILES.curl` | `#3b82f6` | `#60a5fa` |
| `whale` | `GHOST_PROFILES.arms` | `#6366f1` | `#818cf8` |

Background is always `#07111F`. Eye defaults: split 19°, w 0.20, h 0.28, rest gaze pitch −12. Moods override gaze/split/eyes per `expressions.ts`.

## BLE contract (already in the device — keep compatible)

- Device name `Finagotchi`, service `0000f1a0-0000-1000-8000-00805f9b34fb`, characteristic `0000f1a1-0000-1000-8000-00805f9b34fb`.
- Notify state as UTF-8 `"<stage>:<streak>:<mood>:<item>"` (stage name string; mood = index into expressions order above, 0–5; item 0–5 accessory).
- Accept writes: `"stage:<n>"` (1=egg, 2/3=coinling, 4=hodler, 5=whale), `"mood:<index>"`, `"look:<yaw>,<pitch>"` in degrees — clamp yaw ±30, pitch ±25, applied with mix 0.85; on release the app stops writing, resume idle wander. Look writes arrive at ~10 Hz; the render loop must not block on BLE.

## Constraints

- Target a stable 30 fps at 128×128 on the ESP32-S3; precompute the radii tables and blink schedule in flash. Fixed-point or float — whichever hits frame rate; visual parity matters more than numeric exactness.
- 3 colors per frame maximum (background, body, eyes) plus optional glow at 22 % opacity, 1.15× scale, drawn behind the body.
- No heap allocation in the frame loop.

## Acceptance test

Render the 4 stages × 6 moods grid (24 stills at `sampleStatic`-equivalent, liveliness off) and eyeball against the app. Then verify: egg→coinling→hodler→whale morph is smooth (no shape popping), blink looks natural, `look:` commands move the eyes within the silhouette, and moods blend instead of snapping.
