// Builds the logo comparison sheet from docs/logo/*.svg (run tools/logo-concepts.py first). Nothing is applied to the app.
//   NODE_PATH=$(npm root -g) node tools/logo-sheet.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const D = __dirname + "/../docs/logo/";
const read = (n) => fs.readFileSync(D + n + ".svg", "utf8");
const sized = (n, h) => read(n).replace("<svg ", `<svg style="height:${h}px;width:auto;display:block" `);

const C = [
  { id: "a-seam-upper", key: "a", title: "A · The Seam", icon: "a-seam", sub: "Uppercase", why: "A tablet is sealed along one line. One horizontal slice runs through every letter, and the two halves slip a little out of line, like a sealed tablet that has been cut and shifted. The wax seal sits in the seam, exactly where it would close it. One cut, one idea: sealed, and opened only by someone who holds the other half." },
  { id: "b-stencil", key: "b", title: "B · Stencil", icon: "b-stencil", sub: "Uppercase", why: "Letters held together by bridges, like a template: the cracks are where each letter could come apart. Cuts through the T, A, B, E and L. In the B, the wax runs into one crack and fills it: sealed, not broken. The red piece is the only one that closes a gap." },
  { id: "c-block", key: "c", title: "C · Stacked Block", icon: "c-block", sub: "TAB / ELLA", why: "TAB over ELLA, tight, so the name is a solid block like a stack of tablets. Two cuts run straight through both rows so they read as one object; the right side steps down at the second cut to link the rows, and a small red square closes the first cut where it ends." },
];

