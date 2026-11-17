/**
 * "Keep it a surprise", end to end on testnet with the 2-minute demo timer, through the real screens, on separate fresh browsers:
 *   Alex seals a letter for Mia (email, phone, a private question and answer) with Sofia as a backup (her own question);
 *   the card is made, funded and registered by the browser; nothing secret is kept on Alex's device;
 *   Mia tries /open?letter=<id> early ("still safely sealed"); Alex goes quiet; the Postman publishes and starts its ladder;
 *   Mia gets wrong answers (kind messages, a slow-down), then the right one (different case and spaces) and opens the letter;
 *   Sofia, on another browser, answers her own question, then both "Send it to Mia" and "Open it with Mia" work.
 * Email only for now: with RESEND_API_KEY on the helper and TEST_EMAIL set, the first email really goes to that inbox at release.
 * Without a key the ladder waits ("waiting, no message channel is set up yet"); contacts on example.com are never sent to.
 *   cd app && npm run build && npx vite preview --port 5173 &
 *   node e2e/surprise.cjs [baseUrl] [outDir]      RECORD=<dir> records Mia's browser
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "screenshots", "ui-10");
fs.mkdirSync(OUT, { recursive: true });
const FORBIDDEN = /\b(ML-?KEM|ML-?DSA|KEM|DSA|ciphertext|encrypt\w*|decrypt\w*|signature|sign(ed|ing)?|mnemonic|seed|hash\w*|nonce|gas|blockchain|on-?chain|smart contract|private key|public key|keys?|token|crypto\w*|ethereum|solidity|argon\w*|scrypt)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const LETTER = "Dear Mia,\n\nThe blue folder in my desk has everything. Look after Sofia, and let her look after you.\n\nAll my love, Alex.";
// TEST_EMAIL=you@gmail.com makes the helper send the real emails to YOUR inbox (Mia gets you@..., Sofia gets you+sofia@... ). Without it the
// contacts are on a reserved domain (example.com): the helper never sends to those, so a test never reaches anyone.
const TEST_EMAIL = (process.env.TEST_EMAIL || "").trim();
const plus = (e, tag) => e.replace("@", `+${tag}@`);
const MIA = { name: "Mia", email: TEST_EMAIL || "mia.demo@example.com", phone: "", question: "What did we call the little boat?", answer: "Blue Heron" };
// The backup's address: with Resend's test sender only the account's own address can receive, so TEST_BACKUP_EMAIL may be the same inbox.
const SOFIA = { name: "Sofia", rel: "her oldest friend", email: (process.env.TEST_BACKUP_EMAIL || "").trim() || (TEST_EMAIL ? plus(TEST_EMAIL, "sofia") : "sofia.demo@example.com"), phone: "", question: "Where did we first meet?", answer: "The Lighthouse Cafe" };
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
    return { ctx, page };
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
  const text = async (p) => (await p.locator(".reader p").allInnerTexts()).join("\n").replace(/\s+/g, " ").trim();
  const same = (a) => a === LETTER.replace(/\s+/g, " ").trim();

  // ----------------------------------------------------------------- 1. Alex
  const A = await fresh("Alex");
  const a = A.page;
  await a.goto(url("write?demo"), { waitUntil: "networkidle" });
  await a.getByLabel("Your letter").fill(LETTER);
  await a.getByLabel("Your first name (optional)").fill("Alex");
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: "Alex, who should read this one day?" }).waitFor(); await a.waitForTimeout(1000);
  ok(await a.getByRole("radio", { name: /Keep it a surprise/ }).isChecked(), '"Keep it a surprise" is the main option, already chosen');
  ok(await a.getByRole("radio", { name: /Invite someone/ }).count() === 1, '"Invite someone" is the second option');
  const choices = await a.locator(".choice strong").allInnerTexts();
  ok(choices[0] === "Keep it a surprise" && choices[1] === "Invite someone", `the order is surprise first, invite second (${choices.join(" | ")})`);
  await clean(a, "who (surprise)");
  await shot(a, "alex-01-who-surprise", true);
  // too little: Continue shows what is missing
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByText("Add a first name.").first().waitFor();
  ok(true, "Continue with nothing filled in says what is missing, kindly");
  await a.locator("#r-name").fill(MIA.name);
  await a.locator("#r-email").fill(MIA.email);
  ok(await a.getByText("Text and call reminders coming soon.").count() >= 1, 'the phone number is optional, with the note "Text and call reminders coming soon."');
  await a.locator("#r-q").fill(MIA.question);
  await a.locator("#r-a").fill(MIA.answer);
  ok(await a.getByText("Pick something only Mia would know, not something online.").count() >= 1, 'the hint "Pick something only they\'d know, not something online."');
  await a.getByRole("button", { name: /Add someone you trust/ }).click();
  await a.locator("#b0-name").fill(SOFIA.name);
  await a.locator("#b0-rel").fill(SOFIA.rel);
  await a.locator("#b0-email").fill(SOFIA.email);
  await a.locator("#b0-q").fill(SOFIA.question);
  await a.locator("#b0-a").fill(SOFIA.answer);
  const honest = await a.locator(".honest").innerText();
  ok(/only lock on delivery/.test(honest) && /depends on our service running/.test(honest) && /stored privately, for delivery only/.test(honest) && /by email/.test(honest), "the honest copy: answers are the only lock, delivery depends on our service, contacts stored privately for delivery only, email for now");
  await shot(a, "alex-02-who-filled", true);
  // the draft on this device never keeps an answer
  const draftRaw = await a.evaluate(() => localStorage.getItem("tabella.draft.v1"));
  ok(!!draftRaw && !draftRaw.includes(MIA.answer) && !draftRaw.includes(SOFIA.answer), "the draft saved on this device holds no answers");
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: /Is there someone/ }).waitFor(); await a.waitForTimeout(700);
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: /If you go quiet/ }).waitFor(); await a.waitForTimeout(800);
  for (let i = 0; i < 5; i++) await a.locator(".numeral").click();
  await a.locator(".choice").filter({ hasText: "2 minutes (demo)" }).click();
  await a.getByRole("button", { name: /^Continue/ }).click();
  await a.getByRole("heading", { name: "Ready to seal it?" }).waitFor(); await a.waitForTimeout(3000);
  const pills = (await a.locator(".pills .pill").allInnerTexts()).join(" | ");
  ok(/Mia · surprise \+ 1 backup/.test(pills), `the pills say it (${pills})`);
  await shot(a, "alex-03-ready-to-seal");
  await a.getByRole("button", { name: "Seal it" }).click();
  console.log("... the browser makes Mia's card, the helper funds it, the key is registered, the card is locked with each answer, then sealed");
  const steps = new Set();
  const watch = setInterval(async () => { try { steps.add(await a.locator(".status-line").first().innerText()); } catch {} }, 700);
  await a.getByRole("heading", { name: "Sealed." }).waitFor({ timeout: 300000 });
  clearInterval(watch);
  const sealedAt = Date.now();
  console.log(`   progress shown: ${[...steps].filter(Boolean).join(" -> ")}`);
  const L = await a.evaluate(() => JSON.parse(localStorage.getItem("tabella.letters.v1")).at(-1));
  ok(!!L.letterId && L.surprise && L.surprise.backups === 1, `Alex sealed letter ${L.letterId} (2-minute timer), with 1 backup`);
  await a.waitForTimeout(3500);
  const done = await a.locator("main").innerText();
  ok(/we'll find Mia by email/.test(done) && /your backup person/.test(done), "the sealed screen says how Mia will be found");
  await shot(a, "alex-04-sealed", true);
  // nothing secret is left on this device: the recipient's card was never saved, no answer anywhere
  const everything = await a.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  const cards = (everything.match(/tbl1_[A-Za-z0-9_-]+/g) || []);
  const mine = new Set([L.ownerCard]);
  ok(cards.every((c) => mine.has(c)) && !everything.includes(MIA.answer) && !everything.includes(SOFIA.answer) && !everything.includes("Heron"), `this device holds only Alex's own card (${cards.length} card code(s) found, none is Mia's), and no answers`);
  console.log(`   letter ${L.letterId}, tx ${L.txHash}`);

  // ----------------------------------------------------------------- 2. Mia, early
  const M = await fresh("Mia", { record: true });
  const m = M.page;
  await m.goto(url(`open?letter=${L.letterId}`), { waitUntil: "networkidle" });
  await m.getByRole("heading", { name: "Your letter is still safely sealed." }).waitFor({ timeout: 60000 });
  await m.waitForTimeout(1200);
  const early = await m.locator("main").innerText();
  ok(!/What did we call|One question|Mia|Dear|blue folder|Open it/.test(early), "early: only \"Your letter is still safely sealed.\": no question, no name, no button");
  await clean(m, "early");
  await shot(m, "mia-01-still-sealed");

  // ----------------------------------------------------------------- 3. Alex goes quiet; the Postman publishes
  const deadline = Date.now() + 480_000;
  let sawOnItsWay = false;
  console.log("   Alex goes quiet: waiting for the 2-minute timer, the 1-minute warning and the Postman...");
  while (Date.now() < deadline) {
    if (await m.getByRole("heading", { name: "One question" }).count()) break;
    if (await m.getByRole("heading", { name: "Your letter is on its way." }).count()) sawOnItsWay = true;
    await sleep(2000);
  }
  await m.getByRole("heading", { name: "One question" }).waitFor({ timeout: 10000 });
  const releasedAfter = Date.now();
  console.log(`   released after ${((Date.now() - sealedAt) / 1000).toFixed(0)} s (on its way seen: ${sawOnItsWay})`);
  await m.waitForTimeout(800);
  if (process.env.WAIT_FOR_LADDER) {
    // let the whole email ladder run: the first email at release, the reminder after 2 minutes, the backup after 4
    console.log("   waiting ~4.7 minutes so the reminder and the backup's email are sent too (check the inbox)...");
    await sleep(285_000);
    await m.reload({ waitUntil: "networkidle" });
    await m.getByRole("heading", { name: "One question" }).waitFor({ timeout: 60000 });
  }
  ok((await m.locator(".question").innerText()) === MIA.question, "after release, Mia is asked her own question");
  ok(!(await m.locator("main").innerText()).includes(SOFIA.question), "Mia does not see Sofia's question (there is no choice to make until backups matter)");
  await clean(m, "question");
  await shot(m, "mia-02-question");

  // ----------------------------------------------------------------- 4. wrong answers: kind, and slower each time
  const openBtn = m.getByRole("button", { name: "Open it", exact: true });
  const msgs = [];
  for (let i = 0; i < 3; i++) {
    await m.locator("#answer").fill(["red kite", "Blue Jay", "heron blue"][i]);
    await openBtn.click();
    await m.getByText(/Take your time|Not this time|Still not right|Not yet/).waitFor({ timeout: 20000 });
    msgs.push((await m.getByRole("status").last().innerText()).trim());
    if (i === 0) await shot(m, "mia-03-wrong-answer");
    if (i < 2) { await m.waitForFunction(() => !document.querySelector("button[disabled]") || true); }
    // a slow-down: the button waits a few seconds after the second wrong answer
    if (i >= 1) {
      const disabled = await openBtn.isDisabled();
      ok(disabled, `wrong answer ${i + 1}: the button waits a moment before another try`);
      await m.locator("#answer").fill(["", "", "x"][i] ? "x" : "x");
      await m.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Open it"); return b && !b.disabled; }, null, { timeout: 90000 });
    }
  }
  ok(new Set(msgs.map((x) => x.replace(/\s*\(\d+\)$/, ""))).size >= 2 && msgs.every((x) => !/wrong|incorrect|invalid|error|fail/i.test(x)), `wrong answers get kind, varied messages (${msgs.map((x) => `"${x}"`).join("; ")})`);
  await shot(m, "mia-04-slow-down");

  // ----------------------------------------------------------------- 5. the right answer, in a different case and with extra spaces
  await m.locator("#answer").fill("  BLUE   heron ");
  await openBtn.click();
  await m.locator(".scene-stage").waitFor({ timeout: 30000 });
  ok(true, "the right answer (different case, extra spaces) plays the envelope scene");
  await sleep(2600); await shot(m, "mia-05-opening");
  await m.locator(".reader").waitFor({ timeout: 20000 });
  await m.waitForTimeout(1800);
  ok(same(await text(m)), "Mia opened the letter: exactly what Alex wrote");
  await clean(m, "Mia's letter", ["blue folder"]);
  await shot(m, "mia-06-letter", true);
  await M.ctx.close();

  // ----------------------------------------------------------------- 6. Sofia, the backup, on another fresh browser
  const S = await fresh("Sofia", { dark: true });
  const s = S.page;
  await s.goto(url(`open?letter=${L.letterId}`), { waitUntil: "networkidle" });
  await s.getByRole("heading", { name: "One question" }).waitFor({ timeout: 60000 });
  await s.getByRole("radio", { name: /I'm Sofia, helping Mia/ }).check();
  await s.waitForTimeout(600);
  ok((await s.locator(".question").innerText()) === SOFIA.question, "Sofia is asked her own question");
  await shot(s, "sofia-01-question-dark");
  await s.locator("#answer").fill("Mia's cafe"); // wrong
  await s.getByRole("button", { name: "Open it", exact: true }).click();
  await s.getByText(/Take your time/).waitFor({ timeout: 20000 });
  await s.locator("#answer").fill("the lighthouse CAFE");
  await s.getByRole("button", { name: "Open it", exact: true }).click();
  await s.getByRole("heading", { name: "Thank you, Sofia." }).waitFor({ timeout: 30000 });
  ok(await s.getByRole("button", { name: "Open it with Mia" }).isVisible() && await s.getByRole("button", { name: "Send it to Mia" }).isVisible(), 'a backup gets "Open it with Mia" and "Send it to Mia"');
  await shot(s, "sofia-02-options-dark");
  await s.getByRole("button", { name: "Send it to Mia" }).click();
  await s.getByRole("group", { name: "Send it to Mia" }).waitFor();
  const wa = decodeURIComponent((await s.getByRole("link", { name: "WhatsApp" }).getAttribute("href")) || "");
  ok(/tbl1_/.test(wa) && /\/open/.test(wa), "\"Send it to Mia\" shares her opening card and the way to use it");
  ok(/send it only to Mia/i.test(await s.locator("main").innerText()), "and says to send it only to Mia");
  await shot(s, "sofia-03-send-dark");
  await s.getByRole("button", { name: "Back" }).click();
  await s.getByRole("button", { name: "Open it with Mia" }).click();
  await s.locator(".scene-stage").waitFor({ timeout: 30000 });
  await s.locator(".reader").waitFor({ timeout: 30000 });
  await s.waitForTimeout(1500);
  ok(same(await text(s)), "Sofia opened it with Mia: the same letter");
  await shot(s, "sofia-04-letter-dark");
  await S.ctx.close();

  ok(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  await A.ctx.close();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  console.log(`letter ${L.letterId}: check the helper's log for "the ladder starts" ... "opened, the ladder stops"`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
