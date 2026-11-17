#!/usr/bin/env python3
"""
Three "heavy cut-up type" concepts for the Tabella wordmark. Nothing here is applied to the app.

Start: Poppins Black (SIL Open Font License 1.1: free for commercial use), read from the @fontsource/poppins package, outlines converted to
geometry. The letters are then CUT with boolean operations (the cuts are the idea), and one small wax-red piece is added to each.

  a) THE SEAM     one horizontal slice through every letter, the halves offset like a sealed tablet; the seal sits in the seam
  b) STENCIL      stencil bridges cut through the letters; wax fills one crack
  c) STACKED BLOCK  TAB / ELLA tight in a block, cut through both rows; a red square closes one cut

  python3 tools/logo-concepts.py  ->  docs/logo/*.svg (paths) and /tmp/claude-0/logo-shapes.json
"""
import json, math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from shapely.geometry import Polygon, box, Point, LineString, MultiPolygon
from shapely import affinity
from shapely.ops import unary_union

FONT = os.environ.get("LOGO_FONT", "/tmp/claude-0/fonts/node_modules/@fontsource/poppins/files/poppins-latin-900-normal.woff")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "logo")
f = TTFont(FONT)
gs = f.getGlyphSet()
cmap = f.getBestCmap()
CAP = f["OS/2"].sCapHeight
XH = f["OS/2"].sxHeight


class Flat(BasePen):
    def __init__(self, gset):
        super().__init__(gset)
        self.contours, self.cur = [], None

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, 17):
            t = i / 16
            u = 1 - t
            self.cur.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0], u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, 13):
            t = i / 12
            u = 1 - t
            self.cur.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))

    def _closePath(self):
        if self.cur and len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = None

    _endPath = _closePath


def glyph(ch):
    name = cmap[ord(ch)]
    pen = Flat(gs)
    gs[name].draw(pen)
    poly = None
    for c in pen.contours:
        p = Polygon(c).buffer(0)
        poly = p if poly is None else poly.symmetric_difference(p)  # even-odd: holes fall out by themselves
    return poly, gs[name].width


def word(text, track=-14):
    """Letters side by side, each its own polygon, y up, baseline at 0."""
    x, out = 0, []
    for ch in text:
        g, w = glyph(ch)
        out.append(affinity.translate(g, x, 0))
        x += w + track
    return out, x - track


def first_segment(poly, y):
    """The first filled stretch along a horizontal line at height y: (x0, x1)."""
    b = poly.bounds
    inter = LineString([(b[0] - 5, y), (b[2] + 5, y)]).intersection(poly)
    parts = list(inter.geoms) if hasattr(inter, "geoms") else [inter]
    parts = sorted((p.bounds for p in parts if not p.is_empty), key=lambda t: t[0])
    return parts[0][0], parts[0][2]


def vsegment_top(poly, x):
    b = poly.bounds
    inter = LineString([(x, b[1] - 5), (x, b[3] + 5)]).intersection(poly)
    parts = list(inter.geoms) if hasattr(inter, "geoms") else [inter]
    parts = sorted((p.bounds for p in parts if not p.is_empty), key=lambda t: -t[3])
    return parts[0][1], parts[0][3]


def blob(cx, cy, r, bumps=7, wob=0.07):
    """A small wax seal: a round blob with a gently scalloped edge."""
    pts = [(cx + r * (1 + wob * math.sin(bumps * a)) * math.cos(a), cy + r * (1 + wob * math.sin(bumps * a)) * math.sin(a)) for a in [i * 2 * math.pi / 96 for i in range(96)]]
    return Polygon(pts)