(async () => {
  const b = await chromium.launch();
  // pass 1: real pixels at 32px and 16px tall, at 1x, so they can be shown enlarged without smoothing
  const px = await b.newPage({ viewport: { width: 900, height: 300 }, deviceScaleFactor: 1 });
  const strips = {};
  const specs = [];
  for (const c of [...C, { id: "a-seam-lower" }]) for (const h of [32, 16]) for (const bg of ["pearl", "night"]) specs.push({ id: c.id, h, bg });
  for (const c of C) for (const h of [32, 16]) specs.push({ id: "icon-" + c.icon, h, bg: "icon" });
  for (const s of specs) {
    const name = s.id.startsWith("icon-") ? s.id : "concept-" + s.id + "-" + s.bg;
    await px.setContent(`<body style="margin:0;background:transparent"><div id=t style="display:inline-block">${sized(name, s.h)}</div></body>`);
    const el = await px.$("#t");
    const file = `/tmp/claude-0/logo-${s.id}-${s.bg}-${s.h}.png`;
    await el.screenshot({ path: file, omitBackground: true });
    strips[`${s.id}|${s.bg}|${s.h}`] = file;
  }
  const img = (k, z) => `<img src="data:image/png;base64,${fs.readFileSync(strips[k]).toString("base64")}" style="image-rendering:pixelated;height:${(k.endsWith("|32") ? 32 : 16) * z}px">`;

  const block = (c) => `
  <section class="blk">
    <div class="txt"><h2>${c.title}</h2><p class="why">${c.why}</p></div>
    <div class="marks">
      <div class="m pearl">${sized("concept-" + c.id + "-pearl", c.key === "c" ? 300 : 120)}</div>
      <div class="m night">${sized("concept-" + c.id + "-night", c.key === "c" ? 300 : 120)}</div>
    </div>
    <div class="side">
      <div class="ico"><div class="lbl">App icon</div>${sized("icon-" + c.icon, 150)}</div>
      <div class="small">
        <div class="lbl">At 32px and 16px (real pixels, then enlarged 3×)</div>
        <div class="row">
          <div class="sw pearl">${img(`${c.id}|pearl|32`, 1)}</div><div class="sw night">${img(`${c.id}|night|32`, 1)}</div>
          <div class="sw pearl z">${img(`${c.id}|pearl|32`, 3)}</div>
        </div>
        <div class="row">
          <div class="sw pearl">${img(`${c.id}|pearl|16`, 1)}</div><div class="sw night">${img(`${c.id}|night|16`, 1)}</div>
          <div class="sw pearl z">${img(`${c.id}|pearl|16`, 3)}</div>
        </div>
        <div class="row ic"><div class="sw">${img(`icon-${c.icon}|icon|32`, 1)}</div><div class="sw">${img(`icon-${c.icon}|icon|16`, 1)}</div><div class="sw z">${img(`icon-${c.icon}|icon|32`, 3)}</div></div>
      </div>
    </div>
  </section>`;

  const lower = `
  <section class="blk lower">
    <div class="txt"><h2>A · The Seam, lowercase</h2><p class="why">The same cut across the middle of the x-height. It is friendlier, and the wax seal still sits in the seam. But the round bowls of the a, e and the b break the slice into curves, so the cut reads less clearly.</p></div>
    <div class="marks"><div class="m pearl">${sized("concept-a-seam-lower-pearl", 120)}</div><div class="m night">${sized("concept-a-seam-lower-night", 120)}</div></div>
    <div class="side"><div class="small"><div class="lbl">At 32px and 16px (real pixels, then enlarged 3×)</div>
      <div class="row"><div class="sw pearl">${img("a-seam-lower|pearl|32", 1)}</div><div class="sw night">${img("a-seam-lower|night|32", 1)}</div><div class="sw pearl z">${img("a-seam-lower|pearl|32", 3)}</div></div>
      <div class="row"><div class="sw pearl">${img("a-seam-lower|pearl|16", 1)}</div><div class="sw night">${img("a-seam-lower|night|16", 1)}</div><div class="sw pearl z">${img("a-seam-lower|pearl|16", 3)}</div></div></div></div>
  </section>`;
  const lowerHtml = lower;

  const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#e9e7e2;color:#15171c;font:15px/1.5 Inter,system-ui,sans-serif;padding:36px 40px;width:1520px}
  h1{font:400 40px/1.1 'Instrument Serif',Georgia,serif;margin:0 0 6px} .lede{max-width:1100px;color:#50555f;margin:0 0 26px}
  .rules{background:#f4f3ef;border:1px solid #d6d3cc;border-radius:14px;padding:14px 18px;margin:0 0 26px;color:#33363d;font-size:14px}
  .blk{display:grid;grid-template-columns:290px 1fr 560px;gap:26px;align-items:start;background:#f4f3ef;border:1px solid #d6d3cc;border-radius:18px;padding:22px;margin:0 0 20px}
  h2{font:400 28px/1.1 'Instrument Serif',Georgia,serif;margin:0 0 8px} .why{margin:0;color:#33363d;font-size:14.5px}
  .marks{display:grid;gap:12px;justify-items:start} .m{padding:22px 26px;border-radius:12px;display:inline-block} .pearl{background:#f4f3ef;border:1px solid #d6d3cc} .night{background:#0c0e13}
  .side{display:grid;gap:14px} .lbl{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:#6c717c;margin:0 0 6px}
  .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 8px} .sw{padding:10px;border-radius:8px;display:flex;align-items:center;justify-content:center;min-height:36px}.sw.night{background:#0c0e13}.sw.pearl{background:#f4f3ef;border:1px solid #d6d3cc}.sw.z{background:#f4f3ef;border:1px solid #d6d3cc}
  .ic .sw{background:#fff;border:1px solid #d6d3cc}
  .foot{color:#50555f;font-size:13.5px;margin-top:8px}
  </style><body>
  <h1>Tabella logo: heavy cut-up type</h1>
  <p class="lede">Three concepts in one direction: bold, chunky, geometric letters that are dramatically sliced or stencil-cut, one flat colour, and one small wax-red detail that belongs to the cut. Comparison only: nothing has been applied to the app.</p>
  <div class="rules"><b>Font and licence.</b> Poppins Black (Poppins Project Authors), SIL Open Font License 1.1, free for commercial use, no attribution needed in a logo. The letters were converted to outlines, then the cuts are real boolean cuts (generated by <code>tools/logo-concepts.py</code>), so the cuts are the idea, not a filter. Every wordmark is shown on pearl and on night, with its app icon, and at 32px and 16px.</div>
  ${C.map(block).join("")}
  ${lowerHtml}
  <p class="foot"><b>Strongest: A, uppercase.</b> The slice is the first thing you see, it reads TABELLA at 32px and still at 16px, and the seal sits inside the cut rather than being a dot beside it. <b>Honest limits:</b> at 16px the red detail shrinks to a pixel or two in every concept, so the app icon (not the wordmark) carries the red at small sizes; the stencil (B) is the most characterful, but its bridges turn into noise at 16px and it reads as plain bold type; the block (C) has the most distinctive shape, but it stacks into a tall lockup that is harder to use in a header and reads poorly at 16px. Lowercase is friendlier but the round bowls break the slice.</p>
  </body>`;
  const page = await b.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: D + "tabella-logo-concepts.png", fullPage: true });
  await b.close();
  console.log("sheet written");
})();
