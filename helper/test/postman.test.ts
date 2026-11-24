import { evmToQor, qorechainRegistry } from "@qorechain/sdk";
import { sealSeedFromMnemonic, sealKeysFromSeed } from "@qorechain/qoreseal";
import { bytesToHex, decodeFunctionData, hexToBytes, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeContentKey,
  newSeed,
  openPart,
  sealKeysFromCardSeed,
  sealPartB,
  splitKey,
  type SealKeyPair,
} from "../../shared/tabella-crypto.ts";
import { STATUS, postmanAbi } from "../src/abi.js";
import { loadConfig, type Config } from "../src/config.js";
import { createPostman } from "../src/postman.js";
import { POSTMAN_KEY_PASSPHRASE, derivePostmanKeys, ensurePostmanKemKey } from "../src/postmanKeys.js";
import { createApp } from "../src/relay.js";
import { Mutex } from "../src/window.js";
import { MockChain } from "./mockChain.js";

const REGISTRY = "0x1111111111111111111111111111111111111111" as Hex;
const MNEMONIC = "test test test test test test test test test test test junk"; // the well-known test phrase
const ADA = "0x00000000000000000000000000000000000ada00" as Hex;
const SAM = "0x0000000000000000000000000000000000005a00" as Hex;

let chain: MockChain;
let cfg: Config;
let nowMs: number;
let logs: string[];
let postmanKeys: SealKeyPair;
let ada: SealKeyPair;
let sam: SealKeyPair;

const makePostman = (env: Record<string, string> = {}, mutex = new Mutex()) => {
  cfg = loadConfig({ REGISTRY_ADDRESS: REGISTRY, ...env });
  return createPostman({ chain, cfg, keys: postmanKeys, mutex, log: (l) => logs.push(l), now: () => nowMs });
};

/** A letter whose Part B really is sealed to the Postman's key. Returns B so tests can check what the heirs get. */
function addLetter(id: bigint, status: number, opts: { heirs?: Hex[]; sealedTo?: SealKeyPair } = {}) {
  const { B } = splitKey(makeContentKey());
  chain.letters.set(id, {
    status,
    released: false,
    heirs: opts.heirs ?? [ADA, SAM],
    partBForPostman: bytesToHex(sealPartB(B, (opts.sealedTo ?? postmanKeys).mlkemPublicKey)),
    partBForHeirs: "0x",
  });
  return B;
}

const isNotRecipient = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code === "NOT_A_RECIPIENT";
  }
  return false;
};

beforeEach(() => {
  chain = new MockChain();
  nowMs = 1_000_000;
  logs = [];
  postmanKeys = derivePostmanKeys(MNEMONIC);
  ada = sealKeysFromCardSeed(newSeed());
  sam = sealKeysFromCardSeed(newSeed());
  chain.kemKeys.set(evmToQor(ADA), ada.mlkemPublicKey);
  chain.kemKeys.set(evmToQor(SAM), sam.mlkemPublicKey);
});

describe("the Postman key comes from HELPER_MNEMONIC, with no new secret", () => {
  it("is deterministic, ML-KEM-1024 sized, and different for a different mnemonic", () => {
    const a = derivePostmanKeys(MNEMONIC);
    const b = derivePostmanKeys(MNEMONIC);
    expect(a.mlkemPublicKey).toEqual(b.mlkemPublicKey);
    expect(a.mlkemPublicKey).toHaveLength(1568);
    const other = derivePostmanKeys("legal winner thank year wave sausage worth useful legal winner thank yellow");
    expect(other.mlkemPublicKey).not.toEqual(a.mlkemPublicKey);
  });

  it("uses sealSeedFromMnemonic with a fixed (non-secret) passphrase, so it differs from the plain derivation", () => {
    const viaQoreSeal = sealKeysFromSeed(sealSeedFromMnemonic({ mnemonic: MNEMONIC, passphrase: POSTMAN_KEY_PASSPHRASE, index: 0 }));
    expect(derivePostmanKeys(MNEMONIC).mlkemPublicKey).toEqual(viaQoreSeal.mlkemPublicKey);
    const plain = sealKeysFromSeed(sealSeedFromMnemonic({ mnemonic: MNEMONIC }));
    expect(derivePostmanKeys(MNEMONIC).mlkemPublicKey).not.toEqual(plain.mlkemPublicKey);
  });
});

