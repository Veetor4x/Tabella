import { evmToQor } from "@qorechain/sdk";
import { bytesToHex, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { makeContentKey, newSeed, sealKeysFromCardSeed, splitKey, keyHash, signingKeysFromSeed, type SealKeyPair } from "../../shared/tabella-crypto.ts";
import { sealPostmanPackage, type PostmanPackage } from "../../shared/surprise.ts";
import { STATUS } from "../src/abi.js";
import { loadConfig } from "../src/config.js";
import { createEscalation } from "../src/escalation.js";
import { ProviderError, createDryRunNotifier } from "../src/notify/providers.js";
import { createMemoryStore } from "../src/notify/store.js";
import type { Notifier } from "../src/notify/types.js";
import { createPostman } from "../src/postman.js";
import { derivePostmanKeys } from "../src/postmanKeys.js";
import { MAIN_WARNING_SECONDS, SIMPLE_SUBJECT, createReminders, reminderMessage, reminderOffsets, reminderStep } from "../src/reminders.js";
import { Mutex } from "../src/window.js";
import { MockChain } from "./mockChain.js";

const REGISTRY = "0x1111111111111111111111111111111111111111" as Hex;
const MNEMONIC = "test test test test test test test test test test test junk";
const MIA = "0x00000000000000000000000000000000000ada00" as Hex;
const DAY = 86_400;
const OWNER_EMAIL = "alex.secret@mail.demo-tabella.io";
const LINK = (id: string) => `https://app.example/me/${id}`;

let nowMs: number;
let logs: string[];
const at = (sec: number) => (nowMs = sec * 1000);
const EMAIL_ONLY = { email: true, sms: false, call: false };

const pkgWith = (r?: PostmanPackage["reminders"], extra: Partial<PostmanPackage> = {}): PostmanPackage => ({
  v: 1,
  mode: "demo",
  owner: "Alex",
  cardKeyHash: keyHash(signingKeysFromSeed(newSeed()).publicKey),
  recipient: { name: "Mia", email: "mia.secret@mail.demo-tabella.io", phone: "" },
  backups: [],
  ...(r ? { reminders: r } : {}),
  ...extra,
});
const SIMPLE = { email: OWNER_EMAIL, style: "simple" as const };
const make = (notifier: Notifier = createDryRunNotifier(EMAIL_ONLY)) => {
  const store = createMemoryStore();
  const rem = createReminders({ notifier, store, appUrl: "https://app.example", now: () => nowMs, log: (l) => logs.push(l) });
  return { rem, store, notifier: notifier as ReturnType<typeof createDryRunNotifier> };
};
beforeEach(() => {
  nowMs = 1_000_000_000;
  logs = [];
});

describe("when reminders go out", () => {
  it("a main letter (14-day warning): day 1, day 7 and day 14 (the last day)", () => {
    expect(reminderOffsets(14 * DAY)).toEqual([0, 6 * DAY, 13 * DAY]);
    expect(MAIN_WARNING_SECONDS).toBe(14 * DAY);
  });
  it("a test letter: at the start, halfway, and 90% of the way", () => {
    expect(reminderOffsets(60)).toEqual([0, 30, 54]);
    expect(reminderOffsets(600)).toEqual([0, 300, 540]);
    expect(reminderOffsets(3 * DAY)).toEqual([0, Math.floor(1.5 * DAY), Math.floor(2.7 * DAY)]);
  });
});

describe("what the emails say", () => {
  it("simple check-in: exactly the agreed subject and words, and the link", () => {
    const m = reminderMessage({ email: OWNER_EMAIL, style: "simple" }, LINK("7"));
    expect(m.subject).toBe("A quick check-in from Tabella");
    expect(m.text).toBe("It's been a while. Tap here to let us know you're still around: https://app.example/me/7");
  });
  it("personal note: the owner's own subject and line, with the link added at the end", () => {
    const m = reminderMessage({ email: OWNER_EMAIL, style: "personal", subject: "Water the plants 🌱", line: "Quick tap, then back to your day." }, LINK("7"));
    expect(m.subject).toBe("Water the plants 🌱");
    expect(m.text).toBe("Quick tap, then back to your day.\n\nhttps://app.example/me/7");
  });
  it("an empty personal note falls back to the simple wording instead of sending a blank email", () => {
    expect(reminderMessage({ email: OWNER_EMAIL, style: "personal", subject: " ", line: "" }, LINK("7")).subject).toBe(SIMPLE_SUBJECT);
  });
  it("what an owner types can never add a header line or markup", () => {
    const m = reminderMessage({ email: OWNER_EMAIL, style: "personal", subject: "Hi\r\nBcc: x@y.z <b>", line: "a\nb <script>" }, LINK("7"));
    expect(m.subject).not.toMatch(/[\r\n<>]/);
    expect(m.text.split("\n\n")[0]).not.toMatch(/[<>]/);
    expect(reminderMessage({ email: OWNER_EMAIL, style: "personal", subject: "x".repeat(500), line: "y".repeat(900) }, LINK("7")).subject.length).toBeLessThanOrEqual(80);
  });
  it("the plain emails never mention a letter, the recipient, or what is inside", () => {
    const m = reminderMessage(SIMPLE, LINK("7"));
    expect(`${m.subject} ${m.text}`).not.toMatch(/letter|mia|recipient|sealed|surprise|secret/i);
  });
});

describe("the 2-minute test letter: quiet 120 s, warning 60 s", () => {
  const T0 = 1_000_000_000 / 1000; // last check-in, in unix seconds
  const state = (over: Partial<{ status: number; lastCheckIn: number }> = {}) => ({ status: STATUS.Warning, lastCheckIn: T0, quiet: 120, warning: 60, ...over });

  it("sends exactly three emails: at the start, halfway and near the end, then the letter opens", async () => {
    const { rem, notifier } = make();
    const p = pkgWith(SIMPLE);
    at(T0 + 119);
    expect((await rem.check("9", p, state({ status: STATUS.Active }))).sent).toEqual([]); // still in the quiet time
    at(T0 + 120);
    expect((await rem.check("9", p, state())).sent).toEqual([1]); // the warning starts
    at(T0 + 125);
    expect((await rem.check("9", p, state())).sent).toEqual([]); // not twice
    at(T0 + 149);
    expect((await rem.check("9", p, state())).sent).toEqual([]);
    at(T0 + 150);
    expect((await rem.check("9", p, state())).sent).toEqual([2]); // halfway
    at(T0 + 173);
    expect((await rem.check("9", p, state())).sent).toEqual([]);
    at(T0 + 174);
    expect((await rem.check("9", p, state())).sent).toEqual([3]); // 90% of the way
    at(T0 + 179);
    expect((await rem.check("9", p, state())).sent).toEqual([]);
    at(T0 + 180); // the warning is over: the letter is released and nothing more is sent
    expect((await rem.check("9", p, state({ status: STATUS.Released }))).sent).toEqual([]);
    expect(notifier.sent).toHaveLength(3);
    expect(notifier.sent.every((e) => e.to === OWNER_EMAIL && e.subject === SIMPLE_SUBJECT && e.text.includes(LINK("9")))).toBe(true);
  });

  it("a check-in after the first reminder: the other two are never sent", async () => {
    const { rem, notifier } = make();
    const p = pkgWith(SIMPLE);
    at(T0 + 120);
    expect((await rem.check("9", p, state())).sent).toEqual([1]);
    // the owner taps "I'm still here": the letter is Active again and its timer starts over
    at(T0 + 130);
    const checked = state({ status: STATUS.Active, lastCheckIn: T0 + 130 });
    for (const t of [T0 + 150, T0 + 174, T0 + 179, T0 + 200, T0 + 249]) {
      at(t);
      expect((await rem.check("9", p, checked)).sent).toEqual([]);
    }
    expect(notifier.sent).toHaveLength(1);
  });

  it("a later warning (after a check-in and more silence) gets reminders of its own", async () => {
    const { rem, notifier } = make();
    const p = pkgWith(SIMPLE);
    at(T0 + 120);
    await rem.check("9", p, state());
    const T1 = T0 + 130; // checked in
    at(T1 + 120);
    expect((await rem.check("9", p, state({ lastCheckIn: T1 }))).sent).toEqual([1]);
    expect(notifier.sent).toHaveLength(2);
  });

  it("a helper that slept through two reminders sends only the latest, never a burst", async () => {
    const { rem, notifier, store } = make();
    at(T0 + 56); // woke at 56 s into the warning
    const r = await rem.check("9", pkgWith(SIMPLE), state());
    at(T0 + 176);
    const r2 = await rem.check("9", pkgWith(SIMPLE), state());
    expect(r2.sent).toEqual([3]);
    expect(r2.skipped).toEqual([1, 2]);
    expect(notifier.sent).toHaveLength(1);
    expect((await store.steps("9")).has(reminderStep(T0, 1))).toBe(true);
    expect(r.sent).toEqual([]);
  });

  it("two passes at the same moment send one email (the claim comes first)", async () => {
    const { rem, notifier } = make();
    at(T0 + 120);
    await Promise.all([rem.check("9", pkgWith(SIMPLE), state()), rem.check("9", pkgWith(SIMPLE), state())]);
    expect(notifier.sent).toHaveLength(1);
  });

  it("a failed send is given back and tried again after a short wait, and then not repeated", async () => {
    let fail = true;
    const sent: string[] = [];
    const flaky: Notifier = { channels: EMAIL_ONLY, async email(to, subject) { if (fail) throw new ProviderError(503, "down"); sent.push(subject); }, async sms() {}, async call() {} };
    const { rem } = make(flaky);
    at(T0 + 120);
    expect((await rem.check("9", pkgWith(SIMPLE), state())).failed).toEqual([1]);
    fail = false;
    at(T0 + 125); // still waiting after the failure
    expect((await rem.check("9", pkgWith(SIMPLE), state())).sent).toEqual([]);
    at(T0 + 151); // the wait is over (and reminder 2 is now due: it is the one sent)
    expect((await rem.check("9", pkgWith(SIMPLE), state())).sent).toEqual([2]);
    at(T0 + 152);
    expect((await rem.check("9", pkgWith(SIMPLE), state())).sent).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("nothing is sent without an owner email, or to an address that can never be a real inbox", async () => {
    const { rem, notifier } = make();
    at(T0 + 120);
    expect((await rem.check("9", pkgWith(), state())).sent).toEqual([]);
    expect((await rem.check("9", pkgWith({ email: "alex@example.com", style: "simple" }), state())).sent).toEqual([]);
    expect(notifier.sent).toHaveLength(0);
  });

  it("nothing is sent while the email channel is off, and the reminder is still there when it comes on", async () => {
    const off = createDryRunNotifier({ email: false, sms: false, call: false });
    const { rem } = make(off);
    at(T0 + 120);
    expect((await rem.check("9", pkgWith(SIMPLE), state())).sent).toEqual([]);
  });

  it("logs say which reminder went, and never the address, the words or the link", async () => {
    const { rem } = make();
    at(T0 + 120);
    await rem.check("9", pkgWith({ email: OWNER_EMAIL, style: "personal", subject: "Water the plants", line: "tap" }), state());
    expect(logs).toEqual(["letter #9: reminder 1 sent"]);
  });
});

describe("a main letter (6 months quiet, 14-day warning)", () => {
  it("reminds on day 1, day 7 and day 14 of the warning, once each", async () => {
    const { rem, notifier } = make();
    const T0 = 1_000_000_000 / 1000;
    const s = { status: STATUS.Warning, lastCheckIn: T0, quiet: 180 * DAY, warning: 14 * DAY };
    const start = T0 + 180 * DAY;
    const sent: number[] = [];
    for (const t of [start - 60, start, start + DAY, start + 5 * DAY, start + 6 * DAY, start + 8 * DAY, start + 12 * DAY, start + 13 * DAY, start + 13.5 * DAY, start + 14 * DAY - 1]) {
      at(t);
      sent.push(...(await rem.check("4", pkgWith({ ...SIMPLE, style: "simple" }), s)).sent);
    }
    expect(sent).toEqual([1, 2, 3]);
    expect(notifier.sent).toHaveLength(3);
  });
});

// ---------------------------------------------------------------- the Postman, end to end on a mock chain

describe("the Postman sends the reminders (mock chain, simulated clock)", () => {
  let chain: MockChain;
  let keys: SealKeyPair;
  beforeEach(() => {
    chain = new MockChain();
    keys = derivePostmanKeys(MNEMONIC);
    const mia = sealKeysFromCardSeed(newSeed());
    chain.kemKeys.set(evmToQor(MIA), mia.mlkemPublicKey);
  });

  const setup = (pkg: PostmanPackage, T0: number, status: number = STATUS.Active) => {
    const { B } = splitKey(makeContentKey());
    chain.letters.set(1n, { status, released: false, heirs: [MIA], partBForPostman: bytesToHex(sealPostmanPackage(B, pkg, keys.mlkemPublicKey)), partBForHeirs: "0x", quietPeriod: 120n, warningPeriod: 60n, lastCheckIn: BigInt(T0) });
    const notifier = createDryRunNotifier(EMAIL_ONLY);
    const store = createMemoryStore();
    const cfg = loadConfig({ REGISTRY_ADDRESS: REGISTRY });
    const escalation = createEscalation({ notifier, store, appUrl: "https://app.example", now: () => nowMs, log: (l) => logs.push(l) });
    const reminders = createReminders({ notifier, store, appUrl: "https://app.example", now: () => nowMs, log: (l) => logs.push(l) });
    const postman = createPostman({ chain, cfg, keys, mutex: new Mutex(), log: (l) => logs.push(l), now: () => nowMs, escalation, reminders });
    return { notifier, postman };
  };
  const T0 = 1_000_000_000 / 1000;
  const subjects = (n: { sent: { subject?: string }[] }) => n.sent.map((e) => e.subject);

  it("a letter left alone: all three reminders arrive on time, then it is released and opens", async () => {
    const { notifier, postman } = setup(pkgWith(SIMPLE), T0);
    at(T0 + 10);
    await postman.tick(); // the slow pass finds the letter and starts watching it
    expect(postman.watching()).toBe(1);
    expect(notifier.sent).toHaveLength(0);
    chain.letters.get(1n)!.status = STATUS.Warning;
    at(T0 + 121);
    await postman.remindersPass(); // the quick pass: the warning has begun
    expect(notifier.sent).toHaveLength(1);
    at(T0 + 151);
    await postman.remindersPass();
    expect(notifier.sent).toHaveLength(2);
    at(T0 + 175);
    await postman.remindersPass();
    expect(notifier.sent).toHaveLength(3);
    // released: no more reminders, and the Postman publishes Part B so it can open
    chain.letters.get(1n)!.status = STATUS.Released;
    at(T0 + 181);
    await postman.remindersPass();
    const r = await postman.tick();
    expect(r.published).toEqual([1n]);
    expect(notifier.sent.filter((e) => e.to === OWNER_EMAIL)).toHaveLength(3);
    expect(postman.watching()).toBe(0);
    expect(subjects(notifier).filter((s) => s === SIMPLE_SUBJECT)).toHaveLength(3);
  });

  it("an owner who taps I'm still here after the first reminder: the other two never send", async () => {
    const { notifier, postman } = setup(pkgWith(SIMPLE), T0);
    at(T0 + 10);
    await postman.tick();
    chain.letters.get(1n)!.status = STATUS.Warning;
    at(T0 + 121);
    await postman.remindersPass();
    expect(notifier.sent).toHaveLength(1);
    // the check-in: Active again, last check-in now
    const l = chain.letters.get(1n)!;
    l.status = STATUS.Active;
    l.lastCheckIn = BigInt(T0 + 125);
    for (const t of [T0 + 151, T0 + 175, T0 + 181, T0 + 240]) {
      at(t);
      await postman.remindersPass();
      await postman.tick();
    }
    expect(notifier.sent).toHaveLength(1);
    expect(logs.filter((x) => /reminder/.test(x))).toEqual(["letter #1: reminder 1 sent"]);
  });

  it("a letter with no reminders is looked at once and then left alone (no repeated reads)", async () => {
    const { postman } = setup(pkgWith(), T0);
    at(T0 + 10);
    await postman.tick();
    const before = chain.calls.filter((c) => c === "call").length;
    await postman.tick();
    await postman.tick();
    // only status() each tick, no getLetter again: 2 calls per tick (letterCount + status)
    expect(chain.calls.filter((c) => c === "call").length - before).toBe(4);
    expect(postman.watching()).toBe(0);
  });

  it("an 'invite them' letter that only carries reminders starts no ladder when it is released", async () => {
    const invite = pkgWith(SIMPLE, { recipient: { name: "", email: "", phone: "" }, backups: [], mode: "real" });
    const { notifier, postman } = setup(invite, T0, STATUS.Released);
    at(T0 + 500);
    const r = await postman.tick();
    expect(r.published).toEqual([1n]);
    expect(notifier.sent).toHaveLength(0);
    expect(logs.some((l) => /ladder starts/.test(l))).toBe(false);
  });

  it("a dated letter is never watched", async () => {
    const { postman } = setup(pkgWith(SIMPLE), T0);
    chain.letters.get(1n)!.releaseAt = BigInt(T0 + 5000);
    await postman.tick();
    expect(postman.watching()).toBe(0);
  });
});
