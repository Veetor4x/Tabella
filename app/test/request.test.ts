import { generateMnemonic } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { parseRelayRequest } from "../../helper/src/validate";
import { bytesToHex, type Hex } from "viem";
import {
  EVM_CHAIN_ID,
  actionMessage,
  createPayloadHash,
  encryptLetter,
  keyHash,
  makeContentKey,
  newSeed,
  sealKeysFromCardSeed,
  sealPartA,
  sealPartB,
  signAction,
  signingKeysFromSeed,
  splitKey,
} from "../../shared/tabella-crypto";
import { mldsa87 } from "@qorechain/pqc";
import { buildCreateBody } from "../src/lib/seal";

void generateMnemonic;
const REGISTRY = "0xC0808aF18e2283dFE4d026315a462349561fFd1c" as Hex;
const MIA = "0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3" as Hex;
const LEO = "0xaAd1E4b139888c02aE8c5E4f1fcC77a89E0d6355" as Hex;

/** Everything the app does when sealing, with throw-away people. */
async function sealLikeTheApp(opts: { guardian: boolean; heirs?: Hex[] }) {
  const heirs = opts.heirs ?? [MIA, LEO];
  const heirKeys = heirs.map(() => sealKeysFromCardSeed(newSeed()).mlkemPublicKey);
  const postman = sealKeysFromCardSeed(newSeed()).mlkemPublicKey;
  const ownerSeed = newSeed();
  const guardianSeed = opts.guardian ? newSeed() : undefined;
  const owner = signingKeysFromSeed(ownerSeed);

  const K = makeContentKey();
  const letterCiphertext = await encryptLetter(K, "Dear Mia and Leo,\nThe spare key is under the blue pot. 💌");
  const { A, B } = splitKey(K);
  const payload = {
    heirs,
    guardianKeyHash: guardianSeed ? keyHash(signingKeysFromSeed(guardianSeed).publicKey) : (`0x${"00".repeat(32)}` as Hex),
    quietPeriod: 120,
    warningPeriod: 60,
    letterCiphertext,
    partAEnvelope: sealPartA(A, heirKeys),
    partBForPostman: sealPartB(B, postman),
  };
  const message = actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId: 7n, action: "CREATE", nonce: 0, payloadHash: createPayloadHash(payload) });
  const sig = signAction(ownerSeed, message);
  return { body: buildCreateBody({ ...payload, ownerPublicKey: owner.publicKey, sig }), owner, sig, message };
}

describe("the request the app sends to the helper", () => {
  it("passes the helper's own validator, with and without a guardian", async () => {
    for (const guardian of [true, false]) {
      const { body } = await sealLikeTheApp({ guardian });
      const parsed = parseRelayRequest(body);
      expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
      if (parsed.ok) expect(parsed.fn).toBe("createLetter");
    }
  });

  it("works for one, two and three people", async () => {
    const third = "0x00000000000000000000000000000000000000c3" as Hex;
    for (const heirs of [[MIA], [MIA, LEO], [MIA, LEO, third]]) {
      const { body } = await sealLikeTheApp({ guardian: true, heirs });
      expect(parseRelayRequest(body).ok).toBe(true);
    }
  });

  it("carries a real signature of the right size, made by the key it also sends", async () => {
    const { body, owner, sig, message } = await sealLikeTheApp({ guardian: true });
    expect(body.pubkey).toBe(bytesToHex(owner.publicKey));
    expect((body.pubkey.length - 2) / 2).toBe(2592);
    expect((body.sig.length - 2) / 2).toBe(4627);
    expect(mldsa87.verify(owner.publicKey, message, sig)).toBe(true);
  });

  it("stays within the helper's request-size limit even for the biggest letter", async () => {
    // 3 people and the longest allowed letter: the JSON must be under the helper's 128 KB body limit
    const big = await (async () => {
      const heirs = [MIA, LEO, "0x00000000000000000000000000000000000000c3" as Hex];
      const heirKeys = heirs.map(() => sealKeysFromCardSeed(newSeed()).mlkemPublicKey);
      const K = makeContentKey();
      const ct = await encryptLetter(K, "a".repeat(8164));
      const { A, B } = splitKey(K);
      const ownerSeed = newSeed();
      const payload = {
        heirs,
        guardianKeyHash: `0x${"11".repeat(32)}` as Hex,
        quietPeriod: 120,
        warningPeriod: 60,
        letterCiphertext: ct,
        partAEnvelope: sealPartA(A, heirKeys),
        partBForPostman: sealPartB(B, heirKeys[0]!),
      };
      const sig = signAction(ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId: 1n, action: "CREATE", nonce: 0, payloadHash: createPayloadHash(payload) }));
      return buildCreateBody({ ...payload, ownerPublicKey: signingKeysFromSeed(ownerSeed).publicKey, sig });
    })();
    expect(JSON.stringify(big).length).toBeLessThan(128 * 1024);
    expect(parseRelayRequest(big).ok).toBe(true);
  });
});