def parts(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


# ---------------------------------------------------------------------------------------------------------------- a) THE SEAM
def seam(text="TABELLA", lower=False, gap=0.07, off=0.075, track=-14):
    ls, w = word(text, track)
    H = XH if lower else CAP
    allp = unary_union(ls)
    top_b = allp.bounds[3]
    y0 = H * 0.5
    g, o = gap * CAP, off * CAP
    top = allp.intersection(box(-1e4, y0 + g / 2, 1e5, 1e5))
    bot = allp.intersection(box(-1e4, -1e4, 1e5, y0 - g / 2))
    top = affinity.translate(top, o, 0)
    cx = w * (0.5 if not lower else 0.47)
    seal = blob(cx + o / 2, y0, 0.098 * CAP)
    return {"ink": [top, bot], "red": [seal], "w": w + o, "h": top_b, "mid": (cx + o / 2, y0)}


# ---------------------------------------------------------------------------------------------------------------- b) STENCIL
def stencil(text="TABELLA", gap=0.072, track=-14):
    ls, w = word(text, track)
    g = gap * CAP
    cuts, red = [], []
    for ch, p in zip(text, ls):
        b = p.bounds
        x0, y0, x1, y1 = b
        if ch == "T":  # the stem lets go of the bar
            ys = vsegment_top(p, x0 + (x1 - x0) * 0.04)
            tb = ys[1] - ys[0]
            cuts.append(box(x0 - 5, y1 - tb - g, x1 + 5, y1 - tb))
        elif ch == "A":  # the apex lets go of the legs
            yy = y0 + (y1 - y0) * 0.64
            cuts.append(box(x0 - 5, yy, x1 + 5, yy + g))
        elif ch == "B":  # the bowls let go of the stem top and bottom (the waist stays as the bridge); wax fills the lower crack
            sx = first_segment(p, y0 + (y1 - y0) * 0.27)[1]
            hh = y1 - y0
            cuts.append(box(sx, y0 + hh * 0.60, sx + g, y1 + 5))
            cuts.append(box(sx, y0 - 5, sx + g, y0 + hh * 0.40))
            red.append(box(sx - 0.2, y0 + hh * 0.16, sx + g + 0.2, y0 + hh * 0.30))
        elif ch == "E":  # the top and bottom arms let go of the stem; the middle arm is the bridge
            hh = y1 - y0
            sx = first_segment(p, y0 + hh * 0.24)[1]
            cuts.append(box(sx, y0 - 5, sx + g, y0 + hh * 0.34))
            cuts.append(box(sx, y0 + hh * 0.66, sx + g, y1 + 5))
        elif ch == "L":  # the stem lets go of the foot
            hh = y1 - y0
            ft = vsegment_top(p, x1 - (x1 - x0) * 0.04)
            cuts.append(box(x0 - 5, ft[1], first_segment(p, y0 + hh * 0.6)[1] + 0.5, ft[1] + g))
    cut = unary_union(cuts)
    ink = unary_union(ls).difference(cut)
    return {"ink": [ink], "red": red, "w": w, "h": CAP}


# ---------------------------------------------------------------------------------------------------------------- c) STACKED BLOCK
def block(gap=0.075, lead=0.06, track=-14):
    r1, w1 = word("TAB", track)
    r2, w2 = word("ELLA", track)
    s = w2 / w1  # TAB is scaled up to the width of ELLA, so the two rows make one block
    row1 = affinity.scale(unary_union(r1), s, s, origin=(0, 0))
    row2 = unary_union(r2)
    h2 = CAP
    h1 = CAP * s
    row1 = affinity.translate(row1, 0, h2 + lead * CAP)
    allp = unary_union([row1, row2])
    W, Htot = w2, h2 + lead * CAP + h1
    g = gap * CAP
    c1, c2 = W * 0.395, W * 0.745
    # the right part, past the second cut, steps down: the cut links the two rows
    step = 0.1 * CAP
    left = allp.intersection(box(-1e4, -1e4, c1, 1e5))
    mid = allp.intersection(box(c1 + g, -1e4, c2, 1e5))
    right = affinity.translate(allp.intersection(box(c2 + g, -1e4, 1e5, 1e5)), 0, -step)
    sq = 2.3 * g
    red = [box(c1 - (sq - g) / 2, 0, c1 + g + (sq - g) / 2, sq)]  # a small red square closes the first cut at the bottom
    return {"ink": [left, mid, right], "red": red, "w": W, "h": Htot, "cuts": (c1, c2, g, step)}


# ---------------------------------------------------------------------------------------------------------------- icons: one letter, scaled to fill
def icon_a():
    g, _ = glyph("T")
    gg = unary_union([g])
    b = g.bounds
    H = CAP
    y0, gp, o = H * 0.5, 0.075 * CAP, 0.085 * CAP
    top = affinity.translate(gg.intersection(box(-1e4, y0 + gp / 2, 1e5, 1e5)), o, 0)
    bot = gg.intersection(box(-1e4, -1e4, 1e5, y0 - gp / 2))
    cx = (b[0] + b[2]) / 2 + o / 2
    return {"ink": [top, bot], "red": [blob(cx, y0, 0.15 * CAP)]}


def icon_b():
    g, _ = glyph("B")
    b = g.bounds
    gp = 0.085 * CAP
    hh = b[3] - b[1]
    sx = first_segment(g, b[1] + hh * 0.27)[1]
    ink = g.difference(box(sx, b[1] + hh * 0.60, sx + gp, b[3] + 5)).difference(box(sx, b[1] - 5, sx + gp, b[1] + hh * 0.40))
    red = [box(sx - 0.2, b[1] + hh * 0.15, sx + gp + 0.2, b[1] + hh * 0.31)]
    return {"ink": [ink], "red": red}


def icon_c():
    g, _ = glyph("A")
    b = g.bounds
    gp = 0.1 * CAP
    cx = (b[0] + b[2]) / 2
    left = g.intersection(box(-1e4, -1e4, cx - gp / 2, 1e5))
    right = affinity.translate(g.intersection(box(cx + gp / 2, -1e4, 1e5, 1e5)), 0, -0.1 * CAP)
    sq = 1.5 * gp
    red = [box(cx - sq / 2, b[1] - 0.1 * CAP, cx + sq / 2, b[1] - 0.1 * CAP + sq)]
    return {"ink": [left, right], "red": red}


# ---------------------------------------------------------------------------------------------------------------- SVG
def d_of(geom):
    out = []
    for p in parts(geom):
        for ring in [p.exterior, *p.interiors]:
            pts = list(ring.simplify(0.35).coords)
            out.append("M" + " L".join(f"{x:.1f} {-y:.1f}" for x, y in pts[:-1]) + "Z")
    return " ".join(out)


def bounds_of(shapes):
    g = unary_union([p for k in ("ink", "red") for p in shapes[k]])
    return g.bounds


def svg(shapes, ink="#15171c", red="#8a1c27", bg=None, pad=0.06, size=None, extra=""):
    x0, y0, x1, y1 = bounds_of(shapes)
    w, h = x1 - x0, y1 - y0
    p = pad * max(w, h)
    vb = f"{x0 - p:.1f} {-(y1 + p):.1f} {w + 2 * p:.1f} {h + 2 * p:.1f}"
    rect = f'<rect x="{x0 - p:.1f}" y="{-(y1 + p):.1f}" width="{w + 2 * p:.1f}" height="{h + 2 * p:.1f}" fill="{bg}"/>' if bg else ""
    inkp = "".join(f'<path d="{d_of(g)}" fill="{ink}" fill-rule="evenodd"/>' for g in shapes["ink"])
    redp = "".join(f'<path d="{d_of(g)}" fill="{red}" fill-rule="evenodd"/>' for g in shapes["red"])
    sz = f' height="{size}"' if size else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{sz}>{rect}{inkp}{redp}{extra}</svg>'


def icon_svg(shapes, tile="#15171c", ink="#f4f3ef", red="#b3333f", frac=0.62):
    x0, y0, x1, y1 = bounds_of(shapes)
    w, h = x1 - x0, y1 - y0
    k = 512 * frac / max(w, h)
    tx, ty = 256 - (x0 + w / 2) * k, 256 + (y0 + h / 2) * k
    body = "".join(f'<path d="{d_of(g)}" fill="{ink}" fill-rule="evenodd"/>' for g in shapes["ink"]) + "".join(f'<path d="{d_of(g)}" fill="{red}" fill-rule="evenodd"/>' for g in shapes["red"])
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{tile}"/><g transform="translate({tx:.1f} {ty:.1f}) scale({k:.4f})">{body}</g></svg>'


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    sets = {
        "a-seam-upper": seam("TABELLA"),
        "a-seam-lower": seam("tabella", lower=True),
        "b-stencil": stencil("TABELLA"),
        "c-block": block(),
    }
    icons = {"a-seam": icon_a(), "b-stencil": icon_b(), "c-block": icon_c()}
    for k, v in sets.items():
        open(f"{OUT}/concept-{k}-pearl.svg", "w").write(svg(v, bg="#f4f3ef"))
        open(f"{OUT}/concept-{k}-night.svg", "w").write(svg(v, ink="#eef0f6", red="#c0303d", bg="#0c0e13"))
        open(f"{OUT}/concept-{k}-mark.svg", "w").write(svg(v))
    for k, v in icons.items():
        open(f"{OUT}/icon-{k}.svg", "w").write(icon_svg(v))
    print("written", len(sets), "wordmarks and", len(icons), "icons to", os.path.abspath(OUT))
