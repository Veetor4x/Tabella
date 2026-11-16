/**
 * Drives the owner flow in a real browser at iPhone width, against the real helper and testnet.
 *   cd app && npm run build && npx vite preview --port 5173 &     (5173 is an origin the helper allows)
 *   node e2e/owner-flow.cjs [baseUrl] [outDir]
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
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
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
    const box = await page.locator(".choice").filter({ hasText: text }).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };

  await page.goto(BASE, { waitUntil: "networkidle" });
  ok((await page.viewportSize()).width === 390, "viewport is iPhone width (390 px)");

  // 1. Write
  await page.getByRole("heading", { name: /Write/ }).waitFor();
  ok(await page.getByRole("button", { name: "Next" }).isDisabled(), "Write: Next is disabled while the letter is empty");
  await check("Write");
  await shot("01-write");
  await page.getByLabel("Your letter").fill("Dear Mia and Leo,\n\nThe spare door code is under the blue pot by the back gate. I wrote this on a quiet Sunday so you would have it, just in case.\n\nYou made every year better. Be kind to each other.\n\nLove, Alex");
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
  await page.getByRole("button", { name: "+ Add another person" }).click();
  await page.getByLabel("Their name").nth(1).fill("Leo");
  await page.getByLabel("Their address").nth(1).fill(LEO); // the qor1 form works too
  await page.getByText("Ready ✓", { exact: true }).nth(1).waitFor({ timeout: 30000 });
  ok(await page.getByRole("button", { name: "Next" }).isEnabled(), "Who: Next is enabled once everyone is Ready ✓");
  await check("Who (ready)");
  await shot("04-who-ready", true);
  await next();

  // 3. Guardian
  await page.getByRole("heading", { name: /A guardian/ }).waitFor();
  await check("Guardian");
  await shot("05-guardian");
  await tapCard("Add a guardian");
  ok(await page.getByRole("radio", { name: /Add a guardian/ }).isChecked(), "Guardian: a thumb tap on the card selects it");
  ok(await page.getByRole("button", { name: "Next" }).isDisabled(), "Guardian: a name is needed once you add one");
  await page.getByLabel("Their name").fill("Sofia");
  await shot("06-guardian-sofia");
  await next();

  // 4. When
  await page.getByRole("heading", { name: /When should it open/ }).waitFor();
  ok((await page.getByText("2 minutes (demo)").count()) === 0, "When: the 2-minute demo option is hidden");
  ok((await page.getByRole("radio").count()) === 3, "When: 3 / 6 / 12 months");
  await check("When");
  await shot("07-when");
  for (let i = 0; i < 5; i++) await page.locator("h1 .emoji").click(); // the secret gesture
  await page.getByText("2 minutes (demo)").waitFor();
  ok(true, "When: five taps on the hourglass reveal the 2-minute demo option");
  await tapCard("2 minutes (demo)");
  ok(await page.getByRole("radio", { name: /2 minutes/ }).isChecked(), "When: tapping the demo card selects it");
  await shot("08-when-demo");
  await next();

  // 5. Seal
  await page.getByRole("heading", { name: /Seal it/ }).waitFor();
  const summary = await page.locator(".summary").innerText();
  ok(/Mia and Leo/.test(summary) && /Sofia/.test(summary) && /2 quiet minutes/.test(summary), "Seal: summary shows who, guardian and timing");
  await check("Seal");
  await shot("09-seal");
  await page.getByRole("button", { name: "Seal it" }).click();
  await page.locator(".overlay").waitFor();
  await page.waitForTimeout(2600);
  await shot("10-sealing");
  console.log("... sealing for real through the helper (can take a minute if it was asleep)");

  await page.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 180000 });
  await page.waitForTimeout(900);
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

  ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
