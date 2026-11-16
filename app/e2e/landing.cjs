/**
 * Checks the front page at iPhone width, and (RECORD=<dir>) records it scrolled from top to bottom.
 *   cd app && npm run build && npx vite preview --port 5173 &
 *   node e2e/landing.cjs [baseUrl] [outDir]
 * It never seals anything: the front page makes no calls to the helper.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-5");
fs.mkdirSync(OUT, { recursive: true });
const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|post-quantum|ciphertext|cipher|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|ethereum|solidity|tx)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch();
  const RECORD = process.env.RECORD;

  // ---- reduced motion first: the calm version
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelector("#how").scrollIntoView()); await page.waitForTimeout(2500);
    const c1 = await page.locator(".demo-caption").innerText();
    await page.waitForTimeout(2500);
    ok((await page.locator(".demo-caption").innerText()) === c1, "reduced motion: the demo does not play by itself");
    await page.getByRole("button", { name: "Time passes" }).click(); await page.waitForTimeout(800);
    ok(/Years pass/.test(await page.locator(".demo-caption").innerText()), "reduced motion: tapping a step still shows it");
    const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName || a.constructor.name + ":" + (a.effect?.target?.className || "")));
    console.log(`   running animations in the calm version: ${anims.length} ${anims.join(", ")}`);
    await page.screenshot({ path: path.join(OUT, "calm-demo.png") });
    await ctx.close();
  }

  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...(RECORD ? { recordVideo: { dir: RECORD, size: { width: 390, height: 664 } } } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  ok((await page.viewportSize()).width === 390, "viewport is iPhone width (390 px)");

  // ---- hero
  await page.getByRole("heading", { level: 1, name: "Sealed today. Opened when it matters." }).waitFor();
  await page.waitForTimeout(RECORD ? 3200 : 1800);
  ok((await page.getByRole("heading", { level: 1 }).count()) === 1, "one h1");
  ok(await page.getByRole("link", { name: /Start here/ }).first().isVisible(), "hero: Start here is there");
  ok(await page.getByRole("link", { name: "See how it works" }).isVisible(), "hero: See how it works is there");
  await page.screenshot({ path: path.join(OUT, "01-hero.png") });
  // the letter loop: write -> fold -> seal
  const phases = new Set();
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => ({ paper: +getComputedStyle(document.querySelector(".paper")).opacity, seal: +getComputedStyle(document.querySelector(".env-seal")).opacity }));
    phases.add(s.paper > 0.9 ? "letter" : s.paper < 0.1 && s.seal > 0.9 ? "sealed" : "between");
    if (phases.has("letter") && phases.has("sealed")) break;
    await page.waitForTimeout(RECORD ? 350 : 300);
  }
  ok(phases.has("letter") && phases.has("sealed"), `hero: the letter card floats, folds and is sealed (${[...phases].join(", ")})`);
  await page.screenshot({ path: path.join(OUT, "02-hero-sealed.png") });
  const flat = async (label) => {
    const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, visualViewport.scale]);
    ok(wide[0] <= wide[1] + 1 && wide[2] === 1, `${label}: no sideways scrolling or zoom (${wide.join(", ")})`);
  };
  await flat("hero");

  // ---- scroll through: why, demo, start, trust, footer
  const scrollTo = async (sel, pause = 1800) => { await page.evaluate(([s, b]) => document.querySelector(s).scrollIntoView({ behavior: b }), [sel, RECORD ? "smooth" : "instant"]); await page.waitForTimeout(RECORD ? pause + 900 : pause); };
  await scrollTo("#why", 2600);
  const op = () => page.evaluate(() => [...document.querySelectorAll(".why-card")].map((c) => +getComputedStyle(c).opacity));
  const first = await op();
  ok(first[0] > 0.9 && first[2] < 0.5, `why: cards reveal as they scroll into view (${first.map((o) => o.toFixed(1)).join(", ")} before scrolling)`);
  ok(/Words that never get said\./.test(await page.locator("#why").innerText()) && /Things locked away when no one knows where they are\./.test(await page.locator("#why").innerText()) && /even against future super-computers/i.test(await page.locator("#why").innerText()), "why: the three lines");
  await page.screenshot({ path: path.join(OUT, "03-why.png") });
  await page.evaluate(() => window.scrollBy(0, 330)); await page.waitForTimeout(1600);
  await page.evaluate(() => window.scrollBy(0, 330)); await page.waitForTimeout(1600);
  ok((await op()).every((o) => o > 0.9), "why: all three cards revealed after scrolling");
  await page.screenshot({ path: path.join(OUT, "04-why-2.png") });
  await flat("why");

  await scrollTo("#how", 1500);
  const cap = () => page.locator(".demo-caption").innerText();
  const seen = new Set();
  const t0 = Date.now();
  while (seen.size < 3 && Date.now() - t0 < 30000) { seen.add(await cap()); await page.waitForTimeout(500); }
  ok(seen.size >= 3, `how: the demo plays by itself (${seen.size} captions seen)`);
  // tap through every step; shoot each
  const names = ["Write", "People", "Guardian", "Timing", "Seal", "I'm still here", "Time passes", "Mia opens it"];
  const waits = [4800, 7000, 4200, 4200, 5200, 3800, 5200, 7500];
  for (let i = 0; i < names.length; i++) {
    await page.locator(".demo-step").nth(i).click();
    await page.evaluate(() => document.querySelector(".demo-ctrl").scrollIntoView({ block: "start" }));
    await page.waitForTimeout(waits[i]);
    ok(/\d/.test(await cap()) && (await page.locator(".demo-step.on").innerText()).includes(names[i]), `how: step ${i + 1} (${names[i]}) plays`);
    await page.screenshot({ path: path.join(OUT, `05-demo-${i + 1}-${names[i].toLowerCase().replace(/[^a-z]+/g, "-")}.png`) });
    if (i === 4) {
      await page.locator(".demo-step").nth(4).click(); await page.waitForTimeout(9300);
      ok(await page.locator(".phone-screen.night").count() === 1, "how: the seal step ends in night mode");
      await page.screenshot({ path: path.join(OUT, "05-demo-5b-sealed-night.png") });
    }
    if (i === 7) { await page.locator(".demo-step").nth(7).click(); await page.waitForTimeout(3600); await page.screenshot({ path: path.join(OUT, "05-demo-8b-cracked.png") }); }
  }
  // play / pause
  await page.getByRole("button", { name: "Pause the demo" }).click(); await page.waitForTimeout(300);
  const c0 = await cap(); await page.waitForTimeout(RECORD ? 1500 : 2500);
  ok((await cap()) === c0, "how: pause holds the demo still");
  await page.getByRole("button", { name: "Play the demo" }).click();
  ok(await page.getByRole("button", { name: "Pause the demo" }).count() === 1, "how: play starts it again");
  await flat("how");
  // scrolled away, it stops
  await page.evaluate(() => document.querySelector("#trust").scrollIntoView({ behavior: "instant" })); await page.waitForTimeout(800);
  const away = await page.locator(".demo-caption").innerText(); await page.waitForTimeout(2500);
  ok((await page.locator(".demo-caption").innerText()) === away, "how: the demo rests while it is off screen");

  await scrollTo("#start", 1600);
  const start = page.locator("#start a.btn");
  ok((await start.getAttribute("href")) === "/write", "start: the big Start here button goes to /write");
  await page.screenshot({ path: path.join(OUT, "06-start.png") });

  await scrollTo("#trust", 2200);
  const tt = await page.locator("#trust").innerText();
  for (const line of ["Sealed on your device.", "Two halves.", "The Postman can't read it.", "You stay in control.", "Built for the future.", "Honest limits"]) ok(tt.includes(line), `trust: "${line}"`);
  for (const l of ["test-network version", "loses their card, that copy can't be recovered", "never passwords or recovery phrases", "awaiting outside review"]) ok(tt.includes(l), `trust: limit "${l}"`);
  await page.screenshot({ path: path.join(OUT, "07-trust.png") });
  await page.evaluate(() => window.scrollBy(0, 560)); await page.waitForTimeout(RECORD ? 2000 : 1500);
  await page.screenshot({ path: path.join(OUT, "08-trust-2.png") });
  // For the curious: closed, then open
  const det = page.locator("details.curious");
  ok(!(await det.evaluate((d) => d.open)), "curious: closed at first");
  await det.scrollIntoViewIfNeeded();
  const outside = await page.evaluate(() => { const d = document.querySelector("details.curious"); const c = d.cloneNode(true); d.replaceWith(); const t = document.body.innerText; document.body.insertBefore(c, null); return t; });
  const hit = FORBIDDEN.exec(outside.replace(/spare house key/gi, ""));
  ok(!hit, `no technical words anywhere outside the For the curious box${hit ? ` (found "${hit[0]}")` : ""}`);
  ok(!EMOJI.test(await page.evaluate(() => document.body.innerText)), "no emoji on the page");
  await page.locator("details.curious summary").click(); await page.waitForTimeout(700);
  const open = await page.locator("details.curious").innerText();
  ok(["ML-KEM-1024", "ML-DSA-87", "On-chain checks", "two-key split"].every((x) => open.includes(x)), "curious: opens to show the technical terms");
  await page.screenshot({ path: path.join(OUT, "09-curious-open.png") });
  await flat("trust");

  await page.evaluate((b) => window.scrollTo({ top: document.body.scrollHeight, behavior: b }), RECORD ? "smooth" : "instant"); await page.waitForTimeout(RECORD ? 2600 : 1000);
  const links = await page.evaluate(() => [...document.querySelectorAll(".land-footer a")].map((a) => [a.textContent.trim(), a.href]));
  ok(links.some(([t, h]) => t === "GitHub" && /github\.com\/Veetor4x\/Tabella/.test(h)) && links.some(([t]) => /Apache-2\.0/.test(t)), `footer: GitHub and Apache-2.0 links (${links.map((l) => l[0]).join(", ")})`);
  ok(/Build Before Q-Day/.test(await page.locator(".land-footer").innerText()), "footer: QoreChain, Build Before Q-Day");
  await page.screenshot({ path: path.join(OUT, "10-footer.png") });

  // frame rate while the page animates
  await page.evaluate(() => document.querySelector("#how").scrollIntoView({ behavior: "instant" })); await page.waitForTimeout(500);
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(n / 2); }; requestAnimationFrame(f); }));
  console.log(`   frames per second with the demo running (headless, not a real phone): ${fps.toFixed(0)}`);

  // the two routes
  const w = await ctx.newPage();
  await w.goto(new URL("write", BASE).href, { waitUntil: "networkidle" });
  ok(await w.getByRole("heading", { name: "What do you want them to read one day?" }).count() === 1, "/write opens the owner's flow");
  ok((await w.getByRole("link", { name: /Tabella, home/ }).getAttribute("href")) === "/", "/write: the Tabella name links home");
  ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close(); await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
