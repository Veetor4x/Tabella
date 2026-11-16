/**
 * Checks the background layer's rules, and (RECORD=<dir>) records day and night at phone width.
 *   node e2e/background.cjs [baseUrl]
 * Seals one REAL demo letter to reach the night state.
 */
const { chromium, devices } = require("playwright");
const BASE = process.argv[2] || "http://localhost:5173/";
const MIA = "0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3";
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch();
  const RECORD = process.env.RECORD;

  // --- reduced motion: nothing in the layer animates
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const running = await page.evaluate(() => [...document.querySelectorAll(".bg *")].filter((e) => getComputedStyle(e).animationName !== "none").length);
    ok(running === 0, `reduced motion: the layer is still (${running} animated elements)`);
    const y0 = await page.locator(".bg-shift").first().evaluate((e) => e.style.transform);
    await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
    ok((await page.locator(".bg-shift").first().evaluate((e) => e.style.transform)) === y0, "reduced motion: no shift on scroll");
    await ctx.close();
  }

  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...(RECORD ? { recordVideo: { dir: RECORD, size: { width: 390, height: 664 } } } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  // --- rules
  const info = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".bg, .bg *")];
    const op = (sel) => +getComputedStyle(document.querySelector(sel)).opacity;
    return {
      filters: all.filter((e) => { const s = getComputedStyle(e); return s.filter !== "none" || (s.backdropFilter && s.backdropFilter !== "none"); }).length,
      svgFilters: document.querySelectorAll(".bg filter").length,
      far: op(".d-far"), mid: op(".d-mid"), near: op(".d-near"),
      imgs: [...document.querySelectorAll(".bg img")].every((i) => i.complete && i.naturalWidth > 0),
      animated: [...new Set(all.flatMap((e) => getComputedStyle(e).animationName.split(", ")))].filter((n) => n !== "none"),
      z: getComputedStyle(document.querySelector(".bg")).zIndex,
    };
  });
  ok(info.filters === 0 && info.svgFilters === 0, "no live blur or other filters anywhere in the layer (pre-blurred images only)");
  const vp = await page.evaluate(() => [innerWidth, visualViewport.scale, document.documentElement.scrollWidth]);
  ok(vp[0] === 390 && vp[1] === 1 && vp[2] === 390, `the layer does not widen or zoom the page (${vp.join(", ")})`);
  ok(info.imgs, "the pre-blurred handwriting images loaded");
  ok([info.far, info.mid, info.near].every((o) => o >= 0.04 && o <= 0.08), `handwriting opacity is within 4-8% (${info.far}, ${info.mid}, ${info.near})`);
  console.log("   animations in the layer:", info.animated.join(", "));
  // sample the wax glow and the writing line over time
  let glowMax = 0, writeMax = 0;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => ({ g: +getComputedStyle(document.querySelector(".glow")).opacity * +getComputedStyle(document.querySelector(".glow-wrap")).opacity, w: Math.max(...[...document.querySelectorAll(".write")].map((e) => +getComputedStyle(e).opacity)) }));
    glowMax = Math.max(glowMax, s.g); writeMax = Math.max(writeMax, s.w);
    await page.waitForTimeout(RECORD ? 300 : 120);
  }
  ok(glowMax > 0 && glowMax < 0.06, `wax glow stays under 6% (peak seen ${(glowMax * 100).toFixed(1)}%)`);
  ok(writeMax <= 0.08, `the self-writing line stays within 8% (peak seen ${(writeMax * 100).toFixed(1)}%)`);
  // shifts with scroll
  await page.getByLabel("Your letter").fill("Dear Mia,\n\nThe spare door code is under the blue pot by the back gate.\n\nI wrote this on a quiet Sunday so you would have it.\n\nLove, Alex");
  const t0 = await page.locator(".bg-shift").nth(1).evaluate((e) => e.style.transform);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(RECORD ? 350 : 60); }
  await page.waitForTimeout(200);
  const t1 = await page.locator(".bg-shift").nth(1).evaluate((e) => e.style.transform);
  ok(t0 !== t1 && /translate3d/.test(t1), `the layer shifts slightly with scroll (${t1})`);
  // paused when the tab is hidden
  const paused = await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const r = getComputedStyle(document.querySelector(".d-near")).animationPlayState;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    return [r, getComputedStyle(document.querySelector(".d-near")).animationPlayState];
  });
  ok(paused[0] === "paused" && paused[1] === "running", `paused while the tab is hidden, running again after (${paused.join(" -> ")})`);
  if (RECORD) await page.waitForTimeout(5000);

  // --- on to night (a real sealing)
  const next = () => page.getByRole("button", { name: /^Continue/ }).click();
  await next();
  await page.getByLabel("Their name").fill("Mia");
  await page.getByLabel("Their address").fill(MIA);
  await page.locator(".badge.ready").waitFor({ timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Continue/.test(b.textContent.trim()) && !b.disabled));
  await next();
  await page.getByRole("heading", { name: /Is there someone/ }).waitFor(); await page.waitForTimeout(700);
  await next();
  await page.getByRole("heading", { name: /If you go quiet/ }).waitFor(); await page.waitForTimeout(700);
  await next();
  await page.getByRole("heading", { name: "Ready to seal it?" }).waitFor(); await page.waitForTimeout(RECORD ? 3000 : 800);
  await page.getByRole("button", { name: "Seal it" }).click();
  await page.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 180000 });
  let warmSeen = false, nightGlowMax = 0;
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => ({ warm: document.querySelector(".bg").classList.contains("warm"), g: +getComputedStyle(document.querySelector(".glow")).opacity * +getComputedStyle(document.querySelector(".glow-wrap")).opacity }));
    warmSeen = warmSeen || s.warm; nightGlowMax = Math.max(nightGlowMax, s.g);
    await page.waitForTimeout(250);
  }
  ok(warmSeen, "the wax glow warms when the seal settles");
  ok(nightGlowMax < 0.06, `...and still stays under 6% (peak seen ${(nightGlowMax * 100).toFixed(1)}%)`);
  const night = await page.evaluate(() => ({ hand: +getComputedStyle(document.querySelector(".hand")).opacity, lat: +getComputedStyle(document.querySelector(".lattice")).opacity, pts: document.querySelectorAll(".lattice circle").length, links: document.querySelectorAll(".lattice line").length }));
  ok(night.hand < 0.05 && night.lat > 0.95, `night: the handwriting has dissolved and the lattice is in (${night.pts} points, ${night.links} links)`);
  if (RECORD) { await page.waitForTimeout(9000); for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 70); await page.waitForTimeout(450); } await page.waitForTimeout(3000); }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tabella.letters.v1") || "[]"));
  console.log("letter id:", saved.at(-1)?.letterId, "| tx:", saved.at(-1)?.txHash);
  ok(errors.length === 0, "no page errors");
  await ctx.close();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
