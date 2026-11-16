/**
 * Drives the owner flow in a real browser at iPhone width, against the real helper and testnet.
 *   cd app && npm run build && npx vite preview --port 5173 &     (5173 is an origin the helper allows)
 *   node e2e/owner-flow.cjs [baseUrl] [outDir]
 *   RECORD=<dir>  also records a video of the run (slower, with pauses so the motion can be seen)
 *   CALM=1        runs with "prefers reduced motion" switched on (the calm version)
 * Needs Playwright (npm i -D playwright). Seals a REAL demo letter, so it spends a little testnet gas.
 * Checks along the way: no sideways scrolling, no technical words, "Ready" / "Not ready yet" badges, pills, the map, night mode.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-3");
fs.mkdirSync(OUT, { recursive: true });

// Two testnet accounts that registered an opening card (made by helper/scripts/e2e-postman.ts).
const MIA = "0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3";
const LEO = "qor14tg7fvfe3zxq9t5vte83lnrh4z0q6c64tfu5qy"; // Leo's address in the other form
const NOT_SET_UP = "0x000000000000000000000000000000000000dEaD";

const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|ciphertext|encrypt\w*|decrypt\w*|signature|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*)\b/i;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

(async () => {
  const browser = await chromium.launch();
  const RECORD = process.env.RECORD;
  const CALM = !!process.env.CALM;
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    reducedMotion: CALM ? "reduce" : "no-preference",
    ...(RECORD ? { recordVideo: { dir: RECORD, size: { width: 390, height: 844 } } } : {}),
  });
  const beat = (ms) => (RECORD ? page.waitForTimeout(ms) : Promise.resolve());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // Let transitions finish, and for full-page captures let the sticky button sit at the end (as it does when scrolled to the bottom).
  const shot = async (name, full = false) => {
    await page.waitForTimeout(450);
    const style = full ? await page.addStyleTag({ content: ".actions{position:static!important;background:none!important}" }) : null;
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    if (style) await style.evaluate((n) => n.remove());
  };
  const check = async (label) => {
    const text = (await page.evaluate(() => document.body.innerText)).replace(/spare house key/gi, "spare house ___").replace(/tbl1_\S+/g, "");
    const hit = FORBIDDEN.exec(text);
    ok(!hit, `${label}: no technical words${hit ? ` (found "${hit[0]}")` : ""}`);
    ok(!EMOJI.test(text), `${label}: no emoji`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!wide, `${label}: no sideways scrolling`);
  };
  const next = async (name = /^Continue/) => page.getByRole("button", { name }).click();
  const pillTexts = () => page.locator(".pills .pill").allInnerTexts();
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  // A real thumb tap in the middle of a big choice card (the radio button covers the whole card).
  const tapCard = async (text) => {
    const card = page.locator(".choice").filter({ hasText: text });
    await card.evaluate((el) => el.scrollIntoView({ block: "center" })); // out from under the sticky buttons, as a person would scroll
    await page.waitForTimeout(250);
    const box = await card.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  ok((await page.viewportSize()).width === 390, "viewport is iPhone width (390 px)");
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
  ok(fonts.some((f) => /Instrument Serif/.test(f)) && fonts.some((f) => /Inter/.test(f)), `fonts: the editorial serif and the sans are loaded (${[...new Set(fonts)].join(", ")})`);

  // 01 Write
  await page.getByRole("heading", { name: "What do you want them to read one day?" }).waitFor();
  await page.waitForTimeout(1400);
  ok((await page.locator(".numeral-col span").first().innerText()) === "01", "Write: the big number reads 01");
  ok(await page.getByRole("button", { name: "Continue" }).isDisabled(), "Write: Continue is disabled while the letter is empty");
  await check("Write");
  await shot("01-write");
  ok((await page.getByRole("button", { name: "Sound off" }).getAttribute("aria-pressed")) === "false", "Sound: off by default");
  const LETTER = "Dear Mia and Leo,\n\nThe spare door code is under the blue pot by the back gate. I wrote this on a quiet Sunday so you would have it, just in case.\n\nYou made every year better. Be kind to each other.\n\nLove, Alex";
  const h0 = await page.getByLabel("Your letter").evaluate((el) => el.offsetHeight);
  if (RECORD) await page.getByLabel("Your letter").pressSequentially(LETTER, { delay: 14 });
  else await page.getByLabel("Your letter").fill(LETTER);
  await page.getByLabel("Your letter").pressSequentially("\n\nP.S. Water the fern.\n\nP.P.S. And call your grandmother.", { delay: RECORD ? 14 : 0 });
  const h1 = await page.getByLabel("Your letter").evaluate((el) => el.offsetHeight);
  ok(h1 > h0, `Write: the letter box grows as you type (${h0}px -> ${h1}px)`);
  await page.getByLabel("Your first name (optional)").fill("Alex");
  await beat(700);
  await shot("02-write-filled");
  await next();

  // 02 Who
  await page.getByRole("heading", { name: "Alex, who should read this one day?" }).waitFor();
  await page.waitForTimeout(1200);
  ok((await pillTexts()).some((t) => /^Letter · \d+ words$/.test(t)), `Who: the finished step is now a pill (${(await pillTexts()).join(" | ")})`);
  await check("Who");
  await shot("03-who");
  await page.getByLabel("Their name").first().fill("Mia");
  await page.getByLabel("Their address").first().fill(NOT_SET_UP);
  await page.getByText("Not ready yet", { exact: true }).first().waitFor({ timeout: 30000 });
  ok(await page.getByRole("button", { name: "Continue" }).isDisabled(), "Who: Continue is disabled for someone who is not ready");
  await shot("04-who-not-ready");
  await page.getByLabel("Their address").first().fill("not an address");
  await page.getByText(/doesn't look like an address/).waitFor();
  await page.getByLabel("Their address").first().fill(MIA);
  // blurred empty glass card first...
  const ghostOpacity = await page.locator(".reveal-ghost").first().evaluate((el) => +getComputedStyle(el).opacity);
  await shot("05-who-blurred-card");
  console.log(`   (ghost card opacity right after pasting: ${ghostOpacity.toFixed(2)})`);
  // ...which sharpens into their card, then Ready
  await page.locator(".badge.ready").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(700);
  ok((await page.locator(".reveal-ghost").first().evaluate((el) => +getComputedStyle(el).opacity)) < 0.05, "Who: the blurred card has faded away, leaving the sharp card");
  await shot("06-who-sharp-ready");
  await beat(900);
  await page.getByRole("button", { name: "Add another person" }).click();
  await beat(700);
  await page.getByLabel("Their name").nth(1).fill("Leo");
  await page.getByLabel("Their address").nth(1).fill(LEO); // the qor1 form works too
  await page.locator(".badge.ready").nth(1).waitFor({ timeout: 30000 });
  const nextEnabled = await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Continue/.test(b.textContent.trim()) && !b.disabled), null, { timeout: 5000 }).then(() => true, () => false);
  ok(nextEnabled, "Who: Continue is enabled once everyone is Ready");
  await check("Who (ready)");
  await shot("07-who-two-ready", true);
  await beat(600);
  await next();

  // 03 Guardian
  await page.getByRole("heading", { name: "Is there someone who can say you're okay?" }).waitFor();
  await page.waitForTimeout(1200);
  ok((await pillTexts()).includes("2 people"), "Guardian: '2 people' joined the pills");
  await check("Guardian");
  await shot("08-guardian");
  await tapCard("Add a guardian");
  ok(await page.getByRole("radio", { name: /Add a guardian/ }).isChecked(), "Guardian: a thumb tap on the card selects it");
  ok(await page.getByRole("button", { name: "Continue" }).isDisabled(), "Guardian: a name is needed once you add one");
  await page.getByLabel("Their name").fill("Sofia");
  await shot("09-guardian-sofia");
  await beat(500);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("heading", { name: "Alex, who should read this one day?" }).waitFor();
  ok((await page.locator(".badge.ready").count()) === 2 || (await page.locator(".badge.ready").nth(1).waitFor({ timeout: 30000 }).then(() => true)), "Back: the people are still there and Ready");
  await beat(700);
  await next();
  await page.getByRole("heading", { name: /Is there someone/ }).waitFor();
  await beat(500);
  await next();

  // 04 When
  await page.getByRole("heading", { name: "If you go quiet, when should it open?" }).waitFor();
  await page.waitForTimeout(1200);
  ok((await pillTexts()).includes("Sofia · guardian"), "When: 'Sofia · guardian' joined the pills");
  ok((await page.getByText("2 minutes (demo)").count()) === 0, "When: the 2-minute demo option is hidden");
  ok((await page.getByRole("radio").count()) === 3, "When: 3 / 6 / 12 months");
  await check("When");
  await shot("10-when");
  const dotX = () => page.locator(".track-dot span").evaluate((el) => el.getBoundingClientRect().x);
  const x6 = await dotX();
  await tapCard("12 months");
  await page.waitForTimeout(1000);
  const x12 = await dotX();
  await tapCard("3 months");
  await page.waitForTimeout(1000);
  const x3 = await dotX();
  ok(x12 > x6 && x6 > x3, `When: the marker slides along the thin timeline (3 mo ${x3.toFixed(0)} < 6 mo ${x6.toFixed(0)} < 12 mo ${x12.toFixed(0)})`);
  await shot("11-when-3-months");
  for (let i = 0; i < 5; i++) await page.locator(".numeral").click(); // the secret gesture
  await page.getByText("2 minutes (demo)").waitFor();
  ok(true, "When: five taps on the big number reveal the 2-minute demo option");
  await tapCard("2 minutes (demo)");
  ok(await page.getByRole("radio", { name: /2 minutes/ }).isChecked(), "When: tapping the demo card selects it");
  await shot("12-when-demo");
  await beat(900);
  await next();

  // 05 Seal
  await page.getByRole("heading", { name: "Ready to seal it?" }).waitFor();
  await page.waitForTimeout(3600); // let the lines draw themselves
  const pills = (await pillTexts()).join(" | ");
  ok(/Letter/.test(pills) && /2 people/.test(pills) && /Sofia · guardian/.test(pills) && /2 minutes/.test(pills), `Seal: all four decisions are pills (${pills})`);
  const mapText = await page.getByTestId("map").innerText();
  ok(/Mia/.test(mapText) && /Leo/.test(mapText) && /Sofia/i.test(mapText) && /guardian/i.test(mapText), "Seal: the map shows the letter, Mia, Leo and Sofia as guardian");
  const lines = await page.locator(".map .ln-v, .map .ln-h").count();
  ok(lines >= 5, `Seal: thin connector lines are drawn (${lines})`);
  await check("Seal");
  await shot("13-seal-map");
  await page.getByRole("button", { name: /Sound o/ }).click();
  ok((await page.getByRole("button", { name: "Sound on" }).getAttribute("aria-pressed")) === "true", "Sound: the toggle switches it on");
  await beat(600);
  await page.getByRole("button", { name: "Seal it" }).click();
  ok(await page.locator(".map-shimmer").count() === 1, "Seal: a slow shimmer sweeps across the map while it works");
  await page.waitForTimeout(900);
  await shot("14-sealing-shimmer");
  console.log("... sealing for real through the helper (can take a minute if it was asleep)");

  // Night
  await page.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 180000 });
  ok(await page.locator(".root.night").count() === 1, "Done: the screen is in night mode");
  await page.waitForTimeout(700);
  await shot("15-night-fading-in");
  await page.waitForTimeout(4200);
  await check("Done");
  await shot("16-sealed-night");
  await shot("17-sealed-night-full", true);
  const done = await page.locator("main").innerText();
  ok(/Only Mia and Leo can open this\./.test(done), "Done: 'Only Mia and Leo can open this.'");
  ok((await page.locator(".night-map .point").count()) === 3, "Done: people are glowing points (Mia, Leo, Sofia)");
  ok((await page.locator(".night-map .wax").count()) === 1, "Done: the seal sits in the middle");
  ok(/Your I'm-still-here card/.test(done) && /Sofia's guardian card/.test(done), "Done: both cards are shown");
  ok(/Keep this safe, like a spare house key\./.test(done), "Done: the 'spare house key' line");
  ok(await page.getByRole("button", { name: "Write another letter" }).isDisabled(), "Done: can't move on until 'I've saved or printed' is ticked");
  const href = await page.getByRole("link", { name: "See the public receipt" }).getAttribute("href");
  console.log("receipt:", href);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("tabella.letters.v1") || "[]"));
  ok(saved.length >= 1 && /^tbl1_/.test(saved[saved.length - 1].ownerCard) && /^tbl1_/.test(saved[saved.length - 1].guardianCard), "Done: both cards were also saved on this device");
  console.log("letter id:", saved[saved.length - 1].letterId, "| tx:", saved[saved.length - 1].txHash);
  await page.getByLabel(/I've saved or printed/).check();
  ok(await page.getByRole("button", { name: "Write another letter" }).isEnabled(), "Done: ticking the box lets you continue");

  await beat(2500);
  ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await ctx.close(); // finishes the video file
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
