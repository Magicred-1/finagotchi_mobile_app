#!/usr/bin/env python3
"""Animate the Finagotchi ghost artwork (transparent PNG) as an icon.

Design rules (learned the hard way):
- Never resample the artwork per frame — it shimmers. Motion is integer-only
  vertical float; the body pixels stay bit-identical.
- Blink is procedural and crisp: the original cream eye patch is pasted while
  open, a drawn cream ellipse carries the closing/opening transition, and a
  dark-cyan slit marks fully closed. No squashed rasters.

Usage: python3 animate_ghost.py <input.png> <out-prefix> [--size 384] [--fps 24] [--loop 3.4]
Outputs <out-prefix>.webp, .png (APNG), .gif — transparent, looping.
"""

import math
import sys
from collections import deque

from PIL import Image, ImageDraw, ImageFilter

CREAM_MIN = (215, 210, 190)  # eyes/mouth are warm white on a colored body
BLINKS = (1.4, 2.75)         # seconds (normal mode: two full blinks)
CLOSE, HOLD, OPEN = 0.09, 0.1, 0.2


def largest_components(mask, w, h, keep=3):
    seen = bytearray(w * h)
    comps = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen[i] or not mask[x, y]:
                continue
            seen[i] = 1
            q = deque([(x, y)])
            comp = []
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and mask[nx, ny]:
                            seen[j] = 1
                            q.append((nx, ny))
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps[:keep]


def bbox(comp):
    xs = [p[0] for p in comp]
    ys = [p[1] for p in comp]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def blink_lid(t, blinks=BLINKS):
    """1 = open, 0 = fully closed. Fast close, held shut, slower reopen."""
    for at in blinks:
        d = t - at
        if 0 <= d < CLOSE:
            return 1 - d / CLOSE
        if d < CLOSE + HOLD:
            return 0.0
        if d < CLOSE + HOLD + OPEN:
            return (d - CLOSE - HOLD) / OPEN
    return 1.0


def wink_lid(t, loop):
    """Inverted wink for loading: closed at the loop seam, opens just after
    the start, holds open, closes again right before the wrap."""
    OPEN_AT = 0.25
    CLOSE_AT = loop - CLOSE - 0.12
    if t < OPEN_AT:
        return 0.0
    if t < OPEN_AT + OPEN:
        return (t - OPEN_AT) / OPEN
    if t < CLOSE_AT:
        return 1.0
    d = t - CLOSE_AT
    if d < CLOSE:
        return 1 - d / CLOSE
    return 0.0


