import { evmToQor } from "@qorechain/sdk";
import { bytesToHex, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { makeContentKey, newSeed, sealKeysFromCardSeed, signingKeysFromSeed, keyHash, splitKey, type SealKeyPair } from "../../shared/tabella-crypto.ts";
import { sealPostmanPackage, signOpened, type PostmanPackage } from "../../shared/surprise.ts";
import { STATUS } from "../src/abi.js";
import { loadConfig } from "../src/config.js";
import { createEscalation, TIMINGS, buildSteps, sendable } from "../src/escalation.js";
import { createDryRunNotifier } from "../src/notify/providers.js";
import { createMemoryStore } from "../src/notify/store.js";
import type { Notifier } from "../src/notify/types.js";
import { createPostman } from "../src/postman.js";
import { derivePostmanKeys } from "../src/postmanKeys.js";
import { createApp } from "../src/relay.js";
import { Mutex } from "../src/window.js";
import { MockChain } from "./mockChain.js";

const REGISTRY = "0x1111111111111111111111111111111111111111" as Hex;
const MNEMONIC = "test test test test test test test test test test test junk";
const MIA = "0x00000000000000000000000000000000000ada00" as Hex;
const card = newSeed();
const pkg = (mode: "demo" | "real" = "demo"): PostmanPackage => ({
  v: 1,
  mode,
  owner: "Alex",
  cardKeyHash: keyHash(signingKeysFromSeed(card).publicKey),
  recipient: { name: "Mia", email: "mia.secret@mail.demo-tabella.io", phone: "+15550100123" },
  backups: [
    { name: "Sofia", relation: "friend", email: "sofia.secret@mail.demo-tabella.io", phone: "+15550100456" },
    { name: "Noor", relation: "cousin", email: "noor.secret@mail.demo-tabella.io", phone: "+15550100789" },
  ],
});

let now: number;
let logs: string[];
const EMAIL_ONLY = { email: true, sms: false, call: false };
const ALL = { email: true, sms: true, call: true };
const make = (notifier: Notifier = createDryRunNotifier(EMAIL_ONLY)) => {
  const store = createMemoryStore();
  const esc = createEscalation({ notifier, store, appUrl: "https://app.example", now: () => now, log: (l) => logs.push(l) });
  return { esc, store, notifier };
};
beforeEach(() => {
  now = 10_000_000;
  logs = [];
});

describe("the ladder, email only (Twilio off), in demo timings (2 and 4 minutes)", () => {
  it("step 1 at once: one email to the recipient, with the link and the calm message; no text, no call", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    const r = await esc.run("26", pkg());
    expect(r.sent).toEqual(["r:email"]);
    const email = n.sent[0]!;
    expect(email.kind).toBe("email");
    expect(email.to).toBe("mia.secret@mail.demo-tabella.io");
    expect(email.subject).toBe("Alex left you a letter");
    expect(email.text).toContain("Alex left you a letter. It's been kept safe until now.");
    expect(email.text).toContain("https://app.example/open?letter=26");
    expect(n.sent.some((m) => m.kind !== "email")).toBe(false);
  });
  it("after 2 minutes without an open: a reminder email; the backups wait", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    await esc.run("26", pkg());
    now += TIMINGS.demo.call - 1;
    expect((await esc.run("26", pkg())).sent).toEqual([]);
    now += 1;
    const r = await esc.run("26", pkg());
    expect(r.sent).toEqual(["r:email2"]);
    expect(n.sent.at(-1)!.subject).toMatch(/gentle reminder/i);
    expect(n.sent.filter((m) => m.to.includes("sofia"))).toHaveLength(0);
  });
  it("after 4 minutes: backup 1 by email with the helping message; then backup 2 two minutes later", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    await esc.run("26", pkg());
    now += TIMINGS.demo.backup;
    const r1 = await esc.run("26", pkg());
    expect(r1.sent.sort()).toEqual(["b1:email", "r:email2"]);
    const b1 = n.sent.find((m) => m.to === "sofia.secret@mail.demo-tabella.io")!;
    expect(b1.text).toContain("Alex left a letter for Mia and asked you to help them receive it.");
    expect(b1.text).toContain("/open?letter=26");
    expect(n.sent.some((m) => m.to === "noor.secret@mail.demo-tabella.io")).toBe(false);
    now += TIMINGS.demo.gap;
    const r2 = await esc.run("26", pkg());
    expect(r2.sent).toEqual(["b2:email"]);
    expect(r2.finished).toBe(true);
    expect(n.sent.every((m) => m.kind === "email")).toBe(true);
  });
  it("phone numbers are optional: a person with none is reached by email all the same", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    const noPhones: PostmanPackage = { ...pkg(), recipient: { ...pkg().recipient, phone: "" }, backups: pkg().backups.map((b) => ({ ...b, phone: "" })) };
    await esc.run("8", noPhones);
    now += TIMINGS.demo.backup + TIMINGS.demo.gap;
    await esc.run("8", noPhones);
    expect(n.sent.map((m) => m.kind)).toEqual(Array(n.sent.length).fill("email"));
    expect(n.sent).toHaveLength(4); // the first email, the reminder, backup 1 and backup 2
  });
  it("the real timings are 3 days, 7 days and 2 days between backups", () => {
    expect(TIMINGS.real).toEqual({ call: 3 * 86_400_000, backup: 7 * 86_400_000, gap: 2 * 86_400_000 });
    const keys = buildSteps("1", pkg("real"), "https://x").map((s) => [s.key, s.at / 86_400_000]);
    expect(keys).toContainEqual(["r:email", 0]);
    expect(keys).toContainEqual(["r:email2", 3]);
    expect(keys).toContainEqual(["b1:email", 7]);
    expect(keys).toContainEqual(["b2:email", 9]);
    expect(keys.some(([k]) => /sms|call/.test(String(k)))).toBe(false);
  });
});

