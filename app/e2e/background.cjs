/**
 * Checks the smoke-and-dust background layer's rules, and (RECORD=<dir>) records the day screen and the sealing moment.
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

  // --- reduced motion: the layer is placed once and nothing moves
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ anims: document.getAnimations().filter((a) => a.effect?.target?.closest?.(".bg")).length, wisps: document.querySelectorAll(".wisp").length, t: document.querySelector(".bg-depth").style.transform }));
    ok(st.anims === 0 && st.wisps === 3, `reduced motion: ${st.wisps} still wisps, ${st.anims} animations`);
    await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
    ok((await page.locator(".bg-depth").first().evaluate((e) => e.style.transform)) === st.t, "reduced motion: no shift on scroll");
    await ctx.close();
  }

  const ctx = await browser.newContext({ ...devices["iPhone 13"], ...(RECORD ? { recordVideo: { dir: RECORD, size: { width: 390, height: 664 } } } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  // --- rules
  const sample = () => page.evaluate(() => {
    const all = [...document.querySelectorAll(".bg, .bg *")];
    const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.(".bg"));
    const props = new Set(); anims.forEach((a) => a.effect.getKeyframes().forEach((k) => Object.keys(k).forEach((p) => props.add(p))));
    return {
      filters: all.filter((e) => { const s = getComputedStyle(e); return s.filter !== "none" || (s.backdropFilter && s.backdropFilter !== "none"); }).length,
      wisps: document.querySelectorAll(".wisp").length, motes: document.querySelectorAll(".mote").length,
      wispMax: Math.max(0, ...[...document.querySelectorAll(".wisp")].map((e) => +getComputedStyle(e).opacity)),
      props: [...props].filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p)),
      imgs: [...document.querySelectorAll(".bg img")].every((i) => i.complete && i.naturalWidth > 0),
    };
  });
  let wispMax = 0, wispCount = 0, last;
  for (let i = 0; i < (RECORD ? 44 : 30); i++) { last = await sample(); wispMax = Math.max(wispMax, last.wispMax); wispCount = Math.max(wispCount, last.wisps); await page.waitForTimeout(RECORD ? 300 : 200); }
  ok(last.filters === 0, "no live blur or other filters in the layer (pre-rendered sprites only)");
  ok(last.imgs, "the smoke sprites loaded");
  ok(last.props.every((p) => p === "transform" || p === "opacity"), `only transform and opacity are animated (${last.props.join(", ")})`);
  ok(wispCount >= 2 && wispCount <= 5, `a few wisps at a time (up to ${wispCount} seen)`);
  ok(last.motes >= 8 && last.motes <= 14, `a handful of dust motes (${last.motes})`);
  ok(wispMax > 0.02 && wispMax <= 0.1, `smoke never exceeds 10% (peak seen ${(wispMax * 100).toFixed(1)}%)`);
  const vp = await page.evaluate(() => [innerWidth, visualViewport.scale, document.documentElement.scrollWidth]);
  ok(vp[0] === 390 && vp[1] === 1 && vp[2] === 390, `the layer does not widen or zoom the page (${vp.join(", ")})`);
  // depth: shifts with scroll, the near layer more than the far one
  await page.getByLabel("Your letter").fill("Dear Mia,\n\nThe spare door code is under the blue pot by the back gate.\n\nI wrote this on a quiet Sunday so you would have it.\n\nLove, Alex");
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(RECORD ? 350 : 60); }
  await page.waitForTimeout(200);
  const sh = await page.evaluate(() => [...document.querySelectorAll(".bg-depth")].map((e) => +(/, (-?[\d.]+)px, 0/.exec(e.style.transform) || [0, 0])[1]));
  ok(sh[0] < 0 && sh[1] < sh[0], `depth: both layers shift with scroll, the near one more (${sh.join(" px, ")} px)`);
  // paused when the tab is hidden
  const paused = await page.evaluate(async () => {
    const mine = () => document.getAnimations().filter((a) => a.effect?.target?.closest?.(".bg"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const n = mine().length, p = mine().filter((a) => a.playState === "paused").length;
    await new Promise((r) => setTimeout(r, 400));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    return [n, p, mine().filter((a) => a.playState === "running").length];
  });
  ok(paused[0] > 0 && paused[0] === paused[1] && paused[2] >= paused[0] - 1, `paused while the tab is hidden (${paused[1]} of ${paused[0]}), running again after (${paused[2]})`);
  // frame rate while the layer runs
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(n / 2); }; requestAnimationFrame(f); }));
  console.log(`   frames per second here (headless, not a real phone): ${fps.toFixed(0)}`);
  if (RECORD) await page.waitForTimeout(2500);

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
  ok(await page.locator(".root.night").count() === 1, "night: the sealed screen");
  let puffs = 0;
  for (let i = 0; i < 24; i++) { puffs = Math.max(puffs, await page.evaluate(() => [...document.querySelectorAll(".wisp")].filter((w) => parseFloat(w.style.width) <= 130).length)); await page.waitForTimeout(250); }
  ok(puffs >= 2, `a gentle puff of smoke rises from behind the seal when it settles (${puffs} small wisps)`);
  const nightSprite = await page.evaluate(() => { const w = document.querySelector(".wisp"); return w ? [+getComputedStyle(w.querySelector(".d")).opacity, +getComputedStyle(w.querySelector(".n")).opacity] : null; });
  ok(nightSprite && nightSprite[1] > nightSprite[0], "night: the smoke is the silver version");
  if (RECORD) await page.waitForTimeout(7000);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tabella.letters.v1") || "[]"));
  console.log("letter id:", saved.at(-1)?.letterId, "| tx:", saved.at(-1)?.txHash);
  ok(errors.length === 0, "no page errors");
  await ctx.close();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
