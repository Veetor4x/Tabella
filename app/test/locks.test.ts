import { describe, expect, it } from "vitest";
import { KDF_DEFAULT, KDF_MIN, normalizeAnswer } from "../../shared/surprise";
import { newSeed } from "../../shared/tabella-crypto";
import { WrongAnswer, lockSeed, unlockSeed } from "../src/lib/locks";

describe("locking the card with an answer (Argon2id + AES-GCM, strong settings)", () => {
  it("uses strong settings by default: at least 64 MiB, 3 passes", () => {
    expect(KDF_DEFAULT.alg).toBe("argon2id");
    expect(KDF_DEFAULT.m).toBeGreaterThanOrEqual(65_536);
    expect(KDF_DEFAULT.t).toBeGreaterThanOrEqual(3);
  });
  it("the right answer opens it, even with different case, spaces and accents", async () => {
    const seed = newSeed();
    const t0 = Date.now();
    const lock = await lockSeed(seed, "  Rue de l'Église ");
    const took = Date.now() - t0;
    for (const a of ["rue de l'eglise", "RUE   DE L'ÉGLISE", "Rue de l'Eglise  "]) expect(Buffer.from(await unlockSeed(lock, a)).equals(Buffer.from(seed))).toBe(true);
    expect(took).toBeGreaterThan(100); // it is meant to be slow-ish (a few tenths of a second to a couple of seconds)
    expect(took).toBeLessThan(15_000);
  }, 60_000);
  it("a wrong answer is refused cleanly, and an empty one never locks anything", async () => {
    const lock = await lockSeed(newSeed(), "blue bicycle");
    await expect(unlockSeed(lock, "red bicycle")).rejects.toBeInstanceOf(WrongAnswer);
    await expect(unlockSeed(lock, "")).rejects.toThrow(/empty/);
    await expect(lockSeed(newSeed(), "   ")).rejects.toThrow(/empty/);
  }, 60_000);
  it("each lock has its own salt and nonce, so two people with the same answer get different locks", async () => {
    const seed = newSeed();
    const a = await lockSeed(seed, "same answer");
    const b = await lockSeed(seed, "same answer");
    expect(a.salt).not.toBe(b.salt);
    expect(a.ct).not.toBe(b.ct);
  }, 60_000);
  it("refuses weak settings, and a tampered lock does not open", async () => {
    const lock = await lockSeed(newSeed(), "x marks the spot");
    await expect(unlockSeed(lock, "x marks the spot", { alg: "argon2id", m: KDF_MIN.m / 2, t: 1, p: 1 })).rejects.toThrow(/unsupported/);
    const bad = { ...lock, ct: lock.ct.slice(0, -2) + (lock.ct.endsWith("AA") ? "BB" : "AA") };
    await expect(unlockSeed(bad, "x marks the spot")).rejects.toBeInstanceOf(WrongAnswer);
    expect(normalizeAnswer("x marks the spot")).toBe("x marks the spot");
  }, 60_000);
});
