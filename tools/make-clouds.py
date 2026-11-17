#!/usr/bin/env python3
"""
Renders Tabella's cloud masks from scratch (no photos, nothing copied): spectral noise, domain warping and
a simple light-from-above shading pass. Each cloud layer is two soft alpha masks, a lit one and a shaded one,
which the page tints with the colours of the time of day. The layers tile sideways, so they can drift forever.

  python3 tools/make-clouds.py            writes app/src/assets/sky/*.webp
  python3 tools/make-clouds.py --preview  also writes /tmp/clouds-preview.png (afternoon colours)
"""
import sys
import numpy as np
from PIL import Image

OUT = __file__.replace("tools/make-clouds.py", "app/src/assets/sky/")
W, H = 1400, 800


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, sigma):
    """Periodic gaussian blur by FFT."""
    if sigma <= 0:
        return a
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx**2 + fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def spectral(rng, beta, sx=1.0, sy=1.0, shape=(H, W)):
    """Periodic 1/f^beta noise in 0..1; sx, sy stretch the features."""
    fy = np.fft.fftfreq(shape[0])[:, None] * sy
    fx = np.fft.fftfreq(shape[1])[None, :] * sx
    f = np.sqrt(fx**2 + fy**2)
    f[0, 0] = 1
    amp = f ** (-beta / 2.0)
    amp[0, 0] = 0
    n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal(shape)) * amp))
    lo, hi = np.percentile(n, [1, 99])
    return np.clip((n - lo) / (hi - lo), 0, 1)


def warp(a, dx, dy):
    """Periodic bilinear warp of a by pixel offsets dx, dy."""
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x = (xx + dx) % w
    y = (yy + dy) % h
    x0, y0 = np.floor(x).astype(int) % w, np.floor(y).astype(int) % h
    x1, y1 = (x0 + 1) % w, (y0 + 1) % h
    fx, fy = x - np.floor(x), y - np.floor(y)
    return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x1] * fx * (1 - fy) + a[y1, x0] * (1 - fx) * fy + a[y1, x1] * fx * fy)


def shift(a, dx, dy):
    return np.roll(np.roll(a, dy, axis=0), dx, axis=1)


def light(d, scales):
    """How lit each part is, from a light at the upper left: lit where there is less cloud towards the light."""
    s = np.zeros_like(d)
    for k, wgt in scales:
        toward = shift(d, k // 2, k)  # cloud density towards the upper left
        s += wgt * (d - toward)
    return np.clip(0.6 + 1.25 * s, 0, 1)


def layer(seed, *, beta, sx, sy, cover, bill, warp_px, soft, strength, bottom_heavy=False):
    rng = np.random.default_rng(seed)
    base = spectral(rng, beta, sx, sy)
    detail = spectral(rng, beta + 0.2, sx * 1.8, sy * 1.8)
    billow = 1 - np.abs(spectral(rng, 3.2, sx * 1.6, sy * 1.6) - 0.5) * 2
    wx = (spectral(rng, 3.0, sx * 1.4, sy * 1.4) - 0.5) * 2 * warp_px
    wy = (spectral(rng, 3.0, sx * 1.4, sy * 1.4) - 0.5) * 2 * warp_px * 0.6
    field = 0.62 * base + 0.14 * detail + bill * 0.24 * billow
    field = warp(field, wx, wy)
    if bottom_heavy:
        yy = np.linspace(0, 1, H)[:, None]
        field = field * (0.72 + 0.28 * np.sin(yy * np.pi))
    lo, hi = np.percentile(field, [100 - cover - 22, 100 - cover + 14])
    d = smooth(field, lo, hi)
    d = blur(d, soft)
    d = np.clip(d, 0, 1) ** 1.15
    lit = light(d, [(10, 0.4), (28, 0.35), (60, 0.3)])
    lit = blur(lit, soft * 1.4 + 3)
    a_lit = np.clip(d * lit, 0, 1) * strength
    a_shade = np.clip(d * (1 - lit) * 1.05, 0, 1) * strength
    return a_lit, a_shade


def hero_cloud(seed=11, w=900, h=360):
    """One small cumulus bank for the letter to sit on: flat soft base, billowing top."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.zeros((h, w), np.float32)
    base_y = h * 0.72
    for _ in range(26):
        cx = rng.uniform(w * 0.14, w * 0.86)
        r = rng.uniform(34, 92) * (1.15 - abs(cx - w / 2) / w)
        cy = base_y - r * rng.uniform(0.15, 0.85)
        blob = np.exp(-(((xx - cx) / r) ** 2 + ((yy - cy) / (r * 0.9)) ** 2) * 1.6)
        d = np.maximum(d, blob)
    d = np.where(yy > base_y, d * np.exp(-((yy - base_y) / 26.0) ** 2), d)  # a soft flat underside
    n = spectral(rng, 2.4, 1, 1, (h, w))
    d = np.clip(d * (0.78 + 0.5 * n), 0, 1)
    d = blur(d, 3.0)
    d = smooth(d, 0.08, 0.7)
    lit = light(d, [(4, 0.5), (12, 0.35), (26, 0.3)])
    lit = blur(lit, 2.2)
    return np.clip(d * lit, 0, 1), np.clip(d * (1 - lit) * 1.05, 0, 1)


def save(name, alpha, q=82):
    a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    img = Image.new("RGBA", a.shape[::-1], (255, 255, 255, 0))
    img.putalpha(Image.fromarray(a))
    img.save(OUT + name + ".webp", "WEBP", quality=q, alpha_quality=72, method=6, exact=True)


def main():
    spec = {
        # far: wide, flat, hazy; middle: softer banks; near: big, billowing, slow
        "far": dict(seed=3, beta=3.5, sx=1.7, sy=0.7, cover=38, bill=0.2, warp_px=110, soft=8, strength=0.85),
        "mid": dict(seed=7, beta=3.3, sx=1.45, sy=0.9, cover=32, bill=0.45, warp_px=90, soft=5.5, strength=0.95),
        "near": dict(seed=19, beta=3.1, sx=1.4, sy=1.0, cover=26, bill=0.7, warp_px=70, soft=4, strength=1.0, bottom_heavy=True),
    }
    made = {}
    for k, kw in spec.items():
        lit, shade = layer(**kw)
        made[k] = (lit, shade)
        save(f"{k}-lit", lit)
        save(f"{k}-shade", shade)
    hl, hs = hero_cloud()
    save("hero-lit", hl)
    save("hero-shade", hs)
    if "--preview" in sys.argv:
        top, bot = np.array([238, 240, 242.0]), np.array([246, 242, 238.0])
        yy = np.linspace(0, 1, H)[:, None, None]
        img = top * (1 - yy) + bot * yy
        img = np.broadcast_to(img, (H, W, 3)).copy()
        for k, op in (("far", 0.5), ("mid", 0.62), ("near", 0.75)):
            lit, shade = made[k]
            for a, col in ((shade, np.array([236, 196, 200.0])), (lit, np.array([255, 253, 252.0]))):
                al = (a * op)[..., None]
                img = img * (1 - al) + col * al
        Image.fromarray(img.clip(0, 255).astype(np.uint8)).save("/tmp/clouds-preview.png")
        hero = np.broadcast_to(np.array([244, 241, 238.0]), (360, 900, 3)).copy()
        for a, col in ((hs, np.array([236, 196, 200.0])), (hl, np.array([255, 253, 252.0]))):
            al = a[..., None]
            hero = hero * (1 - al) + col * al
        Image.fromarray(hero.clip(0, 255).astype(np.uint8)).save("/tmp/hero-preview.png")


main()