def main():
    src_path, out_prefix = sys.argv[1], sys.argv[2]
    size = 384
    fps = 24
    loop = 3.4
    wink = '--wink' in sys.argv
    if '--size' in sys.argv:
        size = int(sys.argv[sys.argv.index('--size') + 1])
    if '--fps' in sys.argv:
        fps = int(sys.argv[sys.argv.index('--fps') + 1])
    if '--loop' in sys.argv:
        loop = float(sys.argv[sys.argv.index('--loop') + 1])
    elif wink:
        loop = 2.6

    src = Image.open(src_path).convert('RGBA')

    # trim to content, place on the working canvas
    content_bbox = src.getchannel('A').getbbox()
    src = src.crop(content_bbox)
    sw, sh = src.size
    scale = (size * 0.82) / max(sw, sh)
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    fitted = src.resize((int(sw * scale), int(sh * scale)), Image.LANCZOS)
    origin = ((size - fitted.size[0]) // 2, (size - fitted.size[1]) // 2)
    base.paste(fitted, origin, fitted)

    # detect eyes: two largest cream components
    rgb = base.convert('RGB')
    px = rgb.load()
    cream = Image.new('L', (size, size), 0)
    cp = cream.load()
    for y in range(size):
        for x in range(size):
            r, g, b = px[x, y]
            if r > CREAM_MIN[0] and g > CREAM_MIN[1] and b > CREAM_MIN[2]:
                cp[x, y] = 255
    comps = [c for c in largest_components(cream.load(), size, size) if len(c) > 40]
    eyes = sorted((bbox(c) for c in comps[:2]), key=lambda b: b[0])
    if len(eyes) != 2:
        raise SystemExit(f'expected 2 eyes, found {len(eyes)}')
    print('eye boxes:', eyes)

    # eyeless base: fill eye + glow ring with locally-blurred body
    eyeless = base.copy()
    blurred = base.filter(ImageFilter.GaussianBlur(14))
    eyes_info = []
    for (x0, y0, x1, y1) in eyes:
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        ew, eh = x1 - x0, y1 - y0
        pad = 12
        fill_mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(fill_mask).ellipse((x0 - pad, y0 - pad, x1 + pad, y1 + pad), fill=255)
        fill_mask = fill_mask.filter(ImageFilter.GaussianBlur(5))
        eyeless.paste(blurred, (0, 0), fill_mask)
        m = 10
        patch = base.crop((x0 - m, y0 - m, x1 + m, y1 + m))
        # closed-eye slit color: body tone sampled beside the eye, deepened
        br, bg_, bb = rgb.getpixel((max(0, x0 - 18), cy))
        slit = (int(br * 0.45), int(bg_ * 0.45), int(bb * 0.45))
        eyes_info.append({
            'cx': cx, 'cy': cy, 'ew': ew, 'eh': eh,
            'patch': patch, 'slit': slit,
        })

    n = round(fps * loop)
    frames = []
    for i in range(n):
        t = i / fps
        dy = round(math.sin((t / loop) * 2 * math.pi) * -3)  # integer float only
        frame = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        frame.paste(eyeless, (0, dy), eyeless)

        d = ImageDraw.Draw(frame)
        for idx, e in enumerate(eyes_info):
            # wink mode: only the viewer-left eye animates, and it opens from
            # the closed seam rather than closing from open
            lid = wink_lid(t, loop) if (wink and idx == 0) else \
                  (1.0 if wink else blink_lid(t))
            cx, cy = e['cx'], e['cy'] + dy
            if lid >= 0.97:
                p = e['patch']
                frame.paste(p, (cx - p.size[0] // 2, cy - p.size[1] // 2), p)
            elif lid > 0.12:
                # crisp drawn ellipse for the transition, never a resampled one
                w = e['ew'] * (0.85 + 0.15 * lid)
                h = max(2.0, e['eh'] * lid)
                d.ellipse((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2),
                          fill=(245, 240, 225, 255))
            else:
                # closed: slight upward-curved slit, deepened body tone
                w = e['ew'] * 0.8
                lw = max(3, size // 96)
                d.arc((cx - w / 2, cy - w * 0.28, cx + w / 2, cy + w * 0.28),
                      start=180, end=360, fill=(*e['slit'], 255), width=lw)
        frames.append(frame)

    dur = round(1000 / fps)

    # WebP: PIL lossless keeps correct per-frame durations.
    frames[0].save(out_prefix + '.webp', save_all=True, append_images=frames[1:],
                   duration=dur, loop=0, lossless=True)

    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        for i, im in enumerate(frames):
            im.save(f'{tmp}/{i:04d}.png')
        subprocess.run(
            ['ffmpeg', '-y', '-framerate', str(fps), '-i', f'{tmp}/%04d.png',
             '-plays', '0', '-f', 'apng', out_prefix + '.png'],
            check=True, capture_output=True)

    gif_frames = []
    for im in frames:
        q = im.convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        alpha = im.getchannel('A')
        q.paste(255, (0, 0), alpha.point(lambda a: 255 if a < 128 else 0))
        gif_frames.append(q)
    gif_frames[0].save(out_prefix + '.gif', save_all=True, append_images=gif_frames[1:],
                       duration=dur, loop=0, transparency=255, disposal=2)

    import os
    for ext in ('webp', 'png', 'gif'):
        p = f'{out_prefix}.{ext}'
        print(p, os.path.getsize(p) // 1024, 'KB')


if __name__ == '__main__':
    main()
