/**
 * "Keep it a surprise": how the pieces fit together, with no change to the contract.
 *
 *  letterCiphertext (public, on the network)  =  "TBS1" | u16 manifest length | manifest (JSON) | AES-GCM letter
 *      the manifest holds, for the recipient and each backup: a first name, a private QUESTION, and the recipient's
 *      opening card LOCKED with that person's answer (see app/src/lib/locks.ts: Argon2id + AES-GCM).
 *      No answer, no contact detail and no plain card is in it.
 *
 *  partBForPostman (sealed to the Postman's key)  =  B (32 bytes) | contact package (JSON)
 *      the contact package holds every email address and phone number, and the card's fingerprint, so only the
 *      Postman can read them, and only when it delivers.
 *
 * Works in browsers and Node 20+ (no node-only imports).
 */
import { mldsa87 } from "@qorechain/pqc";
import { open, seal, type SealKeyPair } from "@qorechain/qoreseal";
import type { Hex } from "viem";
import { EVM_CHAIN_ID, KEY_BYTES, MAX_LETTER_BYTES, SEAL_CHAIN_ID, SEAL_PURPOSE, signingKeysFromSeed } from "./tabella-crypto";

export const MAGIC = new TextEncoder().encode("TBS1");
export const MAX_BACKUPS = 3;

/** The slow-hash settings. Stored in the manifest so a later change of settings never breaks old letters. */
export interface KdfParams {
  alg: "argon2id";
  /** memory in KiB */
  m: number;
  /** passes */
  t: number;
  /** lanes */
  p: number;
}
export const KDF_DEFAULT: KdfParams = { alg: "argon2id", m: 65_536, t: 3, p: 1 }; // 64 MiB, 3 passes
export const KDF_MIN: Pick<KdfParams, "m" | "t"> = { m: 32_768, t: 2 };

/** A card locked with one person's answer. All fields are base64url. */
export interface Lock {
  salt: string;
  nonce: string;
  ct: string;
}
export interface ManifestPerson {
  /** first name, shown in the screens ("Open it with Mia") */
  name: string;
  /** their private question */
  question: string;
  lock: Lock;
}
export interface Manifest {
  v: 1;
  kdf: KdfParams;
  /** the person the letter is for */
  recipient: ManifestPerson;
  /** up to three people who can unlock the same card, each with their own question */
  backups: (ManifestPerson & { relation: string })[];
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
}
/** Sealed to the Postman. `mode: "demo"` runs the escalation ladder in minutes instead of days. */
export interface PostmanPackage {
  v: 1;
  mode: "real" | "demo";
  /** the owner's first name, for the messages ("Alex left you a letter") */
  owner: string;
  /** keccak256 of the card's signing key: how the Postman checks "opened" reports */
  cardKeyHash: Hex;
  recipient: Contact;
  backups: (Contact & { relation: string })[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** "  Rue de l'Église " -> "rue de l'eglise": lowercase, no accents, one space between words, trimmed. */
export function normalizeAnswer(answer: string): string {
  return answer
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function b64u(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url");
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

// ------------------------------------------------------------------ the public container

export function packContainer(manifest: Manifest, letterCiphertext: Uint8Array): Uint8Array {
  const m = enc.encode(JSON.stringify(manifest));
  if (m.length > 0xffff) throw new Error("the manifest is too large");
  const out = new Uint8Array(MAGIC.length + 2 + m.length + letterCiphertext.length);
  out.set(MAGIC, 0);
  out[4] = m.length >> 8;
  out[5] = m.length & 0xff;
  out.set(m, 6);
  out.set(letterCiphertext, 6 + m.length);
  return out;
}

/** The manifest and the plain AES-GCM letter, or null when this is an ordinary (invite) letter. */
export function unpackContainer(data: Uint8Array): { manifest: Manifest; ciphertext: Uint8Array } | null {
  if (data.length < 6 || !MAGIC.every((b, i) => data[i] === b)) return null;
  const len = (data[4]! << 8) | data[5]!;
  if (6 + len > data.length) return null;
  try {
    const manifest = JSON.parse(dec.decode(data.slice(6, 6 + len))) as Manifest;
    if (manifest?.v !== 1 || !manifest.recipient || !Array.isArray(manifest.backups)) return null;
    return { manifest, ciphertext: data.slice(6 + len) };
  } catch {
    return null;
  }
}

/** How much letter text still fits next to a manifest of this size. */
export const maxLetterBytesFor = (manifestBytes: number) => MAX_LETTER_BYTES - 6 - manifestBytes;

// ------------------------------------------------------------------ the Postman's package

/** B and the contact package in one envelope for the Postman. */
export function sealPostmanPackage(B: Uint8Array, pkg: PostmanPackage, postmanMlkemPublicKey: Uint8Array): Uint8Array {
  if (B.length !== KEY_BYTES) throw new Error("part B must be 32 bytes");
  const json = enc.encode(JSON.stringify(pkg));
  const plaintext = new Uint8Array(KEY_BYTES + json.length);
  plaintext.set(B, 0);
  plaintext.set(json, KEY_BYTES);
  return seal({ chainId: SEAL_CHAIN_ID, purpose: SEAL_PURPOSE, recipients: [{ mlkemPublicKey: postmanMlkemPublicKey }], plaintext, mode: "mlkem" });
}

/** Part B and, for a surprise letter, the contact package (undefined for an ordinary letter). */
export function openPostmanPackage(envelope: Uint8Array, keys: SealKeyPair): { B: Uint8Array; pkg?: PostmanPackage } {
  const plain = open({ chainId: SEAL_CHAIN_ID, purpose: SEAL_PURPOSE, envelope, keys });
  if (plain.length < KEY_BYTES) throw new Error("opened part is too short");
  const B = plain.slice(0, KEY_BYTES);
  if (plain.length === KEY_BYTES) return { B };
  const pkg = JSON.parse(dec.decode(plain.slice(KEY_BYTES))) as PostmanPackage;
  if (pkg?.v !== 1 || !pkg.recipient) throw new Error("unreadable contact package");
  return { B, pkg };
}

// ------------------------------------------------------------------ "opened"

/** What the unlocked card signs to say "this letter was opened". */
export function openedMessage(registry: Hex, letterId: bigint): Uint8Array {
  return enc.encode(`tabella-v1/opened|${EVM_CHAIN_ID}|${registry.toLowerCase()}|${letterId}`);
}
export function signOpened(cardSeed: Uint8Array, registry: Hex, letterId: bigint): Uint8Array {
  return mldsa87.sign(signingKeysFromSeed(cardSeed).secretKey, openedMessage(registry, letterId));
}
export function verifyOpened(publicKey: Uint8Array, sig: Uint8Array, registry: Hex, letterId: bigint): boolean {
  try {
    return mldsa87.verify(publicKey, openedMessage(registry, letterId), sig);
  } catch {
    return false;
  }
}
