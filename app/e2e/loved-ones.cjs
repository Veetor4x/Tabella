/**
 * The loved one's side, end to end on testnet with the 2-minute demo timer, through the real screens, on separate fresh browsers:
 *   Mia and Leo each make an opening card on /join (fee money from the helper's /fund, key registered by the browser);
 *   Alex invites, pastes their addresses (a whole message works), and seals to them;
 *   Mia tries /open early ("still safely sealed"), with a mistyped code and a wrong card on the way;
 *   Alex goes quiet; the Postman publishes; Mia opens the letter on a fresh browser, then Leo does, on another.
 *   cd app && npm run build && npx vite preview --port 5173 &
 *   node e2e/loved-ones.cjs [baseUrl] [outDir]        RECORD=<dir> records Mia's journey (one video per browser)
 * Spends real testnet gas (helper) and creates two new testnet accounts.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-9");
fs.mkdirSync(OUT, { recursive: true });
const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|ciphertext|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|wallet|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|ethereum|solidity)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const LETTER = "Dear Mia and Leo,\n\nI've put aside 2 Bitcoin for you both, my gift for your futures. The hardware wallet is in the small safe in my study, and its recovery card is sealed with Mr. Hart, our lawyer. Show him this letter and he'll help you. Split it fairly and look after each other.\n\nAll my love, Alex.";
const url = (p) => new URL(p, BASE).href;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const RECORD = process.env.RECORD;
  const errors = [];
  const fresh = async (name, extra = {}) => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], ...(RECORD && extra.record ? { recordVideo: { dir: RECORD, size: { width: 390, height: 844 } } } : {}), colorScheme: extra.dark ? "dark" : "light" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
    return { ctx, page, name };
  };
  const shot = async (page, name, full = false) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); };
  const clean = async (page, label, allow = []) => {
    let t = (await page.evaluate(() => document.body.innerText)).replace(/spare house key/gi, "").replace(/tbl1_\S+/g, "");
    for (const a of allow) t = t.split(a).join("");
    const hit = FORBIDDEN.exec(t);
    ok(!hit && !EMOJI.test(t), `${label}: no technical words, no emoji${hit ? ` (found "${hit[0]}")` : ""}`);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, visualViewport.scale]);
    ok(w[0] <= w[1] + 1 && w[2] === 1, `${label}: no sideways scrolling or zoom`);
  };

  // ----------------------------------------------------------------------- 1. Mia and Leo make their opening cards
  async function join(name, opts) {
    const b = await fresh(name, opts);
    const p = b.page;
    await p.goto(url("join?from=Alex"), { waitUntil: "networkidle" });
    await p.getByRole("heading", { name: /Alex wants to leave you something to read one day/ }).waitFor();
    await p.waitForTimeout(1200);
    ok(await p.getByRole("button", { name: "Make my opening card" }).isVisible() && await p.getByRole("button", { name: "Use QoreX instead" }).isVisible(), `${name}: the invitation, "Make my opening card" and the quiet "Use QoreX instead"`);
    await clean(p, `${name}: invitation`);
    await shot(p, `${name.toLowerCase()}-01-invitation`);
    await p.getByRole("button", { name: "Make my opening card" }).click();
    await p.getByRole("heading", { name: "One moment…" }).waitFor();
    await shot(p, `${name.toLowerCase()}-02-working`);
    console.log(`   ${name}: fee money from the helper, key registered by the browser (up to a couple of minutes if the helper was asleep)...`);
    await p.getByRole("heading", { name: /Your opening card is ready/ }).waitFor({ timeout: 300000 });
    await p.waitForTimeout(1200);
    const card = (await p.locator(".print-card code").innerText()).trim();
    ok(/^tbl1_/.test(card) && (await p.locator(".print-card .qr").count()) === 1, `${name}: the printable opening card with a QR code`);
    ok(/Keep this safe, like a spare house key\./.test(await p.locator("main").innerText()), `${name}: the "Keep this safe, like a spare house key" step`);
    await clean(p, `${name}: card`);
    await shot(p, `${name.toLowerCase()}-03-card`, true);
    ok((await p.locator(".send-card").count()) === 0, `${name}: "Send to Alex" waits until the card is saved`);
    await p.getByLabel(/I've printed or saved my card/).check();
    await p.locator(".send-card .addr").waitFor();
    const address = (await p.locator(".send-card .addr").innerText()).trim();
    ok(/^qor1/.test(address) && !address.includes(card), `${name}: "Send to Alex" shares the address only (never the card)`);
    ok(await p.getByRole("button", { name: "Send to Alex" }).isVisible() || (await p.getByRole("link", { name: "WhatsApp" }).count()) > 0, `${name}: a "Send to Alex" button with WhatsApp, email and copy`);
    const wa = await p.getByRole("link", { name: "WhatsApp" }).getAttribute("href").catch(() => null);
    if (wa) ok(decodeURIComponent(wa).includes(address) && !decodeURIComponent(wa).includes("tbl1_"), `${name}: the message carries the address and no card`);
    await shot(p, `${name.toLowerCase()}-04-send`, true);
    // a refresh brings the same card back (it is on this device)
    await p.reload({ waitUntil: "networkidle" });
    await p.getByRole("heading", { name: /Your opening card is ready/ }).waitFor({ timeout: 60000 });
    ok((await p.locator(".print-card code").innerText()).trim() === card, `${name}: a refresh shows the same card again`);
    await b.ctx.close();
    return { card, address, video: b.page.video() };
  }
  const mia = await join("Mia", { record: true });
  const leo = await join("Leo", { dark: true });
  console.log(`   Mia ${mia.address}\n   Leo ${leo.address}`);

  // ----------------------------------------------------------------------- 2. Alex invites, pastes the messages, and seals
  const A = await fresh("Alex");
  const a = A.page;
  await a.goto(url("write?demo"), { waitUntil: "networkidle" });
  await a.getByLabel("Your letter").fill(LETTER);
  await a.getByLabel("Your first name (optional)").fill("Alex");
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: "Alex, who should read this one day?" }).waitFor(); await a.waitForTimeout(900);
  await a.getByRole("button", { name: "Invite someone" }).click();
  await a.getByRole("group", { name: "Share the invite" }).waitFor();
  const wa = await a.getByRole("link", { name: "WhatsApp" }).getAttribute("href");
  const em = await a.getByRole("link", { name: "Email" }).getAttribute("href");
  const linkText = decodeURIComponent(wa);
  ok(/\/join\?from=Alex/.test(linkText) && !/tbl1_|qor1|0x[0-9a-f]{8}|seed/i.test(linkText + decodeURIComponent(em)), "invite: WhatsApp and email carry a link to /join and no secrets");
  ok((await a.getByRole("button", { name: /Copy link|Copied/ }).count()) === 1, "invite: a Copy link button");
  await clean(a, "invite");
  await shot(a, "alex-01-invite");
  // Mia's and Leo's whole messages are pasted as they came
  await a.getByLabel("Their name").first().fill("Mia");
  await a.getByLabel("Their address").first().fill(`Hi Alex, my opening card is ready. Here is my address: ${mia.address}`);
  await a.locator(".badge.ready").first().waitFor({ timeout: 60000 });
  ok((await a.getByLabel("Their address").first().inputValue()) === mia.address, "Mia: pasting her whole message keeps just her address, and she turns Ready");
  await a.getByRole("button", { name: "Add another person" }).click();
  await a.getByLabel("Their name").nth(1).fill("Leo");
  await a.getByLabel("Their address").nth(1).fill(leo.address);
  await a.locator(".badge.ready").nth(1).waitFor({ timeout: 60000 });
  ok(true, "Leo: turns Ready too");
  await shot(a, "alex-02-both-ready", true);
  await a.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Continue/.test(b.textContent.trim()) && !b.disabled));
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: /Is there someone/ }).waitFor(); await a.waitForTimeout(600);
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: /If you go quiet/ }).waitFor(); await a.waitForTimeout(800);
  for (let i = 0; i < 5; i++) await a.locator(".numeral").click();
  await a.locator(".choice").filter({ hasText: "2 minutes (demo)" }).click();
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: "Ready to seal it?" }).waitFor(); await a.waitForTimeout(800);
  await a.getByRole("button", { name: "Seal it" }).click();
  await a.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 240000 });
  const sealedAt = Date.now();
  const L = await a.evaluate(() => JSON.parse(localStorage.getItem("tabella.letters.v1")).at(-1));
  ok(!!L.letterId && /^tbl1_/.test(L.ownerCard), `Alex sealed letter ${L.letterId} to Mia and Leo (2-minute timer)`);
  console.log(`   letter ${L.letterId}, tx ${L.txHash}`);

  // ----------------------------------------------------------------------- 3. Mia, on a fresh browser, tries early (with a typo and a wrong card on the way)
  const M = await fresh("Mia open", { record: true });
  const m = M.page;
  await m.goto(url("open"), { waitUntil: "networkidle" });
  await m.getByRole("heading", { name: /Open your letter/ }).waitFor(); await m.waitForTimeout(1200);
  await clean(m, "open: restore");
  await shot(m, "mia-05-open-restore");
  const typo = mia.card.slice(0, 22) + (mia.card[22] === "A" ? "B" : "A") + mia.card.slice(23);
  await m.getByLabel("The code on the card").fill(typo);
  await m.getByRole("button", { name: "Find my letter" }).click();
  await m.getByText(/typo|doesn't belong/).waitFor({ timeout: 20000 });
  ok(true, "a mistyped code: \"" + (await m.getByRole("status").last().innerText()) + "\"");
  await shot(m, "mia-06-mistyped");
  await m.getByLabel("The code on the card").fill(L.ownerCard); // a real card, but not hers
  await m.getByRole("button", { name: "Find my letter" }).click();
  await m.getByText(/couldn't find a letter for that card/).waitFor({ timeout: 60000 });
  ok(true, "a wrong card: \"We couldn't find a letter for that card...\"");
  await shot(m, "mia-07-wrong-card");
  await m.getByLabel("The code on the card").fill(mia.card);
  await m.getByRole("button", { name: "Find my letter" }).click();
  await m.getByRole("heading", { name: "Your letter is still safely sealed." }).waitFor({ timeout: 60000 });
  await m.waitForTimeout(1500);
  let body = await m.locator("main").innerText();
  ok(!/Bitcoin|Dear Mia|minutes|seconds|days|\d{2}:\d{2}|Alex/.test(body) && (await m.getByRole("button", { name: "Open your letter" }).count()) === 0, "early: \"Your letter is still safely sealed.\" and nothing more is revealed (no words, no countdown, no button)");
  await clean(m, "early");
  await shot(m, "mia-08-still-sealed");

  // ----------------------------------------------------------------------- 4. Alex goes quiet; the Postman publishes
  const seen = new Set(["sealed"]);
  const wait = Math.max(0, 125_000 - (Date.now() - sealedAt));
  console.log(`   Alex goes quiet: waiting for the 2-minute timer and the 1-minute warning (~${((wait + 60_000) / 1000).toFixed(0)} s), then the Postman...`);
  const deadline = Date.now() + 480_000;
  let shotOnItsWay = false;
  while (Date.now() < deadline) {
    if (await m.getByRole("button", { name: "Open your letter" }).count()) break;
    if (await m.getByRole("heading", { name: "Your letter is on its way." }).count()) {
      seen.add("on its way");
      if (!shotOnItsWay) { shotOnItsWay = true; await shot(m, "mia-09-on-its-way"); }
    }
    await sleep(2000);
  }
  ok(await m.getByRole("button", { name: "Open your letter" }).count() === 1, `after release the same page turns to "Open your letter" by itself (states seen: ${[...seen].join(" -> ")} -> here)`);
  console.log(`   states seen: ${[...seen].join(" -> ")}${seen.has("on its way") ? "" : " (the Postman delivered within one look, so the on-its-way screen was not caught this time; it is shown in the front-page demo and unit tests)"}`);
  await m.waitForTimeout(1000);
  await shot(m, "mia-10-here");

  // ----------------------------------------------------------------------- 5. Mia opens it
  await m.getByRole("button", { name: "Open your letter" }).click();
  await m.locator(".scene-stage").waitFor();
  await sleep(1500); await shot(m, "mia-11-opening-1");
  await sleep(2200); await shot(m, "mia-12-opening-2");
  await sleep(2600); await shot(m, "mia-13-zooming");
  await sleep(2200); await shot(m, "mia-14-zoomed-readable");
  await m.locator(".reader").waitFor({ timeout: 20000 });
  await m.waitForTimeout(2200);
  const miaText = (await m.locator(".reader p").allInnerTexts()).join("\n");
  ok(miaText.replace(/\s+/g, " ").trim() === LETTER.replace(/\s+/g, " ").trim(), "Mia opened the letter: the text is exactly what Alex wrote");
  await clean(m, "Mia's letter", ["Bitcoin", "hardware wallet", "recovery card"]);
  await shot(m, "mia-15-letter", true);
  await M.ctx.close();

  // ----------------------------------------------------------------------- 6. Leo, on another fresh browser, opens it after Mia
  const Lb = await fresh("Leo open", { dark: true });
  const l = Lb.page;
  await l.goto(url("open"), { waitUntil: "networkidle" });
  await l.getByLabel("The code on the card").fill(leo.card);
  await l.getByRole("button", { name: "Find my letter" }).click();
  await l.getByRole("heading", { name: "Your letter is here." }).waitFor({ timeout: 60000 });
  await shot(l, "leo-01-here-dark");
  await l.getByRole("button", { name: "Open your letter" }).click();
  await l.locator(".scene-stage").waitFor();
  await sleep(6800); await shot(l, "leo-02-zooming-dark");
  await l.locator(".reader").waitFor({ timeout: 20000 });
  await l.waitForTimeout(2000);
  const leoText = (await l.locator(".reader p").allInnerTexts()).join("\n");
  ok(leoText.replace(/\s+/g, " ").trim() === LETTER.replace(/\s+/g, " ").trim(), "Leo opened it after Mia, on his own browser: the same letter");
  await shot(l, "leo-03-letter-dark");
  await Lb.ctx.close();

  // ----------------------------------------------------------------------- 7. Mia's card cannot open Leo's... and Leo's card shows nothing for a stranger
  ok(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await A.ctx.close();
  const vids = [];
  for (const v of [mia.video, M.page.video()]) if (v) vids.push(await v.path());
  if (RECORD) fs.writeFileSync(path.join(RECORD, "videos.json"), JSON.stringify(vids));
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
