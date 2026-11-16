/**
 * Draws the smoke sprites once, already soft, so the app never runs a live blur filter.
 *   NODE_PATH=$(npm root -g) node scripts/make-smoke-sprites.cjs
 * Each sprite is one thin wisp: a few strands that rise, sway wider as they go and curl over at the top,
 * built from many faint soft dots. Warm grey for day, silver for night. Transparent PNGs.
 */
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path");
const OUT = path.join(__dirname, "..", "src", "assets", "smoke");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const make = (seed, rgb) => page.evaluate(([seed, rgb]) => {
    const W = 320, H = 640;
    let s = seed >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const raw = document.createElement("canvas"); raw.width = W; raw.height = H; const c = raw.getContext("2d");
    const strands = 2 + Math.floor(r() * 2);
    for (let k = 0; k < strands; k++) {
      const phase = r() * 6.28, freq = 1.1 + r() * 0.9, lean = (r() - 0.5) * 60, curlDir = r() > 0.5 ? 1 : -1, curlAt = 0.62 + r() * 0.14, top = 0.82 + r() * 0.14;
      for (let i = 0; i < 520; i++) {
        const t = i / 520;
        let x = W / 2 + Math.sin(t * freq * 6.28 + phase) * (4 + t * 46) + lean * t * t;
        let y = H - 26 - t * H * top;
        if (t > curlAt) { const u = (t - curlAt) / (1 - curlAt), a = u * 4.4; x += curlDir * (1 - Math.cos(a)) * 30 * u; y += Math.sin(a) * 26 * u; }
        const rad = 5 + t * 30 + r() * 4;
        const alpha = 0.11 * Math.min(1, t / 0.07) * Math.pow(1 - t, 0.9) * (0.6 + r() * 0.5);
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 6.3); c.fill();
      }
    }
    const out = document.createElement("canvas"); out.width = W; out.height = H; const o = out.getContext("2d");
    o.filter = "blur(5px)"; o.drawImage(raw, 0, 0); // blurred here, once, at build time
    return out.toDataURL("image/png");
  }, [seed, rgb]);
  for (let i = 0; i < 4; i++) {
    for (const [name, rgb] of [["d", "112,103,94"], ["n", "214,221,236"]]) {
      const url = await make(40 + i * 17, rgb);
      fs.writeFileSync(path.join(OUT, `${name}-${i}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
  }
  await browser.close();
  console.log("smoke sprites written to", OUT);
})();
