import { readFileSync } from "node:fs";
import { mldsa87 } from "@qorechain/pqc";
import { isQoreSealError, sealKeysFromSeed } from "@qorechain/qoreseal";
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildSignatureFixture, FIXTURE_OWNER_SEED, type ContractVectors } from "./scripts/signature-fixture";
import {
  EMPTY_PAYLOAD_HASH,
  MAX_LETTER_BYTES,
  actionMessage,
  cardDecode,
  cardEncode,
  createDatedPayloadHash,
  createPayloadHash,
  decryptLetter,
  encryptLetter,
  joinKey,
  keyHash,
  makeContentKey,
  newSeed,
  openPart,
  sealKeysFromCardSeed,
  sealPartA,
  sealPartB,
  signAction,
  signingKeysFromSeed,
  splitKey,
  type Action,
} from "./tabella-crypto";

const read = (name: string) => readFileSync(new URL(`./test-vectors/${name}`, import.meta.url), "utf8");
const vectors = JSON.parse(read("contract-vectors.json")) as ContractVectors;

/** QoreSeal's stable error code, not its message text, tells us "you are not a recipient". */
function expectNotRecipient(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(isQoreSealError(caught, "NOT_A_RECIPIENT"), `expected NOT_A_RECIPIENT, got ${String(caught)}`).toBe(true);
}

const LETTER = "Dear Ada and Sam,\nThe spare key is under the blue pot. I love you. - Alex 💌";

/** Ada and Sam (heirs), Priya is a guardian (signs only), Postman, and a stranger: each from a card seed. */
function people() {
  const ada = sealKeysFromCardSeed(newSeed());
  const sam = sealKeysFromCardSeed(newSeed());
  const postman = sealKeysFromCardSeed(newSeed());
  const stranger = sealKeysFromCardSeed(newSeed());
  return { ada, sam, postman, stranger };
}

/** Everything the owner does when sealing a letter. */
async function sealLetter(p: ReturnType<typeof people>) {
  const K = makeContentKey();
  const letterCiphertext = await encryptLetter(K, LETTER);
  const { A, B } = splitKey(K);
  const partAEnvelope = sealPartA(A, [p.ada.mlkemPublicKey, p.sam.mlkemPublicKey]);
  const partBForPostman = sealPartB(B, p.postman.mlkemPublicKey);
  return { K, A, B, letterCiphertext, partAEnvelope, partBForPostman };
}

describe("letter encryption and key split", () => {
  it("encrypts and decrypts, with a fresh nonce each time", async () => {
    const K = makeContentKey();
    expect(K).toHaveLength(32);
    const c1 = await encryptLetter(K, LETTER);
    const c2 = await encryptLetter(K, LETTER);
    expect(bytesToHex(c1)).not.toEqual(bytesToHex(c2));
    expect(await decryptLetter(K, c1)).toBe(LETTER);
    expect(await decryptLetter(K, c2)).toBe(LETTER);
  });

  it("rejects a wrong key and a changed ciphertext", async () => {
    const K = makeContentKey();
    const c = await encryptLetter(K, LETTER);
    await expect(decryptLetter(makeContentKey(), c)).rejects.toThrow();
    const tampered = c.slice();
    tampered[tampered.length - 1]! ^= 1;
    await expect(decryptLetter(K, tampered)).rejects.toThrow();
    await expect(decryptLetter(K, c.slice(0, 20))).rejects.toThrow(/too short/);
  });

  it("enforces the on-chain size limit", async () => {
    const K = makeContentKey();
    const max = "a".repeat(MAX_LETTER_BYTES);
    const c = await encryptLetter(K, max);
    expect(c.length).toBe(8192); // exactly the contract's MAX_BYTES
    await expect(encryptLetter(K, max + "a")).rejects.toThrow(/too long/);
    await expect(encryptLetter(K, "")).rejects.toThrow(/empty/);
  });

  it("splits K so that A xor B = K, and neither half equals K", () => {
    const K = makeContentKey();
    const { A, B } = splitKey(K);
    expect(joinKey(A, B)).toEqual(K);
    expect(A).not.toEqual(K);
    expect(B).not.toEqual(K);
    expect(splitKey(K).B).not.toEqual(B); // B is fresh random every time
    expect(() => joinKey(A, B.slice(1))).toThrow();
  });
});

