import { evmToQor } from "@qorechain/sdk";
import { bytesToHex, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { keyHash, makeContentKey, newSeed, sealKeysFromCardSeed, signingKeysFromSeed, splitKey } from "../../shared/tabella-crypto.ts";
import { sealPostmanPackage, type PostmanPackage } from "../../shared/surprise.ts";
import { STATUS } from "../src/abi.js";
import { loadConfig } from "../src/config.js";
import { createEscalation } from "../src/escalation.js";
import { createDryRunNotifier } from "../src/notify/providers.js";
import { createMemoryStore } from "../src/notify/store.js";
import { createPostman } from "../src/postman.js";
import { derivePostmanKeys } from "../src/postmanKeys.js";
import { Mutex } from "../src/window.js";
import { MockChain } from "./mockChain.js";

const REGISTRY = "0x1111111111111111111111111111111111111111" as Hex;
const MIA = "0x00000000000000000000000000000000000ada00" as Hex;
const keys = derivePostmanKeys("test test test test test test test test test test test junk");
let chain: MockChain;
let nowMs: number;

const pkg = (mode: "demo" | "real"): PostmanPackage => ({ v: 1, mode, owner: "Alex", cardKeyHash: keyHash(signingKeysFromSeed(newSeed()).publicKey), recipient: { name: "Mia", email: "mia.recipient@mail.test-domain.io", phone: "" }, backups: [] });

function setup(mode: "demo" | "real", status: number) {
  chain = new MockChain();
  chain.kemKeys.set(evmToQor(MIA), sealKeysFromCardSeed(newSeed()).mlkemPublicKey);
  const { B } = splitKey(makeContentKey());
  chain.letters.set(1n, { status, released: false, heirs: [MIA], partBForPostman: bytesToHex(sealPostmanPackage(B, pkg(mode), keys.mlkemPublicKey)), partBForHeirs: "0x", quietPeriod: 120n, warningPeriod: 60n, lastCheckIn: BigInt(Math.floor(nowMs / 1000) - 180) });
  const notifier = createDryRunNotifier({ email: true, sms: false, call: false });
  const store = createMemoryStore();
  const escalation = createEscalation({ notifier, store, appUrl: "https://app.example", now: () => nowMs, log: () => {} });
  const postman = createPostman({ chain, cfg: loadConfig({ REGISTRY_ADDRESS: REGISTRY }), keys, mutex: new Mutex(), log: () => {}, now: () => nowMs, escalation });
  return { postman, notifier };
}
beforeEach(() => (nowMs = 2_000_000_000));

describe("the quick pass", () => {
  it("sends the first email in the same moment as the release is seen (not a pass later)", async () => {
    const { postman, notifier } = setup("demo", STATUS.Warning);
    await postman.tick(); // learns the letter's release time
    expect(notifier.sent).toHaveLength(0);
    chain.letters.get(1n)!.status = STATUS.Released;
    await postman.fastPass(); // seconds after the release
    expect(chain.published).toHaveLength(1);
    expect(notifier.sent.map((e) => e.subject)).toEqual(["Alex left you a letter"]); // the same pass: publish, then the email
  });
  it("a test-timed ladder's reminder (2 minutes later) goes out from the quick pass, without waiting for the slow one", async () => {
    const { postman, notifier } = setup("demo", STATUS.Released);
    await postman.fastPass(); // nothing is known yet: the slow pass finds it
    await postman.tick();
    expect(notifier.sent).toHaveLength(1);
    nowMs += 120_001;
    await postman.fastPass();
    expect(notifier.sent.map((e) => e.subject)).toEqual(["Alex left you a letter", "A gentle reminder: Alex left you a letter"]);
    await postman.fastPass(); // and never twice
    expect(notifier.sent).toHaveLength(2);
  });
  it("a real letter's ladder (days apart) is not looked at quickly", async () => {
    const { postman, notifier } = setup("real", STATUS.Released);
    await postman.tick();
    const before = chain.calls.length;
    nowMs += 5_000;
    await postman.fastPass();
    expect(chain.calls.length).toBe(before); // no calls spent
    expect(notifier.sent).toHaveLength(1);
  });
});
