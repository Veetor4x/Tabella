import { evmToQor } from "@qorechain/sdk";
import { bytesToHex, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { makeContentKey, newSeed, sealKeysFromCardSeed, signingKeysFromSeed, keyHash, splitKey, type SealKeyPair } from "../../shared/tabella-crypto.ts";
import { sealPostmanPackage, signOpened, type PostmanPackage } from "../../shared/surprise.ts";
import { STATUS } from "../src/abi.js";
import { loadConfig } from "../src/config.js";
import { createEscalation, TIMINGS, buildSteps } from "../src/escalation.js";
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
  recipient: { name: "Mia", email: "mia.secret@example.com", phone: "+15550100123" },
  backups: [
    { name: "Sofia", relation: "friend", email: "sofia.secret@example.com", phone: "+15550100456" },
    { name: "Noor", relation: "cousin", email: "noor.secret@example.com", phone: "+15550100789" },
  ],
});

let now: number;
let logs: string[];
const make = (notifier: Notifier = createDryRunNotifier()) => {
  const store = createMemoryStore();
  const esc = createEscalation({ notifier, store, appUrl: "https://app.example", now: () => now, log: (l) => logs.push(l) });
  return { esc, store, notifier };
};
beforeEach(() => {
  now = 10_000_000;
  logs = [];
});

describe("the ladder, in demo timings (2 and 4 minutes)", () => {
  it("step 1 at once: email + SMS to the recipient, with the link and the calm message", async () => {
    const n = createDryRunNotifier();
    const { esc } = make(n);
    const r = await esc.run("26", pkg());
    expect(r.sent.sort()).toEqual(["r:email", "r:sms"]);
    const email = n.sent.find((m) => m.kind === "email")!;
    expect(email.to).toBe("mia.secret@example.com");
    expect(email.subject).toBe("Alex left you a letter");
    expect(email.text).toContain("Alex left you a letter. It's been kept safe until now.");
    expect(email.text).toContain("https://app.example/open?letter=26");
    expect(n.sent.find((m) => m.kind === "sms")!.text).toBe("Alex left you a letter. It's been kept safe until now. https://app.example/open?letter=26");
    expect(n.sent.some((m) => m.kind === "call")).toBe(false);
  });
  it("after 2 minutes without an open: a phone call and a reminder SMS; backups wait", async () => {
    const n = createDryRunNotifier();
    const { esc } = make(n);
    await esc.run("26", pkg());
    now += TIMINGS.demo.call - 1;
    expect((await esc.run("26", pkg())).sent).toEqual([]);
    now += 1;
    const r = await esc.run("26", pkg());
    expect(r.sent.sort()).toEqual(["r:call", "r:sms2"]);
    const call = n.sent.find((m) => m.kind === "call")!;
    expect(call.text).toMatch(/Alex left you a letter, and it has been kept safe until now/);
    expect(n.sent.filter((m) => m.to.includes("sofia") || m.to === "+15550100456")).toHaveLength(0);
  });
  it("after 4 minutes: backup 1 with the helping message; then backup 2 two minutes later", async () => {
    const n = createDryRunNotifier();
    const { esc } = make(n);
    await esc.run("26", pkg());
    now += TIMINGS.demo.backup;
    const r1 = await esc.run("26", pkg());
    expect(r1.sent.sort()).toEqual(["b1:email", "b1:sms", "r:call", "r:sms2"].sort());
    const b1 = n.sent.find((m) => m.kind === "email" && m.to === "sofia.secret@example.com")!;
    expect(b1.text).toContain("Alex left a letter for Mia and asked you to help them receive it.");
    expect(b1.text).toContain("/open?letter=26");
    expect(n.sent.some((m) => m.to === "noor.secret@example.com")).toBe(false);
    now += TIMINGS.demo.gap;
    const r2 = await esc.run("26", pkg());
    expect(r2.sent.sort()).toEqual(["b2:email", "b2:sms"]);
    expect(r2.finished).toBe(true);
  });
  it("the real timings are 3 days, 7 days and 2 days between backups", () => {
    expect(TIMINGS.real).toEqual({ call: 3 * 86_400_000, backup: 7 * 86_400_000, gap: 2 * 86_400_000 });
    const keys = buildSteps("1", pkg("real"), "https://x").map((s) => [s.key, s.at / 86_400_000]);
    expect(keys).toContainEqual(["r:call", 3]);
    expect(keys).toContainEqual(["b1:email", 7]);
    expect(keys).toContainEqual(["b2:sms", 9]);
  });
});