describe("texts and calls sit behind a provider switch (off unless Twilio is set up)", () => {
  it("with Twilio on: an SMS with the first email, a call and a reminder SMS with the reminder, an SMS with each backup email", async () => {
    const n = createDryRunNotifier(ALL);
    const { esc } = make(n);
    expect((await esc.run("26", pkg())).sent.sort()).toEqual(["r:email", "r:sms"]);
    expect(n.sent.find((m) => m.kind === "sms")!.text).toBe("Alex left you a letter. It's been kept safe until now. https://app.example/open?letter=26");
    now += TIMINGS.demo.call;
    expect((await esc.run("26", pkg())).sent.sort()).toEqual(["r:call", "r:email2", "r:sms2"]);
    expect(n.sent.find((m) => m.kind === "call")!.text).toMatch(/Alex left you a letter, and it has been kept safe until now/);
    now += TIMINGS.demo.backup - TIMINGS.demo.call;
    expect((await esc.run("26", pkg())).sent.sort()).toEqual(["b1:email", "b1:sms"]);
  });
  it("switching Twilio on later changes nothing in the code: the same ladder simply gains its text and call steps", () => {
    const off = buildSteps("1", pkg(), "https://x", EMAIL_ONLY).map((s) => s.key);
    const on = buildSteps("1", pkg(), "https://x", ALL).map((s) => s.key);
    expect(on.filter((k) => !off.includes(k)).sort()).toEqual(["b1:sms", "b2:sms", "r:call", "r:sms", "r:sms2"]);
    expect(off.every((k) => on.includes(k))).toBe(true);
  });
  it("the Twilio provider is off without its keys, and on with all of them", async () => {
    const { createNotifier } = await import("../src/notify/providers.js");
    expect(createNotifier({}).channels).toEqual({ email: false, sms: false, call: false });
    expect(createNotifier({ RESEND_API_KEY: "k", RESEND_FROM: "Tabella <a@b.c>" }).channels).toEqual({ email: true, sms: false, call: false });
    expect(createNotifier({ TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b" }).channels).toEqual({ email: false, sms: false, call: false });
    expect(createNotifier({ TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b", TWILIO_FROM: "+15550100" }).channels).toEqual({ email: false, sms: true, call: true });
  });
});

describe("a channel that is not set up yet, and addresses that are never real", () => {
  it("with no email key nothing is lost: the ladder waits, then starts the moment the key exists", async () => {
    const n = createDryRunNotifier({ email: false, sms: false, call: false });
    const store = createMemoryStore();
    const early = createEscalation({ notifier: n, store, appUrl: "https://x", now: () => now, log: (l) => logs.push(l) });
    expect((await early.run("5", pkg())).sent).toEqual([]);
    now += TIMINGS.demo.backup * 3; // a long time passes with no key
    expect((await early.run("5", pkg())).sent).toEqual([]);
    expect(logs.filter((l) => /waiting, no message channel/.test(l))).toHaveLength(1); // said once
    const later = createEscalation({ notifier: createDryRunNotifier(EMAIL_ONLY), store, appUrl: "https://x", now: () => now, log: () => {} });
    const r = await later.run("5", pkg());
    expect(r.sent).toEqual(["r:email"]); // the clock starts now, so the reminder and the backups are not all sent at once
  });
  it("addresses on reserved domains (example.com and friends) are never sent to", () => {
    for (const e of ["a@example.com", "a@example.org", "a@sub.example.net", "a@x.test", "a@x.invalid", "a@localhost"]) expect(sendable(e), e).toBe(false);
    for (const e of ["a@gmail.com", "a@mail.demo-tabella.io", "first.last+tag@company.co.uk"]) expect(sendable(e), e).toBe(true);
    const demo: PostmanPackage = { ...pkg(), recipient: { name: "Mia", email: "mia@example.com", phone: "" }, backups: [] };
    expect(buildSteps("1", demo, "https://x")).toEqual([]);
  });
});

describe("every step is sent once, and retries are safe", () => {
  it("passes repeated any number of times send nothing twice, even from two ladders sharing a store", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const store = createMemoryStore();
    const a = createEscalation({ notifier: n, store, appUrl: "https://x", now: () => now, log: () => {} });
    const b = createEscalation({ notifier: n, store, appUrl: "https://x", now: () => now, log: () => {} });
    now += 0;
    await Promise.all([a.run("7", pkg()), b.run("7", pkg()), a.run("7", pkg())]);
    await a.run("7", pkg());
    expect(n.sent).toHaveLength(1); // one email, nothing more
    now += TIMINGS.demo.backup;
    await Promise.all([a.run("7", pkg()), b.run("7", pkg())]);
    await b.run("7", pkg());
    expect(n.sent).toHaveLength(3); // the reminder, then backup 1
  });
  it("a failed send gives its place back and is retried on the next pass (and only that step)", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    let fail = 1;
    const flaky: Notifier = { ...n, channels: n.channels, sms: n.sms, call: n.call, email: async (to, subject, text, key) => { if (fail-- > 0) throw new Error("provider answered HTTP 503"); return n.email(to, subject, text, key); } };
    const { esc } = make(flaky);
    const first = await esc.run("9", pkg());
    expect(first.sent).toEqual([]);
    expect(first.failed).toEqual(["r:email"]);
    expect((await esc.run("9", pkg())).sent).toEqual([]); // not again at once: the step waits after a failed try
    now += 30_000;
    const second = await esc.run("9", pkg());
    expect(second.sent).toEqual(["r:email"]);
    expect(n.sent.filter((m) => m.kind === "email")).toHaveLength(1); // sent once, after one failed try
  });
  it("stops as soon as the letter is opened", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    await esc.run("26", pkg());
    expect(await esc.markOpened("26")).toBe(true);
    expect(await esc.markOpened("26")).toBe(false); // reporting twice changes nothing
    now += TIMINGS.demo.backup * 5;
    const r = await esc.run("26", pkg());
    expect(r).toMatchObject({ finished: true, opened: true, sent: [] });
    expect(n.sent).toHaveLength(1);
  });
  it("never writes an address, a phone number, a name or a link to the log", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    await esc.run("26", pkg());
    now += TIMINGS.demo.backup;
    await esc.run("26", pkg());
    const all = logs.join("\n");
    for (const secret of ["secret@mail.demo-tabella.io", "+1555", "Mia", "Sofia", "Noor", "https://app.example", "mia", "sofia"]) expect(all).not.toContain(secret);
    expect(all).toMatch(/letter #26: step r:email sent/);
  });
  it("only valid addresses and numbers are used (nothing odd reaches a provider)", () => {
    const bad: PostmanPackage = { ...pkg(), recipient: { name: "Mia\r\nBcc: x", email: "a@b.c\nBcc: x@y.z", phone: "5550100" }, backups: [] };
    expect(buildSteps("1", bad, "https://x")).toEqual([]);
  });
});

describe("through the Postman and /opened", () => {
  let chain: MockChain;
  let postmanKeys: SealKeyPair;
  beforeEach(() => {
    chain = new MockChain();
    postmanKeys = derivePostmanKeys(MNEMONIC);
    chain.kemKeys.set(evmToQor(MIA), sealKeysFromCardSeed(card).mlkemPublicKey);
  });
  const setup = () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const store = createMemoryStore();
    const escalation = createEscalation({ notifier: n, store, appUrl: "https://app.example", now: () => now, log: () => {} });
    const cfg = loadConfig({ REGISTRY_ADDRESS: REGISTRY, TRUSTED_PROXY_HOPS: "1" });
    const postman = createPostman({ chain, cfg, keys: postmanKeys, mutex: new Mutex(), log: () => {}, now: () => now, escalation });
    const app = createApp({ chain, cfg, now: () => now, log: () => {}, reportOpened: postman.reportOpened });
    return { n, postman, app, cfg };
  };
  const addSurprise = (id: bigint, status: number) => {
    const { B } = splitKey(makeContentKey());
    chain.letters.set(id, { status, released: false, heirs: [MIA], partBForPostman: bytesToHex(sealPostmanPackage(B, pkg(), postmanKeys.mlkemPublicKey)), partBForHeirs: "0x" });
  };

  it("publishes Part B and starts the ladder in the same pass, then keeps going on later passes", async () => {
    const { n, postman } = setup();
    addSurprise(1n, STATUS.Released);
    const r = await postman.tick();
    expect(r.published).toEqual([1n]);
    expect(n.sent.map((m) => m.kind)).toEqual(["email"]);
    now += TIMINGS.demo.call;
    await postman.tick();
    expect(n.sent.map((m) => m.kind)).toEqual(["email", "email"]); // the reminder
    await postman.tick();
    expect(n.sent).toHaveLength(2); // nothing repeated
  });
  it("a restart in the middle (a new Postman, the same store) does not repeat anything", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const store = createMemoryStore();
    const cfg = loadConfig({ REGISTRY_ADDRESS: REGISTRY });
    const mk = () => createPostman({ chain, cfg, keys: postmanKeys, mutex: new Mutex(), log: () => {}, now: () => now, escalation: createEscalation({ notifier: n, store, appUrl: "https://x", now: () => now, log: () => {} }) });
    addSurprise(1n, STATUS.Released);
    await mk().tick();
    const before = n.sent.length;
    await mk().tick(); // after the restart it finds the letter already released and carries on
    await mk().tick();
    expect(n.sent.length).toBe(before);
  });
  it("an ordinary letter (no contacts) just publishes and is done: no messages, no ladder", async () => {
    const { n, postman } = setup();
    const { B } = splitKey(makeContentKey());
    const { sealPartB } = await import("../../shared/tabella-crypto.ts");
    chain.letters.set(1n, { status: STATUS.Released, released: false, heirs: [MIA], partBForPostman: bytesToHex(sealPartB(B, postmanKeys.mlkemPublicKey)), partBForHeirs: "0x" });
    const r = await postman.tick();
    expect(r.published).toEqual([1n]);
    expect(n.sent).toHaveLength(0);
  });
  const openedBody = (id: string, seed = card) => {
    const keys = signingKeysFromSeed(seed);
    return { letterId: id, pubkey: bytesToHex(keys.publicKey), sig: bytesToHex(signOpened(seed, REGISTRY, BigInt(id))) };
  };
  const post = (app: ReturnType<typeof setup>["app"], body: unknown, ip = "1.1.1.1") => app.request("/opened", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
  it("/opened with the card's signature stops the ladder; a stranger's signature does not", async () => {
    const { n, postman, app } = setup();
    addSurprise(1n, STATUS.Released);
    await postman.tick();
    const stranger = await post(app, openedBody("1", newSeed()), "2.2.2.2");
    expect(stranger.status).toBe(403);
    now += TIMINGS.demo.backup * 3;
    const res = await post(app, openedBody("1"), "3.3.3.3");
    expect(res.status).toBe(200);
    const count = n.sent.length;
    await postman.tick();
    now += TIMINGS.demo.backup * 3;
    await postman.tick();
    expect(n.sent.length).toBe(count); // nothing more after "opened"
  });
  it("/opened refuses a letter that is not a surprise letter, junk, and too many tries", async () => {
    const { postman, app } = setup();
    expect((await post(app, { nope: 1 }, "4.4.4.4")).status).toBe(400);
    expect((await post(app, openedBody("99"), "4.4.4.5")).status).toBe(404);
    const { B } = splitKey(makeContentKey());
    const { sealPartB } = await import("../../shared/tabella-crypto.ts");
    chain.letters.set(1n, { status: STATUS.Released, released: false, heirs: [MIA], partBForPostman: bytesToHex(sealPartB(B, postmanKeys.mlkemPublicKey)), partBForHeirs: "0x" });
    await postman.tick();
    expect((await post(app, openedBody("1"), "5.5.5.5")).status).toBe(404);
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await post(app, { nope: 1 }, "6.6.6.6")).status;
    expect(last).toBe(429);
  });
});

describe("a provider that says no", () => {
  it("scrubs addresses, numbers and links out of what is logged", async () => {
    const { scrub } = await import("../src/notify/providers.js");
    expect(scrub("validation_error: You can only send testing emails to your own email address (me.secret@gmail.com). Call +44 7700 900123 or see https://resend.com/domains")).toBe("validation_error: You can only send testing emails to your own email address (<email>). Call <number> or see <link>");
    expect(scrub("x".repeat(500))).toHaveLength(160);
  });
  it("a 4xx refusal (a key or sender problem) waits ten minutes; a hiccup backs off 30 s, 1 min, 2 min, then 5 min", async () => {
    const { ProviderError } = await import("../src/notify/providers.js");
    const n = createDryRunNotifier(EMAIL_ONLY);
    let mode: "403" | "503" | "ok" = "403";
    const flaky: Notifier = { ...n, channels: n.channels, sms: n.sms, call: n.call, email: async (to, sub, text, key) => { if (mode === "403") throw new ProviderError(403, "validation_error"); if (mode === "503") throw new ProviderError(503, ""); return n.email(to, sub, text, key); } };
    const { esc } = make(flaky);
    expect((await esc.run("3", pkg())).failed).toEqual(["r:email"]);
    for (let i = 0; i < 5; i++) { now += 60_000; expect((await esc.run("3", pkg())).failed).toEqual([]); } // five minutes of quiet, not 15 more tries
    now += 5 * 60_000 + 1;
    expect((await esc.run("3", pkg())).failed).toEqual(["r:email"]); // after ten minutes it tries once more
    expect(logs.at(-1)).toMatch(/failed \(provider answered HTTP 403 \(validation_error\)\); will retry in 600 s/);
    mode = "503";
    now += 10 * 60_000 + 1;
    await esc.run("3", pkg()); // fails with 503: 30 s
    expect(logs.at(-1)).toMatch(/will retry in 30 s/);
    now += 30_001; await esc.run("3", pkg());
    expect(logs.at(-1)).toMatch(/will retry in 60 s/);
    mode = "ok";
    now += 60_001;
    expect((await esc.run("3", pkg())).sent).toEqual(["r:email"]);
    expect(n.sent).toHaveLength(1);
  });
});
