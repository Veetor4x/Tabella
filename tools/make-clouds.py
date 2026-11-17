#!/usr/bin/env python3
"""
Renders Tabella's clouds from scratch: nothing photographed, nothing copied. Each cloud is a few soft shapes merged and
blurred until no edge is left, then split into two alpha masks, a lighter one for the top and right and a pinker one for
the lower left. The page tints them with the colours of the time of day (see app/src/lib/sky.ts).

  main.webp      the one big cloud, which rests under the hero's envelope
  far/mid/near   three layers that tile sideways, so they can drift for ever without a seam: far has a few small faint
                 clouds, mid a few bigger ones, near has the big one. Each is a single soft alpha mask, tinted by the page.

  python3 tools/make-clouds.py            writes app/src/assets/sky/*.webp
  python3 tools/make-clouds.py --preview  also writes /tmp/clouds-preview.png
"""
import sys
import numpy as np
from PIL import Image

OUT = __file__.replace("tools/make-clouds.py", "app/src/assets/sky/")


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, sigma):
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx**2 + fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def cloud(w, h, blobs, sigma, seed, wobble=0.0, wrap=False):
    """blobs: (cx, cy, rx, ry) in pixels. Returns (lit, shade) alpha in 0..1."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.zeros((h, w), np.float32)
    for cx, cy, rx, ry in blobs:
        dx = xx - cx
        if wrap:  # the picture tiles sideways: distances go round
            dx = (dx + w / 2) % w - w / 2
        d += np.exp(-((dx / rx) ** 2 + ((yy - cy) / ry) ** 2) * 1.35)
    if wobble:  # a whisper of unevenness, so it is not a perfect ellipse
        n = blur(rng.standard_normal((h, w)).astype(np.float32), sigma * 2.2)
        n = n / (np.abs(n).max() + 1e-6)
        d = d * (1 + wobble * n)
    d = smooth(d, 0.18, 1.15)
    d = blur(d, sigma)
    d = np.clip(d / max(d.max(), 1e-6), 0, 1)
    # nothing may reach the edge of the picture, so no box ever shows
    edge = np.minimum(yy, h - 1 - yy) if wrap else np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
    d = d * smooth(edge, 0, min(w, h) * 0.12)
    d = np.where(d < 0.01, 0, d)
    # light from the top right: the top and right are lighter, the lower left is pinker
    nx = (xx / w - 0.5) * 2
    ny = (yy / h - 0.5) * 2
    lit = np.clip(0.62 - 0.34 * ny + 0.16 * nx, 0, 1)
    lit = smooth(lit, 0.1, 0.95)
    lit = blur(lit, sigma * 1.5)
    # one soft mask: a little denser at the lower left, so it has a shape without any second layer or edge
    return np.clip(d * (0.74 + 0.26 * (1 - lit)), 0, 1)


def save(name, alpha):
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    img = Image.new("RGBA", a.shape[::-1], (255, 255, 255, 0))
    img.putalpha(Image.fromarray(a))
    img.save(OUT + name + ".webp", "WEBP", quality=90, alpha_quality=85, method=6, exact=True)


def puff(cx, cy, k, flat=1.0):
    """A small flat cloud as blobs around (cx, cy); k scales it."""
    return [(cx - 70 * k, cy + 4 * k, 80 * k, 26 * k * flat), (cx + 5 * k, cy - 10 * k, 90 * k, 34 * k * flat), (cx + 80 * k, cy + 6 * k, 70 * k, 24 * k * flat)]


def main():
    made = {}
    W, H = 1000, 520
    made["main"] = cloud(W, H, [(255, 355, 125, 85), (400, 270, 140, 118), (570, 252, 145, 128), (715, 300, 120, 100), (830, 372, 80, 60), (545, 390, 360, 66)], sigma=22, seed=1, wobble=0.25)
    TW, TH = 1760, 800
    far = [b for (x, y, k) in [(0.08, 0.2, 0.9), (0.33, 0.74, 1.1), (0.58, 0.12, 0.8), (0.83, 0.56, 1.0)] for b in puff(TW * x, TH * y, k)]
    mid = [b for (x, y, k) in [(0.17, 0.46, 1.9), (0.52, 0.8, 1.6), (0.78, 0.22, 2.1)] for b in puff(TW * x, TH * y, k)]
    near = [(TW * 0.5 + dx * 1.0, TH * 0.5 + dy * 1.0, rx, ry) for dx, dy, rx, ry in [(-245, 55, 125, 85), (-100, -30, 140, 118), (70, -48, 145, 128), (215, 0, 120, 100), (330, 72, 80, 60), (45, 90, 360, 66)]]
    made["far"] = cloud(TW, TH, far, sigma=18, seed=5, wobble=0.15, wrap=True)
    made["mid"] = cloud(TW, TH, mid, sigma=26, seed=6, wobble=0.15, wrap=True)
    made["near"] = cloud(TW, TH, near, sigma=30, seed=7, wobble=0.2, wrap=True)
    for k, a in made.items():
        save(k, a)
    if "--preview" in sys.argv:
        bg = np.array([237, 234, 229.0])
        col = np.array([230, 198, 200.0])
        img = np.broadcast_to(bg, (TH, TW, 3)).copy()
        for k, op in (("far", 0.5), ("mid", 0.65), ("near", 0.85)):
            al = (made[k] * op)[..., None]
            img = img * (1 - al) + col * al
        Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((1100, 500)).save("/tmp/clouds-preview.png")


main()