describe("every step is sent once, and retries are safe", () => {
  it("passes repeated any number of times send nothing twice, even from two ladders sharing a store", async () => {
    const n = createDryRunNotifier();
    const store = createMemoryStore();
    const a = createEscalation({ notifier: n, store, appUrl: "https://x", now: () => now, log: () => {} });
    const b = createEscalation({ notifier: n, store, appUrl: "https://x", now: () => now, log: () => {} });
    now += 0;
    await Promise.all([a.run("7", pkg()), b.run("7", pkg()), a.run("7", pkg())]);
    await a.run("7", pkg());
    expect(n.sent).toHaveLength(2); // one email and one SMS, nothing more
    now += TIMINGS.demo.backup;
    await Promise.all([a.run("7", pkg()), b.run("7", pkg())]);
    await b.run("7", pkg());
    expect(n.sent).toHaveLength(2 + 2 + 2); // the call + reminder, then backup 1 email + SMS
  });
  it("a failed send gives its place back and is retried on the next pass (and only that step)", async () => {
    const n = createDryRunNotifier();
    let failSms = 1;
    const flaky: Notifier = { ...n, channels: n.channels, email: n.email, call: n.call, sms: async (to, t) => { if (failSms-- > 0) throw new Error("provider answered HTTP 503"); return n.sms(to, t); } };
    const { esc } = make(flaky);
    const first = await esc.run("9", pkg());
    expect(first.sent).toEqual(["r:email"]);
    expect(first.failed).toEqual(["r:sms"]);
    const second = await esc.run("9", pkg());
    expect(second.sent).toEqual(["r:sms"]);
    expect(n.sent.filter((m) => m.kind === "email")).toHaveLength(1);
  });
  it("a channel that is not set up is skipped once and the ladder carries on", async () => {
    const n = createDryRunNotifier();
    const emailOnly: Notifier = { ...n, channels: { email: true, sms: false, call: false }, email: n.email, sms: n.sms, call: n.call };
    const { esc } = make(emailOnly);
    const r = await esc.run("5", pkg());
    expect(r.sent).toEqual(["r:email"]);
    expect(r.skipped).toEqual(["r:sms"]);
    expect((await esc.run("5", pkg())).skipped).toEqual([]);
    expect(logs.some((l) => /r:sms skipped \(sms is not set up\)/.test(l))).toBe(true);
  });
  it("stops as soon as the letter is opened", async () => {
    const n = createDryRunNotifier();
    const { esc } = make(n);
    await esc.run("26", pkg());
    expect(await esc.markOpened("26")).toBe(true);
    expect(await esc.markOpened("26")).toBe(false); // reporting twice changes nothing
    now += TIMINGS.demo.backup * 5;
    const r = await esc.run("26", pkg());
    expect(r).toMatchObject({ finished: true, opened: true, sent: [] });
    expect(n.sent).toHaveLength(2);
  });
  it("never writes an address, a phone number, a name or a link to the log", async () => {
    const n = createDryRunNotifier();
    const { esc } = make(n);
    await esc.run("26", pkg());
    now += TIMINGS.demo.backup;
    await esc.run("26", pkg());
    const all = logs.join("\n");
    for (const secret of ["secret@example.com", "+1555", "Mia", "Sofia", "Noor", "https://app.example", "mia", "sofia"]) expect(all).not.toContain(secret);
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
    const n = createDryRunNotifier();
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
    expect(n.sent.map((m) => m.kind).sort()).toEqual(["email", "sms"]);
    now += TIMINGS.demo.call;
    await postman.tick();
    expect(n.sent.map((m) => m.kind).sort()).toEqual(["call", "email", "sms", "sms"]);
    await postman.tick();
    expect(n.sent).toHaveLength(4); // nothing repeated
  });
  it("a restart in the middle (a new Postman, the same store) does not repeat anything", async () => {
    const n = createDryRunNotifier();
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