describe("registering the Postman's key on-chain", () => {
  beforeEach(() => {
    chain.qorAddress = "qor1m4hahqx9s0h852xe36awlgw09qyetagc3ajfgp";
  });

  it("sends one MsgRegisterKEMKey from the helper's address carrying the Postman's public key", async () => {
    const tx = await ensurePostmanKemKey(chain, postmanKeys);
    expect(tx).toBe("NATIVETX1");
    expect(chain.nativeBroadcasts).toHaveLength(1);
    const [msg] = chain.nativeBroadcasts[0]!;
    expect(msg!.typeUrl).toBe("/qorechain.pqc.v1.MsgRegisterKEMKey");
    const decoded = qorechainRegistry().decode({ typeUrl: msg!.typeUrl, value: msg!.value }) as { sender: string; algorithmId: number; publicKey: Uint8Array };
    expect(decoded.sender).toBe(chain.qorAddress);
    expect(decoded.algorithmId).toBe(2); // ML-KEM-1024
    expect(decoded.publicKey).toEqual(postmanKeys.mlkemPublicKey);
  });

  it("does nothing when the same key is already registered", async () => {
    chain.kemKeys.set(chain.qorAddress, postmanKeys.mlkemPublicKey);
    expect(await ensurePostmanKemKey(chain, postmanKeys)).toBeUndefined();
    expect(chain.nativeBroadcasts).toHaveLength(0);
  });

  it("refuses to overwrite a DIFFERENT registered key (letters may be sealed to it)", async () => {
    chain.kemKeys.set(chain.qorAddress, sealKeysFromCardSeed(newSeed()).mlkemPublicKey);
    await expect(ensurePostmanKemKey(chain, postmanKeys)).rejects.toThrow(/refusing to overwrite/);
    expect(chain.nativeBroadcasts).toHaveLength(0);
  });
});

describe("finding released letters and publishing Part B", () => {
  it("publishes Part B for a Released letter, sealed to every heir (and not to the Postman)", async () => {
    const B = addLetter(1n, STATUS.Released);
    const postman = makePostman();
    const report = await postman.tick();

    expect(report.published).toEqual([1n]);
    expect(chain.published).toHaveLength(1);
    const env = hexToBytes(chain.published[0]!.envelope);
    expect(openPart(env, ada)).toEqual(B);
    expect(openPart(env, sam)).toEqual(B);
    expect(isNotRecipient(() => openPart(env, postmanKeys))).toBe(true); // the Postman cannot re-read what it handed over
    expect(chain.letters.get(1n)!.released).toBe(true);
  });

  it("leaves Active and Warning letters alone, and cancelled ones", async () => {
    addLetter(1n, STATUS.Active);
    addLetter(2n, STATUS.Warning);
    addLetter(3n, STATUS.Cancelled);
    const postman = makePostman();
    const report = await postman.tick();
    expect(report.published).toEqual([]);
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(0);
    expect(chain.spending).toEqual([]);
  });

  it("publishes a letter as soon as it becomes Released (next tick), not before", async () => {
    addLetter(1n, STATUS.Warning);
    const postman = makePostman();
    await postman.tick();
    expect(chain.published).toHaveLength(0);

    chain.letters.get(1n)!.status = STATUS.Released; // time passes
    nowMs += 20_000;
    await postman.tick();
    expect(chain.published).toHaveLength(1);
  });

  it("handles several released letters in one tick, skipping ones that are done", async () => {
    addLetter(1n, STATUS.Released);
    addLetter(2n, STATUS.Active);
    addLetter(3n, STATUS.Released);
    chain.letters.get(3n)!.released = true; // someone already published this one
    addLetter(4n, STATUS.Released);
    const report = await makePostman().tick();
    expect(report.published).toEqual([1n, 4n]);
    expect(chain.published.map((p) => p.id)).toEqual([1n, 4n]);
  });

  it("does not re-read letters that are finished (published or cancelled)", async () => {
    addLetter(1n, STATUS.Cancelled);
    addLetter(2n, STATUS.Released);
    addLetter(3n, STATUS.Active);
    const postman = makePostman();
    await postman.tick();
    const before = chain.calls.filter((c) => c === "call").length;
    await postman.tick();
    // second tick: letterCount + status of letter 3 only
    expect(chain.calls.filter((c) => c === "call").length - before).toBe(2);
  });
});

