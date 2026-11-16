/**
 * Makes the pre-blurred handwriting images for the background (so the app never runs a live blur filter).
 *   NODE_PATH=$(npm root -g) node scripts/make-background-assets.cjs
 * Each image is one line of illegible "handwriting": loops and humps drawn by a seeded random pen, in ink colour,
 * blurred once here and saved as a transparent PNG. far = very soft, near = soft, write = lightly soft.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const OUT = path.join(__dirname, "..", "src", "assets", "bg");
const INK = "#15171c";
const W = 900, H = 110, BASE = 68;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** One line of joined-up scribble: words of small humps, with the odd tall or hanging stroke. */
function line(seed, width) {
  const r = rng(seed); let x = 14, d = "";
  while (x < width - 70) {
    const letters = 2 + Math.floor(r() * 7);
    d += `M${x.toFixed(1)} ${BASE}`;
    for (let i = 0; i < letters; i++) {
      const w = 9 + r() * 9, k = r();
      const up = k > 0.82 ? 44 + r() * 10 : 13 + r() * 9;       // ascender now and then
      const down = k < 0.12 ? 22 + r() * 8 : 0;                 // descender now and then
      const slant = 5 + r() * 3;
      if (down) d += ` c${(w * 0.3).toFixed(1)} ${-up * 0.9} ${(w * 0.6 + slant).toFixed(1)} ${-up} ${(w * 0.5).toFixed(1)} ${(-up * 0.2).toFixed(1)} c${-w * 0.2} ${down} ${-w * 0.9} ${down * 1.2} ${(w * 0.5).toFixed(1)} ${(up * 0.2).toFixed(1)}`;
      else if (k > 0.82) d += ` c${(w * 0.5 + slant).toFixed(1)} ${(-up * 0.5).toFixed(1)} ${(w * 0.6 + slant).toFixed(1)} ${-up} ${(w * 0.25 + slant).toFixed(1)} ${-up} c${-w * 0.5} 0 ${-w * 0.3} ${up * 0.9} ${(w * 0.75 - slant).toFixed(1)} ${up}`;
      else d += ` c${(w * 0.2 + slant).toFixed(1)} ${-up} ${(w * 0.7 + slant).toFixed(1)} ${-up} ${(w * 0.55).toFixed(1)} ${(-up * 0.25).toFixed(1)} c${-w * 0.15} ${up * 0.35} ${w * 0.2} ${up * 0.3} ${(w * 0.45).toFixed(1)} ${(up * 0.25).toFixed(1)}`;
      x += w;
    }
    x += 16 + r() * 16; // the gap between words
  }
  return d;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const make = async (name, seed, blur, stroke, width = W) => {
    await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="b" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><path d="${line(seed, width)}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" filter="url(#b)"/></svg></body>`);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
  };
  for (let i = 0; i < 4; i++) await make(`far-${i}`, 100 + i * 7, 4.2, 3.4, 620 + i * 80);
  for (let i = 0; i < 4; i++) await make(`near-${i}`, 300 + i * 11, 2.3, 2.8, 700 + i * 60);
  for (let i = 0; i < 2; i++) await make(`write-${i}`, 500 + i * 13, 1.2, 2.2, 640 + i * 120);
  await browser.close();
  console.log("background assets written to", OUT);
})();