describe("the sealed-letter flow", () => {
  it("full round trip: heirs open A, Postman opens B and re-seals it to the heirs, heirs read the letter", async () => {
    const p = people();
    const s = await sealLetter(p);

    // the Postman opens B (and only B), then hands it to the heirs after release
    const bFromPostman = openPart(s.partBForPostman, p.postman);
    expect(bFromPostman).toEqual(s.B);
    const partBForHeirs = sealPartB(bFromPostman, [p.ada.mlkemPublicKey, p.sam.mlkemPublicKey]);

    // every heir can read the letter, on their own
    for (const heir of [p.ada, p.sam]) {
      const A = openPart(s.partAEnvelope, heir);
      const B = openPart(partBForHeirs, heir);
      const K = joinKey(A, B);
      expect(K).toEqual(s.K);
      expect(await decryptLetter(K, s.letterCiphertext)).toBe(LETTER);
    }
  });

  it("an heir with only A fails", async () => {
    const p = people();
    const s = await sealLetter(p);

    const A = openPart(s.partAEnvelope, p.ada); // Ada can open A...
    expect(A).toEqual(s.A);
    // ...but not the Postman's envelope (before release she has no B)
    expectNotRecipient(() => openPart(s.partBForPostman, p.ada));
    // A alone, or A with a guessed B, never decrypts the letter
    await expect(decryptLetter(A, s.letterCiphertext)).rejects.toThrow();
    await expect(decryptLetter(joinKey(A, makeContentKey()), s.letterCiphertext)).rejects.toThrow();
  });

  it("the Postman with only B fails", async () => {
    const p = people();
    const s = await sealLetter(p);

    const B = openPart(s.partBForPostman, p.postman); // the Postman can open B...
    expect(B).toEqual(s.B);
    // ...but not A
    expectNotRecipient(() => openPart(s.partAEnvelope, p.postman));
    // B alone, or B with a guessed A, never decrypts the letter
    await expect(decryptLetter(B, s.letterCiphertext)).rejects.toThrow();
    await expect(decryptLetter(joinKey(makeContentKey(), B), s.letterCiphertext)).rejects.toThrow();
  });

  it("the wrong heir fails", async () => {
    const p = people();
    const s = await sealLetter(p);
    const partBForHeirs = sealPartB(s.B, [p.ada.mlkemPublicKey, p.sam.mlkemPublicKey]);

    expectNotRecipient(() => openPart(s.partAEnvelope, p.stranger));
    expectNotRecipient(() => openPart(partBForHeirs, p.stranger));
    expectNotRecipient(() => openPart(s.partBForPostman, p.stranger));
  });

  it("a card restored on another device opens the same envelope", async () => {
    const p = people();
    const adaSeed = newSeed();
    const adaKeys = sealKeysFromCardSeed(adaSeed);
    const K = makeContentKey();
    const { A } = splitKey(K);
    const env = sealPartA(A, [adaKeys.mlkemPublicKey, p.sam.mlkemPublicKey]);

    const restored = sealKeysFromCardSeed(cardDecode(cardEncode(adaSeed))); // "Restore from card"
    expect(openPart(env, restored)).toEqual(A);
  });

  it("needs at least one recipient", () => {
    expect(() => sealPartA(makeContentKey(), [])).toThrow();
  });
});