describe("retries are safe: Part B is never published twice", () => {
  it("many ticks, one publication", async () => {
    addLetter(1n, STATUS.Released);
    const postman = makePostman();
    for (let i = 0; i < 6; i++) {
      await postman.tick();
      nowMs += 20_000;
    }
    expect(chain.published).toHaveLength(1);
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1);
  });

  it("a send that fails is retried later, with backoff, and then published once", async () => {
    addLetter(1n, STATUS.Released);
    chain.failNextSends = 1;
    const postman = makePostman();

    await postman.tick();
    expect(chain.published).toHaveLength(0);

    nowMs += 20_000; // too soon: still backing off, no new attempt
    await postman.tick();
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1);

    nowMs += 20_000; // 40 s since the failure: past the 30 s backoff
    const report = await postman.tick();
    expect(report.published).toEqual([1n]);
    expect(chain.published).toHaveLength(1);
  });

  it("a publish that reached the chain but looked like an error is NOT repeated", async () => {
    addLetter(1n, STATUS.Released);
    chain.applyThenThrowNextSends = 1; // tx mined, but the caller timed out waiting
    const postman = makePostman();
    await postman.tick();
    expect(chain.published).toHaveLength(1); // it did go through

    nowMs += 60_000;
    await postman.tick();
    await postman.tick();
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1); // the on-chain flag was read, nothing re-sent
    expect(chain.published).toHaveLength(1);
  });

  it("if someone else published first, the Postman stands down", async () => {
    addLetter(1n, STATUS.Released);
    const postman = makePostman();
    // between the Postman reading the letter and its simulation, someone else publishes it
    const realCall = chain.call.bind(chain);
    chain.call = async (tx) => {
      const out = await realCall(tx);
      if (decodeFunctionData({ abi: postmanAbi, data: tx.data }).functionName === "getLetter") chain.letters.get(1n)!.released = true;
      return out;
    };
    await postman.tick();
    expect(chain.spending).toEqual([]); // simulation said AlreadyPublished: nothing was sent
    expect(logs.join("\n")).toMatch(/letter #1: Part B was already published/);
    expect(chain.published).toHaveLength(0);
  });

  it("a restarted Postman (fresh memory) does not publish a letter that is already done", async () => {
    addLetter(1n, STATUS.Released);
    await makePostman().tick();
    expect(chain.published).toHaveLength(1);

    const restarted = makePostman(); // new process, empty memory
    await restarted.tick();
    await restarted.tick();
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1);
  });

  it("ticks never overlap", async () => {
    addLetter(1n, STATUS.Released);
    chain.delayMs = 5;
    const postman = makePostman();
    const [a, b] = await Promise.all([postman.tick(), postman.tick()]);
    expect([a.skipped, b.skipped].sort()).toEqual([false, true]);
    expect(chain.published).toHaveLength(1);
  });

  it("an error on one letter does not stop the others", async () => {
    addLetter(1n, STATUS.Released);
    addLetter(2n, STATUS.Released);
    chain.failNextSends = 1; // letter 1's send fails
    const report = await makePostman().tick();
    expect(report.published).toEqual([2n]);
    expect(report.waiting).toEqual([1n]);
  });
});

