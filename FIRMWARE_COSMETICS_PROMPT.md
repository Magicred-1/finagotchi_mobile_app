# Firmware prompt — anchored cosmetics + fitted tee

Paste everything below the line into a coding agent working on the `finagotchi_firmware` (ESP32-S3) repo. It assumes the base creature port from `FIRMWARE_PROMPT.md` is already done (stages, moods, eyes, liveliness, BLE contract) and that the agent can also read this app repo; if not, copy the referenced files alongside the prompt.

---

# Task: Anchor accessories to the creature posture and add the t-shirt (item 6)

## Context

The Finagotchi app recently fixed a cosmetics bug: accessories (crown, glasses, bowtie, halo, diamond) used to be drawn at **fixed canvas coordinates** while the body and eyes are re-computed every frame from pose math — so cosmetics drifted out of place in every stage/mood/gaze except one rest pose. The app now emits **per-frame accessory anchors** from the same math that places the eyes, plus a **t-shirt whose outline is cut from the live body contour** so it wraps the creature's actual silhouette.

The firmware currently renders accessories the old way (fixed positions, items 0–5). Bring it to parity: same anchors, same artwork, same new item.

## Source of truth (in the app repo)

Read these and port their behavior exactly:

- `finagotchi/src/engine/engine.ts` —
  - `composeAnchors()`: the anchor math (eye midpoint, contour fit, drift, roll, breath, per-stage size scaling).
  - `composeShirt()`: the fitted-tee outline derived from the 64 body contour points.
  - `Frame.anchors` / `Frame.shirt`: what a frame carries.
- `finagotchi/src/components/PetAccessory.tsx` — the accessory artwork, all drawn **around the origin** (the anchor point), in units of R = half the canvas (64 px at 128×128).
- `finagotchi/src/components/RadialPet.tsx` — `ACCESSORY_ANCHOR`: which anchor each accessory rides; z-order of body / shirt / eyes / accessory.
- `finagotchi/src/features/ble/sync.ts` — `ACCESSORIES`: item index ↔ accessory mapping (now 0–6).

## Anchor math to implement

Per frame you already compute: both eye screen positions, `gaze.roll`, the 64 radii + `rot`, body drift `offX/offY`, and `breath`. From those derive five anchors as 2D affine matrices `[a,b,c,d,e,f] = rotate(θ)·scale(sx,sy)` then translate(x,y), i.e. `a=sx·cosθ, b=sx·sinθ, c=−sy·sinθ, d=sy·cosθ, e=x, f=y`:

```
fitAt(dx,dy)   = radiusAtAngle(radii, normalize(atan2(dy,dx) − rot))   // normalize to [0, 2π) — atan2 is negative for the whole upper half
contour(dx,dy,frac) = (dx·fit·frac·R + offX·R,  dy·fit·frac·R + offY·R)
sizeAt(dx,dy)  = clamp(fit / 0.5, 0.7, 1.4)     // artwork is drawn for a reference body radius of 0.5·R
```

| Anchor | Accessory | Position | Rotation θ | Scale |
|---|---|---|---|---|
| `face` | glasses | midpoint between the two eye centers | `atan2(Δy, Δx)` between eyes | `sx = clamp(eyeHalfSep / (0.22·R), 0.4, 1.6)`, `sy = 1` |
| `headTop` | crown | `contour(0, −1, 1.0)` | `roll` | `breath · sizeAt(0,−1)` |
| `aboveHead` | halo | `headTop` position, then `y −= 0.18·R · scale` | `roll` | same as crown |
| `chest` | bowtie | `contour(0, +1, 0.78)` | `roll` | `breath · sizeAt(0,+1)` |
| `torso` | t-shirt emblem | `contour(0, +1, 0.42)` | `roll` | `breath · sizeAt(0,+1)` |
| `cheek` | diamond | `contour(0.804, −0.595, 0.95)` | `roll` | `breath · sizeAt(0.804,−0.595)` |

Glasses: `face` exists only when both eyes are rendered (eyeAlpha > 0.01); the lens centers of the artwork rest at ±0.22·R, so `sx` lands the lenses exactly on the live eyes in every stage, mood, and `look:` direction.

