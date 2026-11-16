const opentype = require("opentype.js");
const fs = require("fs"), path = require("path");
const OUT = process.argv[2];
const buf = fs.readFileSync(require.resolve("@fontsource/league-spartan/files/league-spartan-latin-800-normal.woff"));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const INK = "#14161b", PEARL = "#f1f0ec", WAX = "#c0303d";
const SZ = 400;
let uid = 0;
const r2 = (n) => Math.round(n * 100) / 100;

function cmdsToD(cmds) {
  return cmds.map((c) => c.type === "M" ? `M${r2(c.x)} ${r2(c.y)}` : c.type === "L" ? `L${r2(c.x)} ${r2(c.y)}` : c.type === "C" ? `C${r2(c.x1)} ${r2(c.y1)} ${r2(c.x2)} ${r2(c.y2)} ${r2(c.x)} ${r2(c.y)}` : c.type === "Q" ? `Q${r2(c.x1)} ${r2(c.y1)} ${r2(c.x)} ${r2(c.y)}` : "Z").join("");
}
function bboxOf(cmds) {
  const p = new opentype.Path(); p.commands = cmds; const b = p.getBoundingBox();
  return { x0: b.x1, y0: b.y1, x1: b.x2, y1: b.y2, w: b.x2 - b.x1, h: b.y2 - b.y1, cx: (b.x1 + b.x2) / 2, cy: (b.y1 + b.y2) / 2 };
}
/** Real glyph outlines from the font, as paths, with kerning. extra[i] = added space before letter i. */
function layout(text, extra = {}, tracking = -6) {
  const glyphs = font.stringToGlyphs(text); const sc = SZ / font.unitsPerEm; let x = 0; const out = [];
  glyphs.forEach((g, i) => {
    if (i > 0) x += font.getKerningValue(glyphs[i - 1], g) * sc + tracking;
    x += extra[i] || 0;
    const cmds = g.getPath(x, 0, SZ).commands; const subs = []; let cur = null;
    for (const c of cmds) { if (c.type === "M") { cur = []; subs.push(cur); } cur.push(c); }
    const sub = subs.map((s) => ({ cmds: s, d: cmdsToD(s), bb: bboxOf(s) })).sort((a, b) => b.bb.w * b.bb.h - a.bb.w * a.bb.h);
    out.push({ ch: text[i], d: cmdsToD(cmds), bb: bboxOf(cmds), outer: sub[0], counter: sub[1] || null });
    x += g.advanceWidth * sc;
  });
  return out;
}
const union = (ls) => ({ x0: Math.min(...ls.map((l) => l.bb.x0)), y0: Math.min(...ls.map((l) => l.bb.y0)), x1: Math.max(...ls.map((l) => l.bb.x1)), y1: Math.max(...ls.map((l) => l.bb.y1)) });
const box = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const XH = -layout("x")[0].bb.y0; // x-height
const paths = (ls, fill) => ls.map((l) => `<path d="${l.d}" fill="${fill}"/>`).join("");

