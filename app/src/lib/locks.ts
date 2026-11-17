/**
 * Locking the recipient's opening card with a person's private answer, in the browser.
 * Argon2id (64 MiB, 3 passes, one lane: about a second on a phone) turns the normalised answer into a key;
 * AES-256-GCM locks the 32-byte card seed with it. A wrong answer fails the GCM check, so it can never be mistaken
 * for a right one. The locked copies are public (on the network): the answer is the only lock, so a slow hash matters.
 */
import { argon2id } from "hash-wasm";
import { KDF_DEFAULT, KDF_MIN, b64u, normalizeAnswer, unb64u, type KdfParams, type Lock } from "../../../shared/surprise";

const enc = new TextEncoder();
const AAD = enc.encode("tabella-v1/answer-lock");

export class WrongAnswer extends Error {
  constructor() {
    super("wrong answer");
    this.name = "WrongAnswer";
  }
}

async function keyFrom(answer: string, salt: Uint8Array, kdf: KdfParams): Promise<CryptoKey> {
  if (kdf.alg !== "argon2id" || kdf.m < KDF_MIN.m || kdf.t < KDF_MIN.t) throw new Error("unsupported lock settings");
  const norm = normalizeAnswer(answer);
  if (!norm) throw new Error("the answer is empty");
  const raw = await argon2id({ password: norm, salt, parallelism: kdf.p, iterations: kdf.t, memorySize: kdf.m, hashLength: 32, outputType: "binary" });
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Lock a 32-byte card seed with an answer. */
export async function lockSeed(seed: Uint8Array, answer: string, kdf: KdfParams = KDF_DEFAULT): Promise<Lock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(answer, salt, kdf);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource, additionalData: AAD as BufferSource }, key, seed as BufferSource));
  return { salt: b64u(salt), nonce: b64u(nonce), ct: b64u(ct) };
}

/** The card seed, or WrongAnswer. */
export async function unlockSeed(lock: Lock, answer: string, kdf: KdfParams = KDF_DEFAULT): Promise<Uint8Array> {
  const key = await keyFrom(answer, unb64u(lock.salt), kdf);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(lock.nonce) as BufferSource, additionalData: AAD as BufferSource }, key, unb64u(lock.ct) as BufferSource);
    return new Uint8Array(plain);
  } catch {
    throw new WrongAnswer();
  }
}
