#!/usr/bin/env python3
"""Convert Finagotchi ghost IP artwork into engine radial profiles.

Segments the character off the solid deep-navy background, then samples the
silhouette at 64 angles from its centroid (theta = 0 points right and grows
clockwise, matching src/engine/profiles.ts). Emits a TypeScript snippet plus
overlay renders for visual verification.

Usage: python3 radial_convert.py <image.png> [--max-r 0.55] [--smooth 2]
Pure PIL, no third-party deps beyond Pillow.
"""

import math
import sys

from PIL import Image, ImageDraw

BG = (0x07, 0x11, 0x1F)
SAMPLES = 64
TAU = 2 * math.pi
THRESHOLD = 45  # RGB distance from background


def segment(img):
    """Boolean mask: pixel belongs to the character, not the background."""
    px = img.load()
    w, h = img.size
    mask = bytearray(w * h)
    thr2 = THRESHOLD * THRESHOLD * 3
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            d2 = (r - BG[0]) ** 2 + (g - BG[1]) ** 2 + (b - BG[2]) ** 2
            if d2 > thr2:
                mask[y * w + x] = 1
    return mask, w, h


def sample_radii(mask, w, h, max_r, smooth):
    xs = [x for x in range(w) for y in range(h) if mask[y * w + x]]
    ys = [y for x in range(w) for y in range(h) if mask[y * w + x]]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)

    diag = math.hypot(w, h)
    steps = int(diag * 2)
    radii = []
    for i in range(SAMPLES):
        th = (i / SAMPLES) * TAU
        dx, dy = math.cos(th), math.sin(th)
        r_out = 0.0
        for s in range(steps):
            r = s * 0.5
            x = int(cx + r * dx + 0.5)
            y = int(cy + r * dy + 0.5)
            if 0 <= x < w and 0 <= y < h and mask[y * w + x]:
                r_out = r
        radii.append(r_out)

    # circular moving-average smoothing to strip pixel noise
    k = 2 * smooth + 1
    padded = radii[-smooth:] + radii + radii[:smooth]
    sm = [
        sum(padded[j : j + k]) / k
        for j in range(SAMPLES)
    ]

    half = min(w, h) / 2
    norm = [r / half for r in sm]
    scale = max_r / max(norm)
    return [r * scale for r in norm], (cx, cy)


def render_overlay(path, mask, w, h, radii, center, out):
    img = Image.open(path).convert('RGB')
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    cx, cy = center
    half = min(w, h) / 2
    pts = [
        (
            cx + math.cos((i / SAMPLES) * TAU) * radii[i] * half,
            cy + math.sin((i / SAMPLES) * TAU) * radii[i] * half,
        )
        for i in range(SAMPLES)
    ]
    d.polygon(pts, outline=(255, 80, 120, 255), width=4)
    img.paste(Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB'), (0, 0))
    img.save(out)


def render_alone(radii, body_rgb, out, size=512):
    img = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(img)
    half = size / 2
    pts = [
        (
            half + math.cos((i / SAMPLES) * TAU) * radii[i] * half,
            half + math.sin((i / SAMPLES) * TAU) * radii[i] * half,
        )
        for i in range(SAMPLES)
    ]
    d.polygon(pts, fill=body_rgb)
    img.save(out)


def main():
    path = sys.argv[1]
    max_r = 0.55
    smooth = 2
    if '--max-r' in sys.argv:
        max_r = float(sys.argv[sys.argv.index('--max-r') + 1])
    if '--smooth' in sys.argv:
        smooth = int(sys.argv[sys.argv.index('--smooth') + 1])

    img = Image.open(path).convert('RGB')
    mask, w, h = segment(img)
    radii, center = sample_radii(mask, w, h, max_r, smooth)

    name = path.rsplit('/', 1)[-1].rsplit('.', 1)[0]
    render_overlay(path, mask, w, h, radii, center, f'/tmp/overlay-{name}.png')

    print(f'// {name}: center=({center[0]:.0f},{center[1]:.0f}) min={min(radii):.3f} max={max(radii):.3f}')
    print('[')
    for row in range(0, SAMPLES, 8):
        print('    ' + ', '.join(f'{r:.4f}' for r in radii[row : row + 8]) + ',')
    print(']')


if __name__ == '__main__':
    main()