// 1. Split tablet: the word sliced through the middle; the halves sit offset like the two leaves of a closed tablet.
function split(text, fg, open) {
  const ls = layout(text), u = union(ls), id = ++uid, yc = -XH * 0.52, gap = 9, off = SZ * 0.085;
  const all = paths(ls, fg);
  const defs = `<clipPath id="t${id}"><rect x="${u.x0 - 50}" y="${u.y0 - 50}" width="${u.x1 - u.x0 + 100}" height="${yc - gap - u.y0 + 50}"/></clipPath><clipPath id="b${id}"><rect x="${u.x0 - 50}" y="${yc + gap}" width="${u.x1 - u.x0 + 100}" height="${u.y1 - yc + 50}"/></clipPath>`;
  if (!open) {
    return { svg: `<defs>${defs}</defs><g clip-path="url(#t${id})">${all}</g><g transform="translate(${off} 0)" clip-path="url(#b${id})">${all}</g><circle cx="${u.x1 + off + 34}" cy="${yc}" r="22" fill="${WAX}"/>`, box: box(u.x0, u.y0, u.x1 + off + 60, u.y1) };
  }
  const lift = 60, ang = -3.2;
  return { svg: `<defs>${defs}</defs><g transform="rotate(${ang} ${u.x0} ${yc}) translate(0 ${-lift * 0.3})" clip-path="url(#t${id})">${all}</g><g transform="translate(${off} ${lift * 0.5})" clip-path="url(#b${id})">${all}</g><rect x="${u.x0 + off}" y="${yc + lift * 0.5 - 16}" width="${u.x1 - u.x0}" height="10" fill="${WAX}"/>`, box: box(u.x0, u.y0 - (u.x1 - u.x0) * 0.06, u.x1 + off + 10, u.y1 + lift * 0.5) };
}
// 2. Stacked block: tab / ella set as one square block, with the seal completing the short line.
function stacked(fg) {
  const a = layout("tab"), b = layout("ella"), ua = union(a), ub = union(b), r = XH / 2, gapS = 20;
  const topW = ua.x1 - ua.x0 + gapS + 2 * r;             // "tab" + seal
  const k = topW / (ub.x1 - ub.x0);                      // scale "ella" so both lines are exactly as wide
  const gapL = 34, botTop = gapL, botH = (ub.y1 - ub.y0) * k;
  const svg = `<g transform="translate(${-ua.x0} 0)">${paths(a, fg)}</g>` +
    `<circle cx="${ua.x1 - ua.x0 + gapS + r}" cy="${-r}" r="${r}" fill="${WAX}"/><circle cx="${ua.x1 - ua.x0 + gapS + r}" cy="${-r}" r="${r * 0.6}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="5"/>` +
    `<g transform="translate(${-ub.x0 * k} ${botTop - ub.y0 * k}) scale(${k})">${paths(b, fg)}</g>`;
  return { svg, box: box(0, ua.y0, topW, botTop + botH) };
}
// 3. Keyhole a: the last a loses its counter and gains a keyhole.
function keyhole(text, fg) {
  const ls = layout(text), u = union(ls), k = ls.map((l) => l.ch).lastIndexOf("a");
  let s = "";
  ls.forEach((l, i) => {
    if (i !== k) { s += `<path d="${l.d}" fill="${fg}"/>`; return; }
    const c = l.counter.bb, r = l.bb.w * 0.125, cx = c.cx, cy = c.cy - r * 0.75, bot = c.cy + r * 1.75;
    s += `<path d="${l.outer.d}" fill="${fg}"/><path d="M${cx - r * 0.42} ${cy + r * 0.6}L${cx - r * 0.95} ${bot}L${cx + r * 0.95} ${bot}L${cx + r * 0.42} ${cy + r * 0.6}Z" fill="${WAX}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${WAX}"/>`;
  });
  return { svg: s, box: box(u.x0, u.y0, u.x1, u.y1) };
}
// 4. The two l's as two standing figures, the seal held between them.
function figures(text, fg) {
  const i0 = text.indexOf("ll"), probe = layout(text), w = probe[i0].bb.w, room = w * 1.05;
  const ls = layout(text, { [i0 + 1]: room, [i0 + 2]: text[i0 + 2] ? 4 : 0 }), u = union(ls), id = ++uid;
  let s = "", defs = "";
  ls.forEach((l, i) => {
    if (i !== i0 && i !== i0 + 1) { s += `<path d="${l.d}" fill="${fg}"/>`; return; }
    const b = l.bb, r = b.w * 0.5, hy = b.y0 + r, neck = hy + r + 10;
    defs += `<clipPath id="f${id}${i}"><rect x="${b.x0 - 40}" y="${neck}" width="${b.w + 80}" height="${b.y1 - neck + 10}"/></clipPath>`;
    // body: the l itself, with rounded shoulders; head: a disc
    s += `<g clip-path="url(#f${id}${i})"><path d="${l.d}" fill="${fg}"/></g><path d="M${b.x0} ${neck + b.w * 0.5}A${b.w / 2} ${b.w / 2} 0 0 1 ${b.x1} ${neck + b.w * 0.5}Z" fill="${fg}"/><circle cx="${b.cx}" cy="${hy}" r="${r}" fill="${fg}"/>`;
  });
  const A = ls[i0].bb, B = ls[i0 + 1].bb, cx = (A.x1 + B.x0) / 2, rr = (B.x0 - A.x1) / 2 + 9;
  // clear a thin ring of ink around the seal so it reads as held, not pasted
  s = s.replace(/<g clip-path="url\(#f\d+\)"><path d="[^"]+" fill="[^"]+"\/><\/g>/g, (m) => m);
  s += `<circle cx="${cx}" cy="${-XH * 0.5}" r="${rr + 9}" fill="${INK === fg ? PEARL : "BG"}"/><circle cx="${cx}" cy="${-XH * 0.5}" r="${rr}" fill="${WAX}"/>`;
  return { svg: `<defs>${defs}</defs>` + s, box: box(u.x0, u.y0 - 10, u.x1, u.y1) };
}
// 5. Stencil: bridges cut through every letter; one gap keeps a fragment of the red seal.
function stencil(text, fg, bg) {
  const ls = layout(text), u = union(ls), id = ++uid, g = 15;
  let cuts = "", extra = "", done = false;
  ls.forEach((l) => {
    const b = l.bb;
    if (l.counter) {
      const c = l.counter.bb;
      if (l.ch === "b" && !done) {
        done = true; const gw = g * 3.4;
        cuts += `<rect x="${c.cx - gw / 2}" y="${b.y0 - 20}" width="${gw}" height="${b.h + 40}" fill="#000"/>`;
        extra += `<clipPath id="s${id}"><rect x="${c.cx - gw / 2 + 7}" y="${-XH - 40}" width="${gw - 14}" height="${XH + 80}"/></clipPath><circle cx="${c.cx}" cy="${c.cy}" r="${(b.y1 - c.cy) + 2}" fill="${WAX}" clip-path="url(#s${id})"/>`;
      } else cuts += `<rect x="${c.cx - g / 2}" y="${b.y0 - 20}" width="${g}" height="${b.h + 40}" fill="#000"/>`;
    } else if (l.ch === "t") cuts += `<rect x="${b.x0 - 20}" y="${-XH * 0.42}" width="${b.w + 40}" height="${g}" fill="#000"/>`;
    else cuts += `<rect x="${b.x0 - 20}" y="${-XH * 0.42}" width="${b.w + 40}" height="${g}" fill="#000"/>`;
  });
  const svg = `<defs><mask id="m${id}" maskUnits="userSpaceOnUse" x="${u.x0 - 60}" y="${u.y0 - 60}" width="${u.x1 - u.x0 + 120}" height="${u.y1 - u.y0 + 120}"><rect x="${u.x0 - 60}" y="${u.y0 - 60}" width="${u.x1 - u.x0 + 120}" height="${u.y1 - u.y0 + 120}" fill="#fff"/>${cuts}</mask></defs><g mask="url(#m${id})">${paths(ls, fg)}</g>${extra}`;
  return { svg, box: box(u.x0, u.y0, u.x1, u.y1) };
}
// 6. Wildcard, "sealed, then opened": the first a is closed with wax, the last a stands open.
function sealedOpen(text, fg) {
  const ls = layout(text), u = union(ls), k = text.indexOf("a");
  let s = "";
  ls.forEach((l, i) => {
    if (i !== k) { s += `<path d="${l.d}" fill="${fg}"/>`; return; }
    const c = l.counter.bb, r = Math.min(c.w, c.h) / 2;
    s += `<path d="${l.outer.d}" fill="${fg}"/><circle cx="${c.cx}" cy="${c.cy}" r="${r * 0.98}" fill="${WAX}"/><circle cx="${c.cx}" cy="${c.cy}" r="${r * 0.6}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4"/>`;
  });
  return { svg: s, box: box(u.x0, u.y0, u.x1, u.y1) };
}

