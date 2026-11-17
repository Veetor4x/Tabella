#!/usr/bin/env python3
"""
The Tabella mark: a small wax-red seal with a T, set beside the serif "Tabella" wordmark. Writes app/public/seal.svg (full detail),
favicon.svg (the same seal, the T larger so it reads at 16px), and the PNG sizes (app icons, and the picture emails use).
The T is Instrument Serif (SIL OFL 1.1) converted to a path, so the files need no font.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "public")
FONT = os.environ.get("SEAL_FONT", "/home/user/Tabella/app/node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff")
f = TTFont(FONT)
gs = f.getGlyphSet()
name = f.getBestCmap()[ord("T")]
g = gs[name]


def t_path(height, cx=50, cy=51):
    """The T as an SVG path, `height` units tall (viewBox 100), centred on (cx, cy)."""
    cap = f["OS/2"].sCapHeight
    s = height / cap
    w = g.width * s
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}")
    g.draw(TransformPen(pen, (s, 0, 0, -s, cx - w / 2, cy + height / 2)))
    return pen.getCommands()


BLOB = "M50 5c8 0 13 5 21 7 9 2 16 7 18 16 2 8-2 13-1 21 1 8 4 13 1 21-3 8-11 12-18 16-8 4-13 8-21 6-8-2-13-8-21-10C20 80 11 75 9 66c-2-8 3-13 2-21-1-8-5-14-1-22 4-8 13-10 20-13C37 5 43 5 50 5z"
DEFS = '<defs><radialGradient id="g" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#b3333f"/><stop offset=".6" stop-color="#8a1c27"/><stop offset="1" stop-color="#5d1019"/></radialGradient></defs>'


def seal(ring=True, th=29):
    ringp = '<circle cx="50" cy="50" r="28" fill="none" stroke="#e3a3aa" stroke-opacity=".5" stroke-width="1.5"/>' if ring else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{DEFS}<path d="{BLOB}" fill="url(#g)"/>{ringp}<path d="{t_path(th)}" fill="#f0c9cd" fill-opacity=".96"/></svg>'


def tile(size, bg="#f4f1ea", frac=0.66, radius=0):
    k = size * frac / 100
    off = (size - size * frac) / 2
    inner = seal().replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">', "").replace("</svg>", "")
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}"><rect width="{size}" height="{size}" rx="{radius}" fill="{bg}"/><g transform="translate({off:.1f} {off:.1f}) scale({k:.4f})">{inner}</g></svg>'


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    open(f"{OUT}/seal.svg", "w").write(seal(ring=True, th=29))
    open(f"{OUT}/favicon.svg", "w").write(seal(ring=False, th=40))
    for n, size in (("apple-touch-icon", 180), ("icon-192", 192), ("icon-512", 512)):
        open(f"/tmp/claude-0/{n}.svg", "w").write(tile(size))
    open("/tmp/claude-0/seal-96.svg", "w").write(seal().replace('viewBox="0 0 100 100"', 'width="96" height="96" viewBox="0 0 100 100"'))
    print("seal and favicon written; icon svgs in /tmp/claude-0")
