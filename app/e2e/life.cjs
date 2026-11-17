/**
 * A letter's life on testnet with the 2-minute demo timer, through the real screens:
 * seal -> cards -> My letters -> Warning -> check in -> new device restores -> guardian pauses twice
 * -> a third pause is refused -> cancel (with the confirm step).
 *   cd app && npm run build && npx vite preview --port 5173 &
 *   node e2e/life.cjs [baseUrl] [outDir]        RECORD=<dir> also records the owner's phone
 * Seals ONE real letter and sends a handful of real actions, so it spends a little testnet gas.
 */
const { chromium, devices } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-7");
fs.mkdirSync(OUT, { recursive: true });
const MIA = "0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3";
const LEO = "qor14tg7fvfe3zxq9t5vte83lnrh4z0q6c64tfu5qy";
const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|ciphertext|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|relay\w*)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };
const url = (p) => new URL(p, BASE).href;

(async () => {
  const browser = await chromium.launch();
  const RECORD = process.env.RECORD;
  const phone = (extra = {}) => browser.newContext({ ...devices["iPhone 13"], ...extra });
  const A = await phone(RECORD ? { recordVideo: { dir: RECORD, size: { width: 390, height: 664 } } } : {});
  const a = await A.newPage();
  const errors = [];
  a.on("pageerror", (e) => errors.push(String(e)));
  const shot = async (page, name, full = false) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); };
  const clean = async (page, label) => {
    const t = (await page.evaluate(() => document.body.innerText)).replace(/spare house key/gi, "").replace(/tbl1_\S+/g, "");
    const hit = FORBIDDEN.exec(t);
    ok(!hit && !EMOJI.test(t), `${label}: no technical words, no emoji${hit ? ` (found "${hit[0]}")` : ""}`);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, visualViewport.scale]);
    ok(w[0] <= w[1] + 1 && w[2] === 1, `${label}: no sideways scrolling or zoom`);
  };
  const ringText = (page) => page.locator(".ring-center").first().innerText();

  // ---------------------------------------------------------------- 1. seal a 2-minute letter (the real flow)
  await a.goto(url("write?demo"), { waitUntil: "networkidle" });
  await a.getByLabel("Your letter").fill("Dear Mia and Leo,\n\nThe spare door code is under the blue pot by the back gate.\n\nLove, Alex");
  await a.getByLabel("Your first name (optional)").fill("Alex");
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("radio", { name: /Invite someone/ }).check();
  await a.getByLabel("Their name").first().fill("Mia");
  await a.getByLabel("Their address").first().fill(MIA);
  await a.locator(".badge.ready").first().waitFor({ timeout: 40000 });
  await a.getByRole("button", { name: "Add another person" }).click();
  await a.getByLabel("Their name").nth(1).fill("Leo");
  await a.getByLabel("Their address").nth(1).fill(LEO);
  await a.locator(".badge.ready").nth(1).waitFor({ timeout: 40000 });
  await a.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Continue/.test(b.textContent.trim()) && !b.disabled));
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: /When should it open/ }).waitFor(); await a.waitForTimeout(800);
  for (let i = 0; i < 5; i++) await a.locator(".numeral").click();
  await a.locator(".choice").filter({ hasText: "2 minutes (demo)" }).click();
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: /Is there someone/ }).waitFor(); await a.waitForTimeout(600);
  await a.locator(".choice").filter({ hasText: "Add a guardian" }).click();
  await a.getByLabel("Their name").fill("Sofia");
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: "Ready to seal it?" }).waitFor(); await a.waitForTimeout(800);
  await a.getByRole("button", { name: "Seal it" }).click();
  await a.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 180000 });
  const sealedAt = Date.now();
  const L = await a.evaluate(() => JSON.parse(localStorage.getItem("tabella.letters.v1")).at(-1));
  ok(!!L.letterId && /^tbl1_/.test(L.ownerCard) && /^tbl1_/.test(L.guardianCard), `sealed letter ${L.letterId} (2-minute timer): both cards made`);
  const ID = L.letterId;
  console.log(`   letter ${ID}, tx ${L.txHash}`);
  await a.waitForTimeout(3500);
  await shot(a, "01-sealed");

  // ---------------------------------------------------------------- 2. the printable cards
  await a.getByRole("link", { name: "Print or save your cards" }).click();
  await a.getByRole("heading", { name: "Your cards" }).waitFor(); await a.waitForTimeout(1500);
  ok((await a.locator(".print-card .qr").count()) === 2, "cards: the I'm-still-here card and the guardian card both have a QR code");
  const ct = await a.locator(".cards-page").innerText();
  ok(/Keep this safe, like a spare house key\./.test(ct) && /Guardian card for Sofia/.test(ct) && /Give the guardian card to Sofia/.test(ct), "cards: the 'spare house key' step and Sofia's card");
  await clean(a, "cards");
  await shot(a, "02-cards", true);
  await a.emulateMedia({ media: "print" });
  ok(await a.locator(".brand").isHidden() && await a.locator(".no-print").first().isHidden(), "cards: when printed, only the cards remain");
  await a.screenshot({ path: path.join(OUT, "03-cards-print.png") });
  await a.emulateMedia({ media: "screen" });
  // the QR really holds the card
  const qrOk = await a.evaluate(async (code) => {
    const svg = document.querySelector(".print-card .qr");
    return !!svg && document.querySelector(".print-card code").textContent === code;
  }, L.ownerCard);
  ok(qrOk, "cards: the code printed under the QR is the card's code");

  // ---------------------------------------------------------------- 3. My letters
  await a.goto(url("me"), { waitUntil: "networkidle" });
  await a.getByText(`Letter ${ID} · for Mia and Leo`).waitFor();
  await a.waitForFunction(() => /Next check-in in/.test(document.body.innerText), null, { timeout: 30000 });
  ok(/Sealed/.test(await a.locator(".letter-row").first().innerText()), "my letters: the letter shows Sealed");
  ok(/Next check-in in (\d+ (minute|second)s?|1 minute \d+ seconds?)/.test(await a.locator(".letter-row").first().innerText()), `my letters: "${(await a.locator(".letter-row").first().innerText()).split("\n").find((x) => /Next/.test(x))}"`);
  await clean(a, "my letters");
  await shot(a, "04-my-letters");
  await a.locator(".letter-row").first().click();
  await a.getByRole("heading", { name: "Still here?" }).waitFor(); await a.waitForTimeout(1200);
  ok(/until your next check-in/i.test(await ringText(a)), "check-in: the ring counts down to the next check-in");
  await clean(a, "check-in");
  await shot(a, "05-check-in");

  // ---------------------------------------------------------------- 4. into Warning: the page turns gently urgent
  const toWarning = Math.max(0, 125_000 - (Date.now() - sealedAt));
  console.log(`   waiting ${(toWarning / 1000).toFixed(0)} s for the quiet time to run out...`);
  await a.waitForTimeout(toWarning);
  await a.getByRole("heading", { name: "Your letter will open soon." }).waitFor({ timeout: 30000 });
  ok(await a.locator(".checkin.urgent").count() === 1 && await a.locator(".btn.alert").count() === 1, "warning: the page turns gently urgent (heading, ring and button)");
  ok(/until it opens/i.test(await ringText(a)), "warning: the ring now counts to the opening");
  ok(/Warning/.test(await a.locator(".facts").innerText()), "warning: the status reads Warning");
  await clean(a, "warning");
  await shot(a, "06-warning");

  // ---------------------------------------------------------------- 5. I'm still here, during the Warning
  await a.getByRole("button", { name: "I'm still here" }).click();
  await a.getByText("Confirming with your card…").waitFor();
  await shot(a, "07-confirming");
  await a.getByRole("heading", { name: "Thanks, Alex." }).waitFor({ timeout: 90000 });
  ok(await a.getByText("Your letter stays sealed.").isVisible(), "check-in: 'Thanks, Alex. Your letter stays sealed.'");
  await a.waitForTimeout(2400);
  const after = await ringText(a);
  ok(/(1 minute \d+ seconds?|2 minutes?|\d+ seconds)/.test(after) && /until your next check-in/i.test(after), `check-in: the ring reset (now "${after.replace(/\n/g, " ")}") and the page is calm again`);
  ok(await a.locator(".checkin.urgent").count() === 0, "check-in: the urgent look is gone");
  await shot(a, "08-checked-in");
  const resetAt = Date.now();

  // ---------------------------------------------------------------- 6. a new device restores from the I'm-still-here card
  const B = await phone();
  const b = await B.newPage();
  await b.goto(url("me"), { waitUntil: "networkidle" });
  ok(await b.getByText("No letters on this phone yet.").count() === 1, "new device: My letters starts empty");
  await shot(b, "09-new-device-empty");
  await b.getByLabel("The code on the card").fill("tbl1_" + L.ownerCard.slice(5, 20)); // a short, wrong code first
  await b.getByRole("button", { name: "Restore" }).click();
  await b.getByText(/too short|typo|doesn't look/).first().waitFor({ timeout: 10000 });
  ok(true, "new device: a mistyped code gets a kind message");
  await b.getByLabel("The code on the card").fill(L.ownerCard.replace(/(.{12})/g, "$1 ")); // spaces and line breaks are fine
  await b.getByRole("button", { name: "Restore" }).click();
  await b.getByText(`Letter ${ID} · for 2 people`).waitFor({ timeout: 60000 });
  ok(true, "new device: pasting the card brings the letter back");
  await clean(b, "restored");
  await shot(b, "10-restored");
  await b.locator(".letter-row").first().click();
  await b.getByRole("heading", { name: /Still here\?|Your letter will open soon\./ }).waitFor();
  await shot(b, "11-restored-detail");
  ok(await b.getByRole("button", { name: "I'm still here" }).isVisible(), "new device: the restored letter has its check-in button");
  await B.close();

  // ---------------------------------------------------------------- 7. the guardian, on her own phone
  const G = await phone();
  const g = await G.newPage();
  await g.goto(url("guardian"), { waitUntil: "networkidle" });
  await g.getByRole("heading", { name: /guardian/i }).first().waitFor();
  await clean(g, "guardian (before restoring)");
  await shot(g, "12-guardian-empty");
  await g.getByLabel("The code on the card").fill(L.ownerCard); // the wrong kind of card
  await g.getByRole("button", { name: "Restore" }).click();
  await g.getByText("That's an I'm-still-here card.").waitFor({ timeout: 60000 });
  ok(true, "guardian: the wrong kind of card is explained");
  await g.getByLabel("The code on the card").fill(L.guardianCard);
  await g.getByRole("button", { name: "Restore" }).click();
  await g.getByText("A letter for 2 people").waitFor({ timeout: 60000 });
  ok(/2 of 2/.test(await g.locator(".pauses").innerText()), "guardian: two pauses left");
  await clean(g, "guardian");
  await shot(g, "13-guardian");
  await g.getByRole("button", { name: "They're okay" }).click();
  await g.getByText(/Thank you\. They have more time\./).waitFor({ timeout: 90000 });
  await g.waitForFunction(() => /1 of 2/.test(document.querySelector(".pauses").innerText), null, { timeout: 30000 });
  ok(true, "guardian: first pause worked, one left");
  await shot(g, "14-guardian-one-left");
  await g.getByRole("button", { name: "They're okay" }).click();
  await g.waitForFunction(() => /0 of 2/.test(document.querySelector(".pauses").innerText), null, { timeout: 90000 });
  ok(await g.getByRole("button", { name: "They're okay" }).isDisabled(), "guardian: second pause worked, none left, and the button is off");
  await clean(g, "guardian (none left)");
  await shot(g, "15-guardian-none-left");
  // a third pause, sent by hand (the button is off): the network itself must refuse it
  let third;
  try {
    const built = JSON.parse(execFileSync("npx", ["tsx", path.join(__dirname, "third-pause.ts"), ID, L.guardianCard], { cwd: path.join(__dirname, "..", "..", "helper"), encoding: "utf8", timeout: 120000 }).trim().split("\n").pop());
    third = await g.evaluate(async ([body]) => {
      const r = await fetch("https://tabella-helper-oecu.onrender.com/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }, [built.body]);
    third.pausesUsed = built.pausesUsed;
  } catch (e) { third = { error: String(e).slice(0, 200) }; }
  console.log("   third pause:", JSON.stringify(third));
  ok(third.status === 422 && third.body?.error === "would_revert" && third.body?.reason === "PauseLimitReached", "a THIRD pause is refused by the network (PauseLimitReached, nothing sent, no fee)");
  await G.close();

  // ---------------------------------------------------------------- 8. cancel, with a confirm step
  await a.reload({ waitUntil: "networkidle" });
  await a.getByRole("button", { name: "Cancel this letter" }).waitFor();
  await a.getByRole("button", { name: "Cancel this letter" }).click();
  await a.getByRole("alertdialog").waitFor();
  ok(/can't be undone/.test(await a.getByRole("alertdialog").innerText()), "cancel: a clear confirm step says it can't be undone");
  await clean(a, "cancel (confirm)");
  await shot(a, "16-cancel-confirm");
  await a.getByRole("button", { name: "Keep it" }).click();
  await a.getByRole("alertdialog").waitFor({ state: "detached" });
  ok(await a.getByRole("button", { name: "I'm still here" }).isVisible(), "cancel: 'Keep it' leaves the letter exactly as it was");
  await a.getByRole("button", { name: "Cancel this letter" }).click();
  await a.getByRole("button", { name: "Yes, cancel it" }).click();
  await a.getByRole("heading", { name: "This letter was cancelled." }).waitFor({ timeout: 90000 });
  await a.waitForTimeout(1800);
  ok(/Cancelled/.test(await ringText(a)) && await a.getByRole("button", { name: "I'm still here" }).count() === 0, "cancel: the letter is Cancelled and the check-in button is gone");
  await clean(a, "cancelled");
  await shot(a, "17-cancelled");
  await a.getByRole("button", { name: "← My letters" }).click();
  await a.getByText(/Cancelled/).first().waitFor();
  await shot(a, "18-my-letters-cancelled");
  ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ""}`);
  await A.close(); await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