/** Place a drawing inside a rectangle, centred, scaled to fit. */
function fit(dr, x, y, w, h, bg) {
  const s = Math.min(w / dr.box.w, h / dr.box.h);
  const tx = x + (w - dr.box.w * s) / 2 - dr.box.x * s, ty = y + (h - dr.box.h * s) / 2 - dr.box.y * s;
  return `<g transform="translate(${r2(tx)} ${r2(ty)}) scale(${r2(s * 1000) / 1000})">${dr.svg.replace(/"BG"/g, `"${bg}"`)}</g>`;
}
const icon = (dr, x, y, size) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}" fill="${PEARL}"/>${fit(dr, x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6, PEARL)}`;

const PW = 1600, PH = 900;
const C = [
  { n: "1", name: "Split tablet", note: "The word sliced through the middle; the halves sit offset like a closed tablet. Below: the opening frame.", main: (fg, bg) => [split("tabella", fg, false), split("tabella", fg, true)], ic: () => split("t", INK, false) },
  { n: "2", name: "Stacked block", note: "tab / ella set as one square block. The wax seal completes the short line.", main: (fg) => [stacked(fg)], ic: () => stacked(INK) },
  { n: "3", name: "Keyhole a", note: "The last a loses its counter and becomes a lock. Only the right people open it.", main: (fg) => [keyhole("tabella", fg)], ic: () => keyhole("a", INK) },
  { n: "4", name: "Two figures", note: "The ll become two people standing together, holding the seal between them.", main: (fg) => [figures("tabella", fg)], ic: () => figures("ll", INK) },
  { n: "5", name: "Stencil", note: "Stencil bridges cut through every letter. One gap keeps a fragment of the red seal.", main: (fg, bg) => [stencil("tabella", fg, bg)], ic: () => stencil("b", INK, PEARL) },
  { n: "6", name: "Wildcard: sealed, then opened", note: "The first a is closed with wax, the last a stands open. The tagline, told by two letters.", main: (fg) => [sealedOpen("tabella", fg)], ic: () => sealedOpen("a", INK) },
];
function panel(c, x, y) {
  const d = c.main(PEARL, INK); let s = `<rect x="${x}" y="${y}" width="${PW}" height="${PH}" fill="${INK}"/>`;
  if (d.length === 1) s += fit(d[0], x + 170, y + 150, PW - 340, PH - 330, INK);
  else { s += fit(d[0], x + 330, y + 95, PW - 660, 300, INK) + fit(d[1], x + 330, y + 430, PW - 660, 330, INK);
    s += `<text x="${x + 70}" y="${y + 255}" font-size="20" letter-spacing="3" fill="#8b92a1">CLOSED</text><text x="${x + 70}" y="${y + 610}" font-size="20" letter-spacing="3" fill="#8b92a1">OPENING</text>`; }
  s += `<text x="${x + 70}" y="${y + 92}" font-size="26" font-weight="600" fill="${PEARL}"><tspan fill="${WAX}">${c.n}</tspan>  ${c.name}</text>`;
  s += `<text x="${x + 70}" y="${y + PH - 62}" font-size="21" fill="#9aa0ad">${c.note}</text>`;
  s += icon(c.ic(), x + PW - 70 - 170, y + PH - 70 - 170 - 40, 170);
  return s;
}
const wrap = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Inter, Helvetica, Arial, sans-serif">${inner}</svg>`;
C.forEach((c, i) => {
  fs.writeFileSync(path.join(OUT, `concept-${c.n}.svg`), wrap(PW, PH, panel(c, 0, 0)));
  // clean, standalone files: wordmark (transparent, pearl letters) and icon
  const d = c.main(PEARL, INK)[0]; const pad = 60;
  fs.writeFileSync(path.join(OUT, `concept-${c.n}-wordmark-on-ink.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(d.box.x - pad)} ${r2(d.box.y - pad)} ${r2(d.box.w + 2 * pad)} ${r2(d.box.h + 2 * pad)}"><rect x="${r2(d.box.x - pad)}" y="${r2(d.box.y - pad)}" width="100%" height="100%" fill="${INK}"/>${d.svg.replace(/"BG"/g, `"${INK}"`)}</svg>`);
  fs.writeFileSync(path.join(OUT, `concept-${c.n}-icon.svg`), wrap(512, 512, icon(c.ic(), 0, 0, 512)));
});
const G = 28, HEAD = 150, SW = PW * 2 + G * 3, SH = HEAD + (PH + G) * 3 + 70;
let sheet = `<rect width="${SW}" height="${SH}" fill="#0b0c10"/><text x="${G + 20}" y="78" font-size="44" font-weight="600" fill="${PEARL}">tabella: six wordmark concepts</text><text x="${G + 20}" y="118" font-size="22" fill="#9aa0ad">Typeface: League Spartan ExtraBold (SIL Open Font License 1.1, free for commercial use), converted to outlines and then cut. One ink, one pearl, one wax-red accent. None applied yet.</text>`;
C.forEach((c, i) => { sheet += panel(c, G + (i % 2) * (PW + G), HEAD + Math.floor(i / 2) * (PH + G)); });
sheet += `<text x="${G + 20}" y="${SH - 30}" font-size="18" fill="#6c717c">League Spartan: Copyright 2020 The League Spartan Project Authors (github.com/theleagueof/league-spartan). Outlines modified; the name is not used for the modified letters.</text>`;
fs.writeFileSync(path.join(OUT, "comparison-sheet.svg"), wrap(SW, SH, sheet));
console.log("ok", SW, SH, "xh", XH);