describe("cards", () => {
  it("encode and decode back to the same seed and the same keys", () => {
    for (let i = 0; i < 20; i++) {
      const seed = newSeed();
      const code = cardEncode(seed);
      expect(code.startsWith("tbl1_")).toBe(true);
      const back = cardDecode(code);
      expect(back).toEqual(seed);

      // same ML-KEM opening keys (heir card)
      const a = sealKeysFromCardSeed(seed);
      const b = sealKeysFromCardSeed(back);
      expect(b.mlkemPublicKey).toEqual(a.mlkemPublicKey);
      expect(b.mlkemSecretKey).toEqual(a.mlkemSecretKey);
      // same ML-DSA-87 signing keys (I'm-still-here card / guardian card)
      expect(signingKeysFromSeed(back).publicKey).toEqual(signingKeysFromSeed(seed).publicKey);
    }
  });

  it("matches QoreSeal's own derivation (no wrapper surprises)", () => {
    const seed = newSeed();
    expect(sealKeysFromCardSeed(seed).mlkemPublicKey).toEqual(sealKeysFromSeed(seed).mlkemPublicKey);
  });

  it("ignores spaces and line breaks when typed in", () => {
    const seed = newSeed();
    const code = cardEncode(seed);
    const spaced = code.slice(0, 10) + " \n " + code.slice(10, 30) + "  " + code.slice(30);
    expect(cardDecode(spaced)).toEqual(seed);
    expect(cardDecode(`  ${code}\n`)).toEqual(seed);
  });

  it("reports typos and wrong text in plain words", () => {
    const code = cardEncode(newSeed());
    const i = 12;
    const typo = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
    expect(() => cardDecode(typo)).toThrow(/typo/);
    expect(() => cardDecode(code.slice(0, -3))).toThrow(/too short|typo|character/);
    expect(() => cardDecode("hello")).toThrow(/Tabella card/);
    expect(() => cardDecode("tbl1_@@@@")).toThrow(/character/);
    expect(() => cardEncode(new Uint8Array(31))).toThrow();
  });

  it("different seeds give different codes", () => {
    expect(cardEncode(newSeed())).not.toEqual(cardEncode(newSeed()));
  });
});

describe("actionMessage matches the contract byte for byte (Foundry vectors)", () => {
  it("has the vectors the contract exported", () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(6);
    expect(vectors.chainId).toBe(9800);
  });

  for (const c of vectors.cases) {
    it(`case "${c.name}"`, () => {
      const ours = actionMessage({
        chainId: vectors.chainId,
        registry: vectors.registry,
        letterId: BigInt(c.letterId),
        action: c.action as Action,
        nonce: BigInt(c.nonce),
        payloadHash: c.payloadHash,
      });
      expect(bytesToHex(ours)).toBe(c.message);
    });
  }

  it("payload hashes match: empty, and CREATE built from its parts", () => {
    expect(EMPTY_PAYLOAD_HASH).toBe(vectors.emptyPayloadHash);
    const c = vectors.create as unknown as {
      heirs: Hex[];
      guardianKeyHash: Hex;
      quietPeriod: number;
      warningPeriod: number;
      letterCiphertext: Hex;
      partAEnvelope: Hex;
      partBForPostman: Hex;
      payloadHash: Hex;
    };
    const hash = createPayloadHash({
      heirs: c.heirs,
      guardianKeyHash: c.guardianKeyHash,
      quietPeriod: c.quietPeriod,
      warningPeriod: c.warningPeriod,
      letterCiphertext: hexToBytes(c.letterCiphertext),
      partAEnvelope: hexToBytes(c.partAEnvelope),
      partBForPostman: hexToBytes(c.partBForPostman),
    });
    expect(hash).toBe(c.payloadHash);
  });

  it("CREATE_DATED's payload hash matches the contract's, and the vectors include a dated message", () => {
    const d = (vectors as unknown as { createDated: { heirs: Hex[]; releaseAt: number; letterCiphertext: Hex; partAEnvelope: Hex; partBForPostman: Hex; payloadHash: Hex } }).createDated;
    const hash = createDatedPayloadHash({ heirs: d.heirs, releaseAt: d.releaseAt, letterCiphertext: hexToBytes(d.letterCiphertext), partAEnvelope: hexToBytes(d.partAEnvelope), partBForPostman: hexToBytes(d.partBForPostman) });
    expect(hash).toBe(d.payloadHash);
    // the date is part of what is signed: a different date gives a different hash
    expect(createDatedPayloadHash({ heirs: d.heirs, releaseAt: d.releaseAt + 1, letterCiphertext: hexToBytes(d.letterCiphertext), partAEnvelope: hexToBytes(d.partAEnvelope), partBForPostman: hexToBytes(d.partBForPostman) })).not.toBe(d.payloadHash);
    expect(vectors.cases.some((c) => c.name === "create-dated" && c.action === "CREATE_DATED")).toBe(true);
  });

  it("key hash matches the contract's keccak256(pubkey)", () => {
    expect(keyHash(hexToBytes(vectors.keyHash.pubkey))).toBe(vectors.keyHash.hash);
    expect(keccak256(hexToBytes(vectors.keyHash.pubkey))).toBe(vectors.keyHash.hash);
  });

  it("a different chain, registry, letter, action, nonce or payload changes the bytes", () => {
    const base = {
      chainId: 9800,
      registry: vectors.registry,
      letterId: 1,
      action: "CHECKIN" as Action,
      nonce: 1,
      payloadHash: EMPTY_PAYLOAD_HASH,
    };
    const m = bytesToHex(actionMessage(base));
    const variants = [
      { ...base, chainId: 1 },
      { ...base, registry: "0x2222222222222222222222222222222222222222" as Hex },
      { ...base, letterId: 2 },
      { ...base, action: "CANCEL" as Action },
      { ...base, nonce: 2 },
      { ...base, payloadHash: keccak256("0x01") },
    ];
    for (const v of variants) expect(bytesToHex(actionMessage(v))).not.toBe(m);
  });
});

