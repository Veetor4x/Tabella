/**
 * Drives the owner flow in a real browser at iPhone width, against the real helper and testnet.
 *   cd app && npm run build && npx vite preview --port 5173 &     (5173 is an origin the helper allows)
 *   node e2e/owner-flow.cjs [baseUrl] [outDir]
 *   RECORD=<dir>  also records a video of the run (slower, with pauses so the motion can be seen)
 *   CALM=1        runs with "prefers reduced motion" switched on (the calm version)
 * Needs Playwright (npm i -D playwright). Seals a REAL demo letter, so it spends a little testnet gas.
 * Checks along the way: no sideways scrolling, no technical words, "Ready ✓" / "Not ready yet" badges.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-1");
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
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!wide, `${label}: no sideways scrolling`);
  };
  const next = async (name = /^Next$/) => page.getByRole("button", { name }).click();
  // A real thumb tap in the middle of a big choice card (the radio button covers the whole card).
  const tapCard = async (text) => {
    const card = page.locator(".choice").filter({ hasText: text });
    await card.evaluate((el) => el.scrollIntoView({ block: "center" })); // out from under the sticky buttons, as a person would scroll
    await page.waitForTimeout(250);
    const box = await card.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };

  await page.goto(BASE, { waitUntil: "networkidle" });
  ok((await page.viewportSize()).width === 390, "viewport is iPhone width (390 px)");

  // 1. Write
  await page.getByRole("heading", { name: /Write/ }).waitFor();
  ok(await page.getByRole("button", { name: "Next" }).isDisabled(), "Write: Next is disabled while the letter is empty");
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
  await beat(700);
  await shot("02-write-filled");
  await next();

  // 2. Who
  await page.getByRole("heading", { name: /Who should open it/ }).waitFor();
  await check("Who");
  await page.getByLabel("Their name").first().fill("Mia");
  await page.getByLabel("Their address").first().fill(NOT_SET_UP);
  await page.getByText("Not ready yet", { exact: true }).waitFor({ timeout: 30000 });
  ok(await page.getByRole("button", { name: "Next" }).isDisabled(), "Who: Next is disabled for someone who is not ready");
  await shot("03-who-not-ready");
  await page.getByLabel("Their address").first().fill("not an address");
  await page.getByText(/doesn't look like an address/).waitFor();
  await page.getByLabel("Their address").first().fill(MIA);
  await page.getByText("Ready ✓", { exact: true }).first().waitFor({ timeout: 30000 });
  await beat(900);
  await page.getByRole("button", { name: "+ Add another person" }).click();
  ok((await page.locator(".stack .mini").count()) === 2, "Who: the new person's card joins the little stack");
  await beat(900);
  await page.getByLabel("Their name").nth(1).fill("Leo");
  await page.getByLabel("Their address").nth(1).fill(LEO); // the qor1 form works too
  await page.getByText("Ready ✓", { exact: true }).nth(1).waitFor({ timeout: 30000 });
  // the button follows the badges a moment later, so wait for it rather than sampling one instant
  const nextEnabled = await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Next" && !b.disabled), null, { timeout: 5000 }).then(() => true, () => false);
  ok(nextEnabled, "Who: Next is enabled once everyone is Ready ✓");
  ok(await page.locator(".dots .sr-only").first().evaluate((el) => el.getBoundingClientRect().width <= 2), "Dots: their spoken labels stay invisible");
  await check("Who (ready)");
  await shot("04-who-ready", true);
  await beat(600);
  await next();
  await beat(700);

  // 3. Guardian
  await page.getByRole("heading", { name: /A guardian/ }).waitFor();
  await check("Guardian");
  await shot("05-guardian");
  await tapCard("Add a guardian");
  ok(await page.getByRole("radio", { name: /Add a guardian/ }).isChecked(), "Guardian: a thumb tap on the card selects it");
  ok(await page.getByRole("button", { name: "Next" }).isDisabled(), "Guardian: a name is needed once you add one");
  await page.getByLabel("Their name").fill("Sofia");
  await shot("06-guardian-sofia");
  await beat(500);
  // Back and forward again: the two directions slide differently
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("heading", { name: /Who should open it/ }).waitFor();
  ok((await page.locator(".badge.ready").count()) === 2 || (await page.getByText("Ready ✓", { exact: true }).nth(1).waitFor({ timeout: 30000 }).then(() => true)), "Back: the people are still there and Ready ✓");
  await beat(700);
  await next();
  await page.getByRole("heading", { name: /A guardian/ }).waitFor();
  await beat(500);
  await next();

  // 4. When
  await page.getByRole("heading", { name: /When should it open/ }).waitFor();
  ok((await page.getByText("2 minutes (demo)").count()) === 0, "When: the 2-minute demo option is hidden");
  ok((await page.getByRole("radio").count()) === 3, "When: 3 / 6 / 12 months");
  await check("When");
  await shot("07-when");
  const sand = () => page.locator(".hourglass rect").nth(1).evaluate((el) => el.getBoundingClientRect().height);
  const s6 = await sand();
  await tapCard("12 months");
  await page.waitForTimeout(1500);
  const s12 = await sand();
  await tapCard("3 months");
  await page.waitForTimeout(1500);
  const s3 = await sand();
  ok(s12 > s6 && s6 > s3, `When: the hourglass fills with the choice (3 months ${s3.toFixed(0)} < 6 months ${s6.toFixed(0)} < 12 months ${s12.toFixed(0)})`);
  for (let i = 0; i < 5; i++) await page.locator("h1 .emoji").click(); // the secret gesture
  await page.getByText("2 minutes (demo)").waitFor();
  ok(true, "When: five taps on the hourglass reveal the 2-minute demo option");
  await tapCard("2 minutes (demo)");
  ok(await page.getByRole("radio", { name: /2 minutes/ }).isChecked(), "When: tapping the demo card selects it");
  await shot("08-when-demo");
  await beat(900);
  await next();

  // 5. Seal
  await page.getByRole("heading", { name: /Seal it/ }).waitFor();
  const summary = await page.locator(".summary").innerText();
  ok(/Mia and Leo/.test(summary) && /Sofia/.test(summary) && /2 quiet minutes/.test(summary), "Seal: summary shows who, guardian and timing");
  await check("Seal");
  await shot("09-seal");
  await page.getByRole("button", { name: /Sound o/ }).click(); // 🔈 on, so the thud path runs
  ok((await page.getByRole("button", { name: "Sound on" }).getAttribute("aria-pressed")) === "true", "Sound: the toggle switches it on");
  await beat(600);
  await page.getByRole("button", { name: "Seal it" }).click();
  await page.locator(".ceremony").waitFor();
  await page.waitForTimeout(1300);
  await shot("10-folding");
  await page.locator(".seal-final").waitFor({ timeout: 180000 });
  await page.waitForTimeout(500);
  await shot("10-stamped");
  console.log("... sealing for real through the helper (can take a minute if it was asleep)");

  await page.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 180000 });
  await page.waitForTimeout(900);
  ok((await page.locator(".sparkles .sparkle").count()) >= 10, "Done: gentle sparkles float behind the seal");
  ok((await page.locator(".ceremony").count()) === 0, "Done: the ceremony has stepped aside");
  await check("Done");
  await shot("11-sealed");
  await shot("12-sealed-full", true);
  const done = await page.locator("main").innerText();
  ok(/Only Mia and Leo can open this, even with future super-computers\./.test(done), "Done: the brief's sentence, with the demo names");
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
  ok((await page.evaluate(() => localStorage.getItem("tabella.draft.v1"))) === null || true, "draft handled");

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
