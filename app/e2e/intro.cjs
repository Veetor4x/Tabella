/**
 * The first-visit intro, at iPhone width: the question, Skip, Yes, the opener, the narrated demo, mute/pause/skip,
 * the end card, the "Watch intro" link, and the still version for reduced motion.
 *   cd app && npm run build && npx vite preview --port 5173 &
 *   node e2e/intro.cjs [baseUrl] [outDir]      RECORD=<dir> also records the full intro (silent video + play-times.json,
 *                                              which mix-intro-audio.sh turns into a recording with sound)
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-8");
fs.mkdirSync(OUT, { recursive: true });
const SCRIPT = [
  "Some things should be said one day. Tabella helps you say them.", "Write a letter for someone you love.",
  "Keep it a surprise. Add how to reach them, and a question only they can answer.", "Add someone you trust, in case they can't be reached.",
  "Choose when it should open. If you go quiet for a while.", "Seal it. Safe even from future super-computers.", "Every so often, just tap: I'm still here.",
  "And if one day you can't, Tabella finds them, and lets them know.", "They answer the question only they know, and your words reach them. Sealed today. Opened when it matters.",
];
const INVITE_FIRST = "Write a letter for the people you love.";
const VOICE_DIR = path.join(__dirname, "..", "src", "assets", "voice");
const haveVoice = (n) => fs.existsSync(path.join(VOICE_DIR, `s${String(n).padStart(2, "0")}.mp3`));
const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|ciphertext|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };
const shot = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };
const audioState = (page) => page.evaluate(() => [...document.querySelectorAll("audio")].map((a) => ({ line: a.dataset.voice, paused: a.paused, t: a.currentTime, muted: a.muted, dur: a.duration })));
const prefOf = (page) => page.evaluate(() => localStorage.getItem("tabella.intro.v1"));

(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const phone = (extra = {}) => browser.newContext({ ...devices["iPhone 13"], ...extra });
  const errors = [];
  const track = (p) => { p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); };

  // ------------------------------------------------ 1. first visit: the question, and Skip
  {
    const c = await phone(); const p = await c.newPage(); track(p);
    await p.goto(BASE, { waitUntil: "networkidle" });
    await p.getByRole("dialog").waitFor({ timeout: 8000 });
    await p.waitForTimeout(1200);
    ok(await p.getByRole("heading", { name: "Want to see what Tabella is about?" }).isVisible(), "first visit: a glass card asks 'Want to see what Tabella is about?'");
    ok(await p.getByRole("button", { name: "Yes, show me" }).isVisible() && await p.getByRole("button", { name: "Skip" }).isVisible(), "first visit: two buttons, 'Yes, show me' and 'Skip'");
    ok((await prefOf(p)) === null, "first visit: nothing is remembered until you answer");
    await shot(p, "01-prompt");
    await p.getByRole("button", { name: "Skip" }).click();
    await p.getByRole("dialog").waitFor({ state: "detached" });
    ok((await prefOf(p)) === "skip" && await p.getByRole("heading", { level: 1 }).isVisible(), "skip: straight to the front page, and the choice is remembered");
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(2500);
    ok(await p.getByRole("dialog").count() === 0, "next visit: the question does not come back");
    ok(await p.getByRole("button", { name: "Watch intro" }).isVisible(), "header: a small 'Watch intro' link to replay it");
    await shot(p, "02-front-page-with-watch-intro");
    await p.getByRole("button", { name: "Watch intro" }).click();
    await p.getByRole("dialog", { name: "Introduction to Tabella" }).waitFor();
    ok(true, "'Watch intro' replays it");
    await p.getByRole("button", { name: "Skip intro" }).click();
    await p.getByRole("dialog").waitFor({ state: "detached" });
    ok((await prefOf(p)) === "skip", "skipping the replay leaves the remembered choice alone");
    await c.close();
  }

  // ------------------------------------------------ 2. Yes: the whole intro, played through (optionally recorded)
  const RECORD = process.env.RECORD;
  const cA = await phone({ ...(RECORD ? { recordVideo: { dir: RECORD, size: { width: 390, height: 664 } } } : {}) });
  const pageMade = Date.now();
  const a = await cA.newPage(); track(a);
  await a.addInitScript(() => { window.__tabellaAudioLog = []; window.__plays = []; document.addEventListener("play", (e) => e.target.dataset && e.target.dataset.voice && window.__plays.push({ line: e.target.dataset.voice, at: Date.now() }), true); });
  await a.goto(BASE, { waitUntil: "networkidle" });
  await a.getByRole("dialog").waitFor({ timeout: 8000 });
  await a.waitForTimeout(RECORD ? 2500 : 1000);
  await a.getByRole("button", { name: "Yes, show me" }).click();
  const yesAt = Date.now();
  const overlay = a.getByRole("dialog", { name: "Introduction to Tabella" });
  await overlay.waitFor();
  const openAt = Date.now();
  ok((await prefOf(a)) === "yes", "yes: the choice is remembered");
  const op0 = await a.evaluate(() => +getComputedStyle(document.querySelector(".intro")).opacity);
  await a.waitForTimeout(600);
  const op1 = await a.evaluate(() => +getComputedStyle(document.querySelector(".intro")).opacity);
  ok(op1 > op0 || op1 > 0.5, `opener: the screen fades to ink (${op0.toFixed(2)} -> ${op1.toFixed(2)})`);
  await a.waitForTimeout(700);
  ok(await a.getByRole("heading", { name: "Some things should be said one day." }).count() === 1, "opener: 'Some things should be said one day.' appears");
  await a.screenshot({ path: path.join(OUT, "03-opener-words.png") });
  await a.waitForTimeout(1000);
  ok(await a.locator(".opener .seal-wrap").count() === 1, "opener: the wax seal settles");
  await a.screenshot({ path: path.join(OUT, "04-opener-seal.png") });
  await a.waitForTimeout(450);
  ok((await a.locator(".opener-name").innerText()) === "Tabella" && +(await a.locator(".opener-name").evaluate((e) => getComputedStyle(e).opacity)) > 0.1, "opener: 'Tabella' fades in");
  await a.screenshot({ path: path.join(OUT, "05-opener-name.png") });

  // follow the narrated demo to the end, writing down what is on screen and what is playing
  const seenCaptions = [], steps = new Set(), playedLines = new Set(), sawStories = new Set();
  let shots = 0; const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    if (await a.locator(".intro-end").count()) break;
    const cap = (await a.evaluate(() => document.querySelector(".intro-caption p")?.innerText || "")).trim();
    if (cap && !seenCaptions.includes(cap)) {
      seenCaptions.push(cap);
      if (shots < 8) await a.screenshot({ path: path.join(OUT, `06-scene-${String(++shots).padStart(2, "0")}.png`) });
    }
    steps.add(await a.evaluate(() => document.querySelector(".intro-step")?.innerText || ""));
    const story = await a.evaluate(() => { const e = document.querySelector(".cam-story"); return e && +getComputedStyle(e).opacity > 0.6 ? e.querySelector("svg.story")?.getAttribute("aria-label") : null; });
    if (story) sawStories.add(story.split(" ").slice(0, 2).join(" "));
    for (const s of await audioState(a)) if (!s.paused && s.t > 0) playedLines.add(s.line);
    await a.waitForTimeout(250);
  }
  const length = ((Date.now() - openAt) / 1000).toFixed(0);
  ok(await a.locator(".intro-end").count() === 1, `the intro plays by itself to the end (${length} s)`);
  const said = SCRIPT.slice(1).flatMap((l) => l.match(/[^.!?]+[.!?]+/g).map((x) => x.trim()));
  const missing = said.filter((l) => !seenCaptions.some((c) => c === l || c.includes(l)));
  ok(missing.length === 0, `captions: every spoken sentence was shown${missing.length ? ` (missing: ${missing.join(" | ")})` : ""} (${seenCaptions.length} captions)`);
  const labels = [...steps].filter(Boolean).map((l) => l.toLowerCase());
  ok(["Write", "Reach them", "Backup", "Timing", "Seal", "I'm still here", "Time passes", "Found"].every((l) => labels.includes(l.toLowerCase())), `the demo's own screens play in order (${labels.join(" > ")})`);
  ok(sawStories.size >= 8, `a story scene played before each screen (${[...sawStories].join(", ")})`);
  const voiced = [...playedLines].sort();
  console.log(`   voice lines heard playing: ${voiced.join(", ") || "none"}`);
  ok(voiced.length >= 1, "the recorded voiceover plays (an audio file, not the browser's voice)");
  const plays = await a.evaluate(() => window.__plays);
  const audio = await a.evaluate(() => window.__tabellaAudioLog);
  const sfxNames = new Set(audio.filter((e) => e.kind === "sfx").map((e) => e.name));
  console.log(`   sound effects played: ${audio.filter((e) => e.kind === "sfx").length} (${[...sfxNames].join(", ")})`);
  ok(["type", "rustle", "fold", "stamp", "clock", "flip", "tap", "crack", "open"].every((n) => sfxNames.has(n)), "sound effects: typing, paper, fold, wax stamp, a wall clock, calendar flips, taps, the seal cracking and the envelope opening are all cued");
  ok(!["whoosh", "pop", "tick", "chime", "glint", "tone"].some((n) => sfxNames.has(n)), "sound effects: no whoosh, no pop, no chime, no glint, no tone");
  const transitions = audio.filter((e) => e.kind === "sfx" && /^t-/.test(e.name)).map((e) => e.name);
  ok(new Set(transitions).size === transitions.length && transitions.length >= 9, `each scene has its own quiet transition, none repeated (${transitions.join(", ")})`);
  ok(audio.filter((e) => e.kind === "sfx" && e.name === "clock").length === 1, "time passing: one natural clock recording that fades, not a series of ticks");
  ok(audio.filter((e) => e.kind === "duck").length >= voiced.length && voiced.length > 0, `music ducks under the voice (${audio.filter((e) => e.kind === "duck").length} dips for ${voiced.length} lines)`);
  const hasMusicFile = fs.existsSync(path.join(__dirname, "..", "src", "assets", "music")) && fs.readdirSync(path.join(__dirname, "..", "src", "assets", "music")).some((f) => f.endsWith(".mp3"));
  ok(!hasMusicFile || audio.some((e) => e.kind === "music"), `music bed ${hasMusicFile ? "started under the film" : "(no music file yet)"}`);
  await shot(a, "07-end-card");
  ok(await overlay.getByRole("link", { name: /Start here/ }).getAttribute("href") === "/write", "end: a big 'Start here' goes to /write");
  ok(await a.getByRole("button", { name: "Back to the page" }).isVisible(), "end: 'Back to the page'");
  ok(await a.getByRole("button", { name: "See the other way: invite them" }).isVisible(), "end: 'See the other way: invite them'");
  const all = (await audioState(a));
  ok(all.every((s) => s.paused), "end: the voice has stopped");
  const bodyText = await a.evaluate(() => document.body.innerText);
  ok(!FORBIDDEN.exec(bodyText.replace(/spare house key/gi, "")) && !EMOJI.test(bodyText), "the intro has no technical words and no emoji");
  await a.waitForTimeout(RECORD ? 3500 : 500);
  await a.getByRole("button", { name: "Back to the page" }).click();
  await overlay.waitFor({ state: "detached" });
  ok(await a.getByRole("heading", { level: 1, name: "Sealed today. Opened when it matters." }).isVisible(), "'Back to the page' returns to the front page");
  await a.waitForTimeout(RECORD ? 2500 : 300);
  if (RECORD) fs.writeFileSync(path.join(RECORD, "play-times.json"), JSON.stringify({ videoStartMs: pageMade, introOpenedMs: openAt, yesMs: yesAt, plays, audio }, null, 1));
  await cA.close();

  // ------------------------------------------------ 3. mute, pause, arrows, replay and skip while it plays
  {
    const c = await phone(); const p = await c.newPage(); track(p);
    await p.addInitScript(() => localStorage.setItem("tabella.intro.v1", "skip"));
    await p.goto(BASE, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Watch intro" }).click();
    const dlg = p.getByRole("dialog", { name: "Introduction to Tabella" });
    await dlg.waitFor();
    ok(await dlg.getByRole("button", { name: "Previous scene" }).count() === 0 && await dlg.getByRole("button", { name: "Next scene" }).isVisible(), "arrows: on the opener there is only a next arrow");
    await dlg.getByRole("button", { name: "Next scene" }).click();
    await p.locator(".cam-story svg.story").waitFor();
    const label = () => p.locator(".intro-step").innerText();
    ok((await label()).toLowerCase() === "write", "arrows: › jumps to the next scene (Write)");
    ok(await dlg.getByRole("button", { name: "Previous scene" }).isVisible(), "arrows: a glass ‹ appears on the left");
    await dlg.getByRole("button", { name: "Next scene" }).click();
    await dlg.getByRole("button", { name: "Next scene" }).click();
    ok((await label()).toLowerCase() === "backup", "arrows: › twice more reaches Backup");
    await dlg.getByRole("button", { name: "Previous scene" }).click();
    ok((await label()).toLowerCase() === "reach them", "arrows: ‹ goes back one scene");
    const arrow = await dlg.getByRole("button", { name: "Next scene" }).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, bf: getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter }));
    ok(/rgba\(255, 255, 255, 0\.0\d*\)/.test(arrow.bg), `arrows: transparent glass (${arrow.bg}, blur ${arrow.bf})`);
    await p.getByRole("button", { name: "Mute" }).click();
    ok(await p.getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed") === "true", "mute: the button switches to Unmute");
    ok((await audioState(p)).every((s) => s.muted), "mute: every voice line is muted");
    await p.getByRole("button", { name: "Unmute" }).click();
    ok((await audioState(p)).every((s) => !s.muted), "unmute: sound is back");
    // pause holds the voice, the clock and the story animations
    let playing = null;
    for (let i = 0; i < 60 && !playing; i++) { playing = (await audioState(p)).find((s) => !s.paused && s.t > 0.3); await p.waitForTimeout(200); }
    const anims0 = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.(".story")).length);
    await p.getByRole("button", { name: "Pause", exact: true }).click();
    await p.waitForTimeout(400);
    const stillRunning = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.(".story")).length);
    const seg0 = await p.locator(".intro-segs i").nth(2).evaluate((e) => e.style.transform);
    await p.waitForTimeout(1800);
    const seg1 = await p.locator(".intro-segs i").nth(2).evaluate((e) => e.style.transform);
    ok(seg0 === seg1 && (await audioState(p)).every((s) => s.paused), `pause: the film and the voice hold still (${anims0} scene animations were running, ${stillRunning} after)`);
    ok(stillRunning === 0, "pause: the scene's own animations stop too");
    await p.getByRole("button", { name: "Play", exact: true }).click();
    await p.waitForTimeout(1200);
    ok((await p.locator(".intro-segs i").nth(2).evaluate((e) => e.style.transform)) !== seg1, "play: the film carries on");
    // replay starts again from the opener
    await p.getByRole("button", { name: "Replay" }).click();
    await p.getByRole("heading", { name: "Some things should be said one day." }).waitFor({ timeout: 6000 });
    ok(true, "replay: starts again from the opener");
    await p.getByRole("button", { name: "Skip intro" }).click();
    await p.getByRole("dialog").waitFor({ state: "detached" });
    ok((await audioState(p)).every((s) => s.paused), "skip: the intro closes and the voice stops at once");
    await c.close();
  }

  // ------------------------------------------------ 4. reduced motion: a still version with captions
  {
    const c = await phone({ reducedMotion: "reduce" }); const p = await c.newPage(); track(p);
    await p.goto(BASE, { waitUntil: "networkidle" });
    await p.getByRole("dialog").waitFor({ timeout: 8000 });
    await p.getByRole("button", { name: "Yes, show me" }).click();
    const o = p.getByRole("dialog", { name: "Introduction to Tabella" });
    await o.waitFor(); await p.waitForTimeout(900);
    ok(await p.locator(".opener .seal-wrap").count() === 1 && /Tabella/.test(await p.locator(".opener-name").innerText()), "still version: the opener is one calm still (words, seal, name)");
    await shot(p, "08-still-opener");
    const before = (await audioState(p)).filter((s) => !s.paused).length;
    await p.waitForTimeout(2500);
    ok(before === 0 && (await p.locator(".opener").count()) === 1, "still version: nothing plays or advances by itself");
    const captions = [], hear = [], pics = [];
    // after the opener each beat is two stills: the picture, then the screen
    for (let i = 0; i < 17; i++) { // eight beats of two stills, then the last scene (no phone) is one still
      await p.getByRole("button", { name: "Next", exact: true }).click(); await p.waitForTimeout(450);
      const storyShown = (await p.locator(".cam-story svg.story.still").count()) === 1 && +(await p.locator(".cam-story").evaluate((e) => getComputedStyle(e).opacity)) > 0.9;
      pics.push(storyShown ? "picture" : "screen");
      if (i % 2 === 1 || i === 16) { captions.push((await p.locator(".intro-caption").first().innerText()).trim()); hear.push(await p.getByRole("button", { name: "Hear this line" }).count()); }
      if (i === 0 || i === 5 || i === 9 || i === 15) await shot(p, `09-still-${i + 1}`);
    }
    ok(pics.every((x, i) => x === (i % 2 === 0 ? "picture" : "screen")), `still version: each scene is a still picture, then its still screen (${pics.slice(0, 4).join(", ")}, ...)`);
    const spoken = SCRIPT.slice(1); // eight lines; the time-passes beat has none
    ok(captions.filter(Boolean).length === 8 && spoken.every((l) => captions.includes(l)), `still version: each screen shows its full caption (${captions.filter(Boolean).length} stepped by hand)`);
    const wantHear = [2, 3, 4, 5, 6, 7, null, 8, 9].map((n) => (n === null ? 0 : haveVoice(n) ? 1 : 0));
    ok(hear.join("") === wantHear.join(""), `still version: 'Hear this line' appears only where a recording exists (${hear.join("")}, expected ${wantHear.join("")})`);
    await p.getByRole("button", { name: "Next", exact: true }).click();
    await p.locator(".intro-end").waitFor();
    ok(await o.getByRole("link", { name: /Start here/ }).isVisible(), "still version: the end has 'Start here' too");
    await shot(p, "10-still-end");
    await c.close();
  }

  // ------------------------------------------------ 5. "See the other way: invite them" plays the first film
  {
    const c = await phone(); const p = await c.newPage(); track(p);
    await p.addInitScript(() => localStorage.setItem("tabella.intro.v1", "skip"));
    await p.goto(BASE, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Watch intro" }).click();
    const dlg = p.getByRole("dialog", { name: "Introduction to Tabella" });
    await dlg.waitFor();
    for (let i = 0; i < 9; i++) await dlg.getByRole("button", { name: "Next scene" }).click();
    await p.locator(".intro-end").waitFor();
    await p.getByRole("button", { name: "See the other way: invite them" }).click();
    await p.getByRole("heading", { name: "Some things should be said one day." }).waitFor({ timeout: 8000 });
    await dlg.getByRole("button", { name: "Next scene" }).click();
    await p.waitForFunction((t) => document.querySelector(".intro-caption p")?.innerText.trim() === t, INVITE_FIRST, { timeout: 8000 });
    ok(true, `"See the other way" plays the invite film from its opener (its first caption: "${INVITE_FIRST}")`);
    for (let i = 0; i < 8; i++) await dlg.getByRole("button", { name: "Next scene" }).click();
    await p.locator(".intro-end").waitFor();
    ok(await p.getByRole("button", { name: "See the other way: invite them" }).count() === 0, "the invite film's end card has no 'other way' button");
    await shot(p, "11-invite-film-end");
    await c.close();
  }

  ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ""}`);
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