describe("ML-DSA-87 signatures made by the lib", () => {
  const sigs = JSON.parse(read("lib-signatures.json")) as {
    ownerSeed: Hex;
    ownerPubkey: Hex;
    ownerKeyHash: Hex;
    createMessage: Hex;
    createSig: Hex;
    checkinMessage: Hex;
    checkinSig: Hex;
  };

  it("have the real on-chain format: 2592-byte key, 4627-byte signature", () => {
    const seed = newSeed();
    const keys = signingKeysFromSeed(seed);
    const message = actionMessage({
      chainId: 9800,
      registry: vectors.registry,
      letterId: 1,
      action: "CHECKIN",
      nonce: 1,
      payloadHash: EMPTY_PAYLOAD_HASH,
    });
    const sig = signAction(seed, message);
    expect(keys.publicKey).toHaveLength(2592);
    expect(sig).toHaveLength(4627);
    expect(mldsa87.verify(keys.publicKey, message, sig)).toBe(true);
    // wrong message / flipped bit / wrong key all fail
    expect(mldsa87.verify(keys.publicKey, message.slice(1), sig)).toBe(false);
    const bad = sig.slice();
    bad[0]! ^= 1;
    expect(mldsa87.verify(keys.publicKey, message, bad)).toBe(false);
    expect(mldsa87.verify(signingKeysFromSeed(newSeed()).publicKey, message, sig)).toBe(false);
    // deterministic: the same seed and message always give the same signature
    expect(signAction(seed, message)).toEqual(sig);
  });

  it("the committed fixture verifies against the contract's own messages", () => {
    const pub = hexToBytes(sigs.ownerPubkey);
    expect(pub).toHaveLength(2592);
    expect(keyHash(pub)).toBe(sigs.ownerKeyHash);
    for (const [msg, sig] of [
      [sigs.createMessage, sigs.createSig],
      [sigs.checkinMessage, sigs.checkinSig],
    ] as const) {
      expect(hexToBytes(sig)).toHaveLength(4627);
      expect(mldsa87.verify(pub, hexToBytes(msg), hexToBytes(sig))).toBe(true);
    }
    // and those messages are exactly the Foundry vectors
    const byName = (n: string) => vectors.cases.find((c) => c.name === n)!.message;
    expect(sigs.createMessage).toBe(byName("create"));
    expect(sigs.checkinMessage).toBe(byName("checkin"));
  });

  it("lib-signatures.json is up to date with the lib and the Foundry vectors", () => {
    // Fails if tabella-crypto.ts or contract-vectors.json changed: run `npm run fixtures` in shared/
    expect(read("lib-signatures.json")).toBe(buildSignatureFixture(vectors));
    expect(hexToBytes(sigs.ownerSeed)).toEqual(FIXTURE_OWNER_SEED);
  });
});
