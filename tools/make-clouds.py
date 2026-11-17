#!/usr/bin/env python3
"""
Renders Tabella's clouds from scratch: nothing photographed, nothing copied. Each cloud is a few soft shapes merged and
blurred until no edge is left, then split into two alpha masks, a lighter one for the top and right and a pinker one for
the lower left. The page tints them with the colours of the time of day (see app/src/lib/sky.ts).

  main.webp      the one big cloud (the hero's, and the middle of every other page)
  puff-a/b/c     three small flat clouds for the edges, which sit far away

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


def cloud(w, h, blobs, sigma, seed, wobble=0.0):
    """blobs: (cx, cy, rx, ry) in pixels. Returns (lit, shade) alpha in 0..1."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.zeros((h, w), np.float32)
    for cx, cy, rx, ry in blobs:
        d += np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) * 1.35)
    if wobble:  # a whisper of unevenness, so it is not a perfect ellipse
        n = blur(rng.standard_normal((h, w)).astype(np.float32), sigma * 2.2)
        n = n / (np.abs(n).max() + 1e-6)
        d = d * (1 + wobble * n)
    d = smooth(d, 0.18, 1.15)
    d = blur(d, sigma)
    d = np.clip(d / max(d.max(), 1e-6), 0, 1)
    # nothing may reach the edge of the picture, so no box ever shows
    edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy))
    d = d * smooth(edge, 0, min(w, h) * 0.12)
    d = np.where(d < 0.01, 0, d)
    # light from the top right: the top and right are lighter, the lower left is pinker
    nx = (xx / w - 0.5) * 2
    ny = (yy / h - 0.5) * 2
    lit = np.clip(0.62 - 0.34 * ny + 0.16 * nx, 0, 1)
    lit = smooth(lit, 0.1, 0.95)
    lit = blur(lit, sigma * 1.5)
    return d * lit, d * (1 - lit * 0.92)


def save(name, alpha):
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    img = Image.new("RGBA", a.shape[::-1], (255, 255, 255, 0))
    img.putalpha(Image.fromarray(a))
    img.save(OUT + name + ".webp", "WEBP", quality=88, alpha_quality=80, method=6, exact=True)


def main():
    made = {}
    # the main cloud: a bumpy mound, a flat soft underside
    W, H = 1000, 520
    made["main"] = cloud(W, H, [(255, 355, 125, 85), (400, 270, 140, 118), (570, 252, 145, 128), (715, 300, 120, 100), (830, 372, 80, 60), (545, 390, 360, 66)], sigma=20, seed=1, wobble=0.25)
    # three small flat ones
    made["puff-a"] = cloud(640, 280, [(210, 150, 150, 52), (360, 130, 130, 62), (470, 160, 110, 44)], sigma=16, seed=2, wobble=0.2)
    made["puff-b"] = cloud(640, 280, [(190, 140, 120, 48), (330, 150, 160, 54), (470, 150, 100, 40)], sigma=16, seed=3, wobble=0.2)
    made["puff-c"] = cloud(640, 280, [(230, 150, 190, 46), (400, 140, 140, 56)], sigma=16, seed=4, wobble=0.2)
    for k, (lit, shade) in made.items():
        save(k + "-lit", lit)
        save(k + "-shade", shade)
    if "--preview" in sys.argv:
        bg = np.array([236, 233, 228.0])
        img = np.broadcast_to(bg, (900, 1200, 3)).copy()

        def put(name, x, y, opacity):
            lit, shade = made[name]
            h, w = lit.shape
            for a, col in ((shade, np.array([231, 203, 204.0])), (lit, np.array([241, 224, 222.0]))):
                al = (a * opacity)[..., None]
                img[y : y + h, x : x + w] = img[y : y + h, x : x + w] * (1 - al) + col * al

        put("main", 90, 200, 0.95)
        put("puff-a", 40, 30, 0.45)
        put("puff-b", 540, 60, 0.45)
        put("puff-c", 520, 600, 0.45)
        Image.fromarray(img.clip(0, 255).astype(np.uint8)).save("/tmp/clouds-preview.png")


main()