describe("heirs' opening keys", () => {
  it("waits when an heir has no registered key yet, then publishes to everyone once they do", async () => {
    addLetter(1n, STATUS.Released);
    chain.kemKeys.delete(evmToQor(SAM));
    const postman = makePostman();
    await postman.tick();
    expect(chain.published).toHaveLength(0); // never a partial publish: it is a one-shot

    nowMs += 20_000;
    chain.kemKeys.set(evmToQor(SAM), sam.mlkemPublicKey); // Sam registers
    await postman.tick();
    expect(chain.published).toHaveLength(1);
    const env = hexToBytes(chain.published[0]!.envelope);
    expect(() => openPart(env, ada)).not.toThrow();
    expect(() => openPart(env, sam)).not.toThrow();
  });

  it("after the grace period, seals to the heirs that do have a key (and says so)", async () => {
    const B = addLetter(1n, STATUS.Released);
    chain.kemKeys.delete(evmToQor(SAM));
    const postman = makePostman({ POSTMAN_HEIR_KEY_GRACE_MINUTES: "30" });
    await postman.tick();
    nowMs += 29 * 60_000;
    await postman.tick();
    expect(chain.published).toHaveLength(0);

    nowMs += 2 * 60_000; // past 30 minutes
    await postman.tick();
    expect(chain.published).toHaveLength(1);
    const env = hexToBytes(chain.published[0]!.envelope);
    expect(openPart(env, ada)).toEqual(B);
    expect(isNotRecipient(() => openPart(env, sam))).toBe(true);
    expect(logs.join("\n")).toMatch(/WARNING letter #1: grace period over, sealing Part B to 1 of 2 heirs/);
  });

  it("never publishes when NO heir has a key, even after the grace period", async () => {
    addLetter(1n, STATUS.Released);
    chain.kemKeys.clear();
    const postman = makePostman({ POSTMAN_HEIR_KEY_GRACE_MINUTES: "1" });
    await postman.tick();
    nowMs += 10 * 60_000;
    await postman.tick();
    expect(chain.published).toHaveLength(0);
  });
});

describe("Part B the Postman cannot open (e.g. letter #1 from the old deploy)", () => {
  const cannotOpenLines = () => logs.filter((l) => /letter #1: cannot open Part B/.test(l));

  it("is marked can't-open, logged once, and never retried: no gas, no log spam every 20 s", async () => {
    addLetter(1n, STATUS.Released, { sealedTo: sealKeysFromCardSeed(newSeed()) }); // sealed to someone else's key
    const postman = makePostman();

    const first = await postman.tick();
    expect(first.cannotOpen).toEqual([1n]);
    expect(first.waiting).toEqual([]); // not "will retry"
    expect(cannotOpenLines()).toHaveLength(1);
    expect(cannotOpenLines()[0]).toMatch(/NOT_A_RECIPIENT/);
    expect(cannotOpenLines()[0]).toMatch(/not retrying/);

    // an hour of ticks (every 20 s): silence, and no work at all for that letter
    const callsAfterFirst = chain.calls.length;
    for (let i = 0; i < 180; i++) {
      nowMs += 20_000;
      const r = await postman.tick();
      expect(r.cannotOpen).toEqual([]);
      expect(r.scanned).toBe(0);
    }
    expect(cannotOpenLines()).toHaveLength(1); // still just the one line
    expect(logs.filter((l) => /letter #1/.test(l)).length).toBe(2); // "is Released..." + "cannot open", nothing else
    expect(chain.spending).toEqual([]); // no tx, no window
    expect(chain.calls.slice(callsAfterFirst).every((c) => c === "call")).toBe(true); // only the cheap letterCount read
    expect(chain.calls.slice(callsAfterFirst).length).toBe(180);
    expect(chain.published).toHaveLength(0);
  });

  it("a corrupt Part B is treated the same way", async () => {
    addLetter(1n, STATUS.Released);
    chain.letters.get(1n)!.partBForPostman = "0xdeadbeef";
    const postman = makePostman();
    for (let i = 0; i < 5; i++) {
      await postman.tick();
      nowMs += 20_000;
    }
    expect(cannotOpenLines()).toHaveLength(1);
    expect(chain.spending).toEqual([]);
  });

  it("does not block other letters, in the same tick or later", async () => {
    addLetter(1n, STATUS.Released, { sealedTo: sealKeysFromCardSeed(newSeed()) });
    addLetter(2n, STATUS.Released);
    const postman = makePostman();
    const report = await postman.tick();
    expect(report.cannotOpen).toEqual([1n]);
    expect(report.published).toEqual([2n]);

    addLetter(3n, STATUS.Released); // a new letter later is still handled
    nowMs += 20_000;
    expect((await postman.tick()).published).toEqual([3n]);
    expect(chain.published.map((p) => p.id)).toEqual([2n, 3n]);
  });

  it("is shown in /health as a count, without making the Postman look unhealthy", async () => {
    addLetter(1n, STATUS.Released, { sealedTo: sealKeysFromCardSeed(newSeed()) });
    const postman = makePostman();
    await postman.tick();
    const info = postman.info();
    expect(info.cannotOpen).toBe(1);
    expect(info.lastTickOk).toBe(true);
    expect(info.lastError).toBeNull();
  });

  it("only a fresh process (restart) looks again, and says it once more", async () => {
    addLetter(1n, STATUS.Released, { sealedTo: sealKeysFromCardSeed(newSeed()) });
    await makePostman().tick();
    await makePostman().tick(); // restarted: empty memory
    expect(cannotOpenLines()).toHaveLength(2);
    expect(chain.spending).toEqual([]);
  });

  it("is different from a letter that is merely waiting (an heir has no key yet), which IS retried", async () => {
    addLetter(1n, STATUS.Released);
    chain.kemKeys.delete(evmToQor(SAM));
    const postman = makePostman();
    const r1 = await postman.tick();
    expect(r1.cannotOpen).toEqual([]);
    expect(r1.waiting).toEqual([1n]);
    chain.kemKeys.set(evmToQor(SAM), sam.mlkemPublicKey);
    nowMs += 20_000;
    expect((await postman.tick()).published).toEqual([1n]);
  });
});

describe("logs and /health leak nothing secret", () => {
  it("logs contain letter ids, counts and tx hashes only", async () => {
    const B = addLetter(1n, STATUS.Released);
    await makePostman().tick();
    const text = logs.join("\n");
    expect(text).toMatch(/published Part B for letter #1 tx=0x[0-9a-f]{64}/);
    // not Part B, not the keys, not the mnemonic, not the sealed bytes
    for (const secret of [
      bytesToHex(B),
      bytesToHex(B).slice(2, 40),
      bytesToHex(postmanKeys.mlkemSecretKey).slice(2, 60),
      bytesToHex(postmanKeys.seed).slice(2, 40),
      bytesToHex(postmanKeys.mlkemPublicKey).slice(2, 60),
      "test test test",
      chain.published[0]!.envelope.slice(2, 60),
    ]) {
      expect(text, `log must not contain ${secret.slice(0, 12)}...`).not.toContain(secret);
    }
  });

  it("GET /health shows the Postman's PUBLIC key and status, and never the secret key", async () => {
    addLetter(1n, STATUS.Released);
    const postman = makePostman();
    await postman.tick();
    const app = createApp({ chain, cfg, now: () => nowMs, log: () => {}, postmanInfo: postman.info });
    const res = await app.request("/health");
    const text = await res.text();
    const json = JSON.parse(text);

    expect(json.postman.mlkemPublicKey).toBe(bytesToHex(postmanKeys.mlkemPublicKey));
    expect(json.postman.mlkemPublicKey).toHaveLength(2 + 1568 * 2);
    expect(json.postman).toMatchObject({ enabled: true, address: chain.evmAddress, intervalSeconds: 20, lastTickOk: true, published: 1, cannotOpen: 0, lastError: null });
    expect(Object.keys(json.postman).sort()).toEqual(["address", "cannotOpen", "enabled", "intervalSeconds", "lastError", "lastTickAt", "lastTickOk", "lettersWatched", "mlkemPublicKey", "published"]);

    for (const secret of [bytesToHex(postmanKeys.mlkemSecretKey).slice(2, 60), bytesToHex(postmanKeys.seed).slice(2, 40), "test test", "SECRET"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("/health without a Postman has no postman field", async () => {
    const cfg2 = loadConfig({ REGISTRY_ADDRESS: REGISTRY });
    const json = (await (await createApp({ chain, cfg: cfg2, log: () => {} }).request("/health")).json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty("postman");
  });
});

describe("the loop", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("runs at once and then every 20 seconds, and stops when told to", async () => {
    const postman = makePostman(); // 0 letters: each tick makes exactly one read (letterCount)
    const ticks = () => chain.calls.filter((c) => c === "call").length;

    postman.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ticks()).toBe(1);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(ticks()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ticks()).toBe(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ticks()).toBe(3);

    postman.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ticks()).toBe(3);
  });

  it("start() twice does not double the loop", async () => {
    const postman = makePostman();
    postman.start();
    postman.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chain.calls.filter((c) => c === "call").length).toBe(2);
    postman.stop();
  });

  it("keeps going after the chain was down for a while", async () => {
    const postman = makePostman();
    chain.down = true;
    postman.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(logs.join("\n")).toMatch(/tick failed/);
    chain.down = false;
    addLetter(1n, STATUS.Released);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chain.published).toHaveLength(1);
    postman.stop();
  });
});

describe("startup catch-up (a helper waking from sleep on a free instance)", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("runs one FULL pass immediately: every overdue Part B is published before any 20 s wait", async () => {
    addLetter(1n, STATUS.Released); // overdue for hours
    addLetter(2n, STATUS.Active);
    addLetter(3n, STATUS.Released);
    addLetter(4n, STATUS.Cancelled);
    addLetter(5n, STATUS.Released);
    chain.letters.get(5n)!.released = true; // already done before the sleep
    addLetter(6n, STATUS.Released);
    nowMs += 6 * 3600_000; // the helper has been asleep for six hours

    const postman = makePostman();
    const report = await postman.start(); // NOTE: the fake clock is never advanced

    expect(report.skipped).toBe(false);
    expect(report.published).toEqual([1n, 3n, 6n]);
    expect(chain.published.map((p) => p.id)).toEqual([1n, 3n, 6n]);
    expect(chain.letters.get(2n)!.released).toBe(false); // Active: untouched
    expect(chain.letters.get(4n)!.released).toBe(false); // cancelled: untouched
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(3);
    postman.stop();
  });

  it("does not wait for the interval: with timers frozen, the catch-up still completes", async () => {
    addLetter(1n, STATUS.Released);
    const postman = makePostman();
    const done = postman.start();
    // resolve without advancing any timer: only the first pass itself, no 20 s sleep, is awaited
    await expect(done).resolves.toMatchObject({ published: [1n] });
    expect(chain.published).toHaveLength(1);
    postman.stop();
  });

  it("then carries on, and a letter that is about to be released is picked up by the quick pass (15 s), not the slow one (20 s)", async () => {
    addLetter(1n, STATUS.Released);
    addLetter(2n, STATUS.Warning); // its release time is moments ago in this test's clock: it is "imminent"
    const postman = makePostman();
    await postman.start();
    expect(chain.published.map((p) => p.id)).toEqual([1n]);

    chain.letters.get(2n)!.status = STATUS.Released;
    await vi.advanceTimersByTimeAsync(14_000);
    expect(chain.published.map((p) => p.id)).toEqual([1n]); // not yet
    await vi.advanceTimersByTimeAsync(1_000);
    expect(chain.published.map((p) => p.id)).toEqual([1n, 2n]); // the quick pass, 15 s after the start
    postman.stop();
  });

  it("a letter that cannot be released for a long time costs nothing on the slow passes (free-plan friendly)", async () => {
    addLetter(1n, STATUS.Active);
    const l = chain.letters.get(1n)!;
    l.lastCheckIn = BigInt(Math.floor(nowMs / 1000)); // just checked in
    l.quietPeriod = BigInt(180 * 86_400); // six months
    l.warningPeriod = BigInt(14 * 86_400);
    const postman = makePostman();
    await postman.start(); // the first look reads the letter once and learns when it can be released
    const before = chain.calls.filter((c) => c === "call").length;
    await vi.advanceTimersByTimeAsync(60_000); // three slow passes and four quick ones
    expect(chain.calls.filter((c) => c === "call").length - before).toBe(3); // only letterCount, once per slow pass: no status or letter reads
    postman.stop();
  });

  it("the slow and the quick pass never work on the same letter at the same moment (no double publish)", async () => {
    addLetter(1n, STATUS.Released);
    const postman = makePostman();
    await Promise.all([postman.tick(), postman.fastPass(), postman.tick(), postman.fastPass()]);
    await postman.tick();
    expect(chain.published).toHaveLength(1);
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1);
  });

  it("start() twice gives one catch-up and no double publication", async () => {
    addLetter(1n, STATUS.Released);
    const postman = makePostman();
    const [a, b] = await Promise.all([postman.start(), postman.start()]);
    expect(a).toBe(b); // the same pass
    expect(chain.published).toHaveLength(1);
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1);
    postman.stop();
  });

  it("a catch-up that hits a dead chain resolves with errors (no crash, no hang) and the next tick recovers", async () => {
    addLetter(1n, STATUS.Released);
    chain.down = true; // the RPC is still waking up too
    const postman = makePostman();
    const report = await postman.start();
    expect(report.errors).toBeGreaterThan(0);
    expect(chain.published).toHaveLength(0);

    chain.down = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chain.published).toHaveLength(1);
    postman.stop();
  });

  it("a restarted process has no memory of earlier work, yet never republishes a letter that is already done", async () => {
    addLetter(1n, STATUS.Released);
    const before = makePostman();
    await before.start();
    before.stop();
    expect(chain.published).toHaveLength(1);

    const afterWake = makePostman(); // the instance went to sleep and came back: new process
    const report = await afterWake.start();
    expect(report.published).toEqual([]);
    expect(chain.published).toHaveLength(1);
    expect(chain.calls.filter((c) => c === "send")).toHaveLength(1);
    afterWake.stop();
  });

  it("the request that wakes the helper is served while the catch-up runs, sharing one send queue", async () => {
    vi.useRealTimers(); // this one needs real (tiny) delays so the two really overlap
    addLetter(1n, STATUS.Released);
    chain.delayMs = 5;
    const mutex = new Mutex();
    const postman = makePostman({ RATE_LIMIT_PER_MIN: "1000" }, mutex);
    const app = createApp({ chain, cfg, now: () => nowMs, log: () => {}, mutex });
    const wake = app.request("/relay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fn: "checkIn", args: { letterId: "1" }, pubkey: "0x" + "11".repeat(2592), sig: "0x" + "22".repeat(4627) }),
    });
    const [res, report] = await Promise.all([wake, postman.start()]);
    expect(res.status).toBe(200);
    expect(report.published).toEqual([1n]);
    expect(chain.maxSendInFlight).toBe(1);
    postman.stop();
  });
});

describe("shares the relay's queue (one nonce counter)", () => {
  it("a /relay request and a Postman publish never send at the same time", async () => {
    addLetter(1n, STATUS.Released);
    chain.delayMs = 5;
    const mutex = new Mutex();
    const postman = makePostman({ RATE_LIMIT_PER_MIN: "1000" }, mutex);
    const app = createApp({ chain, cfg, now: () => nowMs, log: () => {}, mutex });

    const PUBKEY = "0x" + "11".repeat(2592);
    const SIG = "0x" + "22".repeat(4627);
    const [, res] = await Promise.all([
      postman.tick(),
      app.request("/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fn: "checkIn", args: { letterId: "1" }, pubkey: PUBKEY, sig: SIG }),
      }),
    ]);
    expect(res.status).toBe(200);
    expect(chain.published).toHaveLength(1);
    expect(chain.maxSendInFlight).toBe(1);
  });
});