## Artwork (origin-centered, units of R)

Port from `PetAccessory.tsx`; the origin of each piece is its anchor point (crown: base center; glasses: lens midpoint; others: center).

- **crown**: base at y=0, notch −0.08·R, peak −0.20·R, half-width 0.28·R. Fill `#fbbf24`, inner accent stroke `#d97706`.
- **glasses**: two ellipses rx 0.18·R / ry 0.14·R centered at ±0.22·R, plus bridge line. Fill `rgba(31,41,55,0.82)`.
- **bowtie**: half-width 0.24·R, half-height 0.14·R, knot 0.06·R. Fill `#f43f5e`, knot line `#be123c`.
- **halo**: ring rx 0.34·R / ry 0.07·R, stroke 0.04·R. Fill `#fbbf24` at 92 % opacity.
- **diamond**: rhombus ±0.16·R, fill `#22d3ee`, facets `#cffafe` at 55 %.
- **t-shirt emblem** (rides the `torso` anchor): coin circle r 0.06·R at (0, +0.12·R), fill `#fbbf24`, inner ring r 0.033·R stroke `#d97706`.

## Fitted t-shirt (item 6)

The shirt is **not** a fixed shape — its outline is re-computed every frame from the same 64 body contour points as the body polygon, so it hugs the egg, the wavy ghost hems, and the flat whale alike, and breathes/drifts with the body.

```
center = (sil.cx·R, sil.cy·R)             // includes drift + breath, same as body
ptAt(deg)  = lerp of the two nearest contour points at (deg/360)·64
at(deg,k)  = center + (ptAt(deg) − center) · k
```

Outline polygon (closed, in this order — screen angles, y-down, 90° = bottom):

```
at(20,0.90)  at(25,1.16)  at(37,1.16)  at(45,0.93)   // right collar, sleeve, underarm
at(54,0.95)  at(66,0.95)  at(78,0.95)  at(90,0.95)   // hem, following the silhouette
at(102,0.95) at(114,0.95) at(126,0.95)               //
at(135,0.93) at(143,1.16) at(155,1.16) at(160,0.90)  // left underarm, sleeve, collar
```

- Fill `#f1f5f9`. The 0.95 hem inset leaves a body-colored hem line; sleeves poke out at 1.16.
- Collar trim: quadratic curve from `at(24,0.87)` to `at(156,0.87)`, control point at the midpoint pushed down 0.06·R, stroke ~0.015·canvas (≈2 px), round caps, `#94a3b8`.
- Z-order: background → glow → body → **shirt → collar** → eyes → anchored accessory (emblem for the tee, everything else per its anchor).

Precompute the 15 `(deg, k)` outline pairs and 2 collar pairs as flash constants; reuse the body point buffer — no heap allocation in the frame loop.

## BLE contract update

- Accessory order is now: `0 none, 1 crown, 2 glasses, 3 bowtie, 4 halo, 5 diamond, 6 tshirt`. Accept and notify item ids 0–6 (was 0–5). Keep everything else byte-compatible.
- The app already sends `item:6`; firmware builds without the tee must clamp unknown ids to `none` rather than misrender.

## Constraints

- Same as the base port: stable 30 fps at 128×128, deterministic `sample(t)`, no heap allocation in the frame loop.
- Accessories only add a handful of filled primitives per frame (≤ 1 polygon + 2 strokes); the tee is one 15-gon + one quad curve. Skip accessory rendering entirely when `item == 0`.
- Visual parity with the app matters more than numeric exactness; fixed-point is fine.

## Acceptance test

1. Render the 4 stages × 7 items grid (28 stills, liveliness off) and eyeball against the app: crown/halo sit on the head top of every stage, bowtie on the lower body, diamond on the right cheek, glasses lenses centered on the eyes.
2. With glasses equipped, sweep `look:` yaw ±30 / pitch ±25 and cycle all 6 moods: the lenses must stay glued to the eyes (position, tilt, and separation).
3. With the tee equipped: it hugs the silhouette on all 4 stages, follows the egg→coinling→hodler→whale morph without popping, and breathes with the body.
4. `item:6` round-trips through notify; unknown item ids degrade to `none`.
