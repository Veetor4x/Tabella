import { describe, expect, it } from "vitest";
import { sealKeysFromCardSeed, newSeed, keyHash, signingKeysFromSeed, makeContentKey, encryptLetter, decryptLetter, splitKey, MAX_LETTER_BYTES } from "./tabella-crypto";
import { MAGIC, maxLetterBytesFor, normalizeAnswer, openPostmanPackage, packContainer, sealPostmanPackage, signOpened, unpackContainer, verifyOpened, type Manifest, type PostmanPackage } from "./surprise";

const lock = { salt: "c2FsdA", nonce: "bm9uY2U", ct: "Y3Q" };
const manifest: Manifest = {
  v: 1,
  kdf: { alg: "argon2id", m: 65536, t: 3, p: 1 },
  recipient: { name: "Mia", question: "What was the name of our first dog?", lock },
  backups: [{ name: "Sofia", relation: "friend", question: "Where did we meet?", lock }],
};

describe("normalised answers", () => {
  it("lowercases, trims, collapses spaces and drops accents, so small differences still match", () => {
    expect(normalizeAnswer("  Rue de l'Église  ")).toBe("rue de l'eglise");
    expect(normalizeAnswer("Rex\t\tthe  DOG ")).toBe("rex the dog");
    expect(normalizeAnswer("ÉLISE")).toBe(normalizeAnswer("elise"));
    expect(normalizeAnswer("   ")).toBe("");
  });
});

describe("the public container", () => {
  it("round-trips the manifest and the letter, and leaves ordinary letters alone", async () => {
    const K = makeContentKey();
    const ct = await encryptLetter(K, "Dear Mia");
    const packed = packContainer(manifest, ct);
    expect(Array.from(packed.slice(0, 4))).toEqual(Array.from(MAGIC));
    const got = unpackContainer(packed)!;
    expect(got.manifest).toEqual(manifest);
    expect(await decryptLetter(K, got.ciphertext)).toBe("Dear Mia");
    expect(unpackContainer(ct)).toBeNull(); // an invite letter's plain ciphertext is not a container
    expect(unpackContainer(new Uint8Array(3))).toBeNull();
    const broken = packed.slice();
    broken[5] = 0xff;
    expect(unpackContainer(broken)).toBeNull();
  });
  it("reserves room for the manifest inside the network's size limit", () => {
    expect(maxLetterBytesFor(1500)).toBe(MAX_LETTER_BYTES - 6 - 1500);
    const m = new TextEncoder().encode(JSON.stringify({ ...manifest, backups: [manifest.backups[0], manifest.backups[0], manifest.backups[0]] }));
    expect(m.length).toBeLessThan(2000); // four people fit comfortably
  });
});

describe("the Postman's package", () => {
  const postman = sealKeysFromCardSeed(newSeed());
  const pkg: PostmanPackage = {
    v: 1,
    mode: "demo",
    owner: "Alex",
    cardKeyHash: keyHash(signingKeysFromSeed(newSeed()).publicKey),
    recipient: { name: "Mia", email: "mia@example.com", phone: "+15550100" },
    backups: [{ name: "Sofia", relation: "friend", email: "sofia@example.com", phone: "+15550101" }],
  };
  it("carries B and the contacts, readable only with the Postman's keys", () => {
    const { B } = splitKey(makeContentKey());
    const env = sealPostmanPackage(B, pkg, postman.mlkemPublicKey);
    const opened = openPostmanPackage(env, postman);
    expect(Buffer.from(opened.B).equals(Buffer.from(B))).toBe(true);
    expect(opened.pkg).toEqual(pkg);
    expect(() => openPostmanPackage(env, sealKeysFromCardSeed(newSeed()))).toThrow();
    // the contacts are not visible in the envelope bytes
    const text = Buffer.from(env).toString("latin1");
    expect(text).not.toContain("mia@example.com");
    expect(text).not.toContain("+15550100");
  });
  it("an ordinary letter's part B (32 bytes only) opens without a package", async () => {
    const { sealPartB } = await import("./tabella-crypto");
    const { B } = splitKey(makeContentKey());
    const opened = openPostmanPackage(sealPartB(B, postman.mlkemPublicKey), postman);
    expect(opened.pkg).toBeUndefined();
    expect(Buffer.from(opened.B).equals(Buffer.from(B))).toBe(true);
  });
});

describe('"opened" reports', () => {
  const REG = "0xC0808aF18e2283dFE4d026315a462349561fFd1c" as const;
  it("verify for the right card and letter, and for nothing else", () => {
    const seed = newSeed();
    const pub = signingKeysFromSeed(seed).publicKey;
    const sig = signOpened(seed, REG, 26n);
    expect(verifyOpened(pub, sig, REG, 26n)).toBe(true);
    expect(verifyOpened(pub, sig, REG, 27n)).toBe(false);
    expect(verifyOpened(signingKeysFromSeed(newSeed()).publicKey, sig, REG, 26n)).toBe(false);
    const bad = sig.slice();
    bad[10] ^= 1;
    expect(verifyOpened(pub, bad, REG, 26n)).toBe(false);
    expect(verifyOpened(pub, new Uint8Array(5), REG, 26n)).toBe(false);
  });
});
