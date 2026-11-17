/**
 * Tabella shared crypto (brief section 7). Used by the browser app and the Node helper.
 *
 *   Letter  --AES-256-GCM(K)-->  ciphertext (stored on-chain)
 *   K = A XOR B   (B is random)
 *   A  --QoreSeal-->  heirs        (all heirs in one envelope)
 *   B  --QoreSeal-->  the Postman  (re-sealed to the heirs on release)
 *
 * Whoever holds only A, or only B, learns nothing about K.
 * Owner / guardian actions are signed with ML-DSA-87; the contract verifies them on-chain.
 *
 * Works with WebCrypto + noble-based libs only, so it runs unchanged in browsers and Node 20+.
 */
import { mldsa87, shake256 } from "@qorechain/pqc";
import { open, seal, sealKeysFromSeed, type SealKeyPair } from "@qorechain/qoreseal";
import { encodeAbiParameters, hexToBytes, keccak256, parseAbiParameters, type Hex } from "viem";

export type { SealKeyPair };

// ---------------------------------------------------------------- constants

/** QoreChain Cosmos chain id; part of every QoreSeal envelope's key derivation. */
export const SEAL_CHAIN_ID = "qorechain-diana";
/** What the sealed data is for (QoreSeal spec: purpose). */
export const SEAL_PURPOSE = "tabella-v1";
/** EVM chain id of qorechain-diana; this is `block.chainid` inside the contract. */
export const EVM_CHAIN_ID = 9800n;

/** Must match TabellaRegistry.MAX_BYTES: every stored blob is capped at 8192 bytes. */
export const CONTRACT_MAX_BYTES = 8192;
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
/** Longest letter (UTF-8 bytes) that still fits on-chain after nonce + tag. */
export const MAX_LETTER_BYTES = CONTRACT_MAX_BYTES - GCM_NONCE_BYTES - GCM_TAG_BYTES;

export const SEED_BYTES = 32;
export const KEY_BYTES = 32;

export type Action = "CREATE" | "CREATE_DATED" | "CHECKIN" | "PAUSE" | "CANCEL";

// ------------------------------------------------------------------ helpers

function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** A fresh random 32-byte seed (for an opening card, I'm-still-here card, guardian card). */
export function newSeed(): Uint8Array {
  return randomBytes(SEED_BYTES);
}

function assertLength(name: string, b: Uint8Array, n: number): void {
  if (b.length !== n) throw new Error(`${name} must be ${n} bytes, got ${b.length}`);
}

function toBase64Url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url");
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// --------------------------------------------------------- letter encryption

/** A fresh random AES-256 content key K. */
export function makeContentKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

async function aesKey(K: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  assertLength("content key", K, KEY_BYTES);
  return globalThis.crypto.subtle.importKey("raw", K as BufferSource, "AES-GCM", false, [usage]);
}

/** AES-256-GCM. Output: 12-byte random nonce || ciphertext || 16-byte tag. */
export async function encryptLetter(K: Uint8Array, text: string): Promise<Uint8Array> {
  const plain = new TextEncoder().encode(text);
  if (plain.length === 0) throw new Error("the letter is empty");
  if (plain.length > MAX_LETTER_BYTES) {
    throw new Error(`the letter is too long (${plain.length} bytes, the limit is ${MAX_LETTER_BYTES})`);
  }
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    await aesKey(K, "encrypt"),
    plain as BufferSource,
  );
  const out = new Uint8Array(GCM_NONCE_BYTES + ct.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ct), GCM_NONCE_BYTES);
  return out;
}

/** Throws if K is wrong or the ciphertext was changed (GCM authenticates it). */
export async function decryptLetter(K: Uint8Array, data: Uint8Array): Promise<string> {
  if (data.length < GCM_NONCE_BYTES + GCM_TAG_BYTES) throw new Error("ciphertext is too short");
  const nonce = data.slice(0, GCM_NONCE_BYTES);
  const body = data.slice(GCM_NONCE_BYTES);
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    await aesKey(K, "decrypt"),
    body as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

// --------------------------------------------------------------- key split

/** K = A XOR B with B random: each half alone is uniformly random. */
export function splitKey(K: Uint8Array): { A: Uint8Array; B: Uint8Array } {
  assertLength("content key", K, KEY_BYTES);
  const B = randomBytes(KEY_BYTES);
  const A = K.map((k, i) => k ^ B[i]!);
  return { A, B };
}

export function joinKey(A: Uint8Array, B: Uint8Array): Uint8Array {
  assertLength("part A", A, KEY_BYTES);
  assertLength("part B", B, KEY_BYTES);
  return A.map((a, i) => a ^ B[i]!);
}

// ----------------------------------------------------------------- QoreSeal

function sealPart(part: Uint8Array, mlkemPubkeys: Uint8Array[]): Uint8Array {
  assertLength("key part", part, KEY_BYTES);
  if (mlkemPubkeys.length === 0) throw new Error("at least one recipient is needed");
  return seal({
    chainId: SEAL_CHAIN_ID,
    purpose: SEAL_PURPOSE,
    recipients: mlkemPubkeys.map((mlkemPublicKey) => ({ mlkemPublicKey })),
    plaintext: part,
    mode: "mlkem", // ML-KEM-1024 only: no recipient card needed, just the key registered for the address
  });
}

/** Seal Part A to every heir (one envelope, any heir can open it). */
export function sealPartA(A: Uint8Array, heirMlkemPubkeys: Uint8Array[]): Uint8Array {
  return sealPart(A, heirMlkemPubkeys);
}

/**
 * Seal Part B to the Postman. On release the Postman calls this again with the heirs' keys
 * (an array) to hand B over, so this accepts one key or several.
 */
export function sealPartB(B: Uint8Array, recipients: Uint8Array | Uint8Array[]): Uint8Array {
  return sealPart(B, Array.isArray(recipients) ? recipients : [recipients]);
}

/** Open a sealed part with your opening keys. Throws if you are not a recipient. */
export function openPart(envelope: Uint8Array, sealKeys: SealKeyPair): Uint8Array {
  const part = open({ chainId: SEAL_CHAIN_ID, purpose: SEAL_PURPOSE, envelope, keys: sealKeys });
  assertLength("opened key part", part, KEY_BYTES);
  return part;
}

/** ML-KEM-1024 opening keys from a card seed. */
export function sealKeysFromCardSeed(seed: Uint8Array): SealKeyPair {
  assertLength("card seed", seed, SEED_BYTES);
  return sealKeysFromSeed(seed);
}

// ------------------------------------------------------- signed actions (ML-DSA-87)

export interface ActionMessageParams {
  /** EVM chain id (block.chainid): 9800n on qorechain-diana. */
  chainId: bigint | number;
  /** TabellaRegistry address. */
  registry: Hex;
  letterId: bigint | number;
  action: Action;
  /** The letter's nonce at signing time (0 for CREATE). */
  nonce: bigint | number;
  /** keccak256 of the action's payload: EMPTY_PAYLOAD_HASH, or createPayloadHash(...). */
  payloadHash: Hex;
}

/**
 * The exact bytes TabellaRegistry hands to pqcVerify:
 *   abi.encode("TABELLA_V1", chainid, registry, letterId, action, nonce, payloadHash)
 */
export function actionMessage(p: ActionMessageParams): Uint8Array {
  const encoded = encodeAbiParameters(
    parseAbiParameters("string, uint256, address, uint256, string, uint256, bytes32"),
    ["TABELLA_V1", BigInt(p.chainId), p.registry, BigInt(p.letterId), p.action, BigInt(p.nonce), p.payloadHash],
  );
  return hexToBytes(encoded);
}

/** Payload hash for CHECKIN / PAUSE / CANCEL (empty payload). */
export const EMPTY_PAYLOAD_HASH: Hex = keccak256("0x");

export interface CreatePayload {
  heirs: Hex[];
  guardianKeyHash: Hex; // 0x00..00 for no guardian
  quietPeriod: bigint | number;
  warningPeriod: bigint | number;
  letterCiphertext: Uint8Array;
  partAEnvelope: Uint8Array;
  partBForPostman: Uint8Array;
}

export interface DatedPayload {
  heirs: Hex[];
  /** the exact moment it opens (unix seconds) */
  releaseAt: bigint | number;
  letterCiphertext: Uint8Array;
  partAEnvelope: Uint8Array;
  partBForPostman: Uint8Array;
}

/** A dated letter opens at most this far ahead: 50 years, leap days included (18,263 days), as in the contract. */
export const MAX_DATED_AHEAD_SECONDS = 18_263 * 86_400;

/** Payload hash for CREATE_DATED; mirrors TabellaRegistry.createDatedLetter. */
export function createDatedPayloadHash(p: DatedPayload): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address[], uint64, bytes32, bytes32, bytes32"), [
      p.heirs,
      BigInt(p.releaseAt),
      keccak256(p.letterCiphertext),
      keccak256(p.partAEnvelope),
      keccak256(p.partBForPostman),
    ]),
  );
}

/** Payload hash for CREATE; mirrors TabellaRegistry.createLetter. */
export function createPayloadHash(p: CreatePayload): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address[], bytes32, uint64, uint64, bytes32, bytes32, bytes32"),
      [
        p.heirs,
        p.guardianKeyHash,
        BigInt(p.quietPeriod),
        BigInt(p.warningPeriod),
        keccak256(p.letterCiphertext),
        keccak256(p.partAEnvelope),
        keccak256(p.partBForPostman),
      ],
    ),
  );
}

/** The ML-DSA-87 keypair for an I'm-still-here card or guardian card. */
export function signingKeysFromSeed(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  assertLength("card seed", seed, SEED_BYTES);
  return mldsa87.keygen(seed);
}

/** keccak256 of the public key: what the contract stores as ownerKeyHash / guardianKeyHash. */
export function keyHash(publicKey: Uint8Array): Hex {
  return keccak256(publicKey);
}

/** ML-DSA-87 signature (4627 bytes) over `message` with the key derived from `seed`. Deterministic. */
export function signAction(seed: Uint8Array, message: Uint8Array): Uint8Array {
  return mldsa87.sign(signingKeysFromSeed(seed).secretKey, message);
}

// -------------------------------------------------------------------- cards

const CARD_PREFIX = "tbl1_";
const CHECK_BYTES = 4;

function cardChecksum(seed: Uint8Array): Uint8Array {
  return shake256(new Uint8Array([...new TextEncoder().encode(CARD_PREFIX), ...seed]), CHECK_BYTES);
}

/**
 * The text on a printed card, and what its QR code holds: "tbl1_" + base64url(seed + checksum).
 * The checksum catches typos when someone types the code in by hand.
 */
export function cardEncode(seed: Uint8Array): string {
  assertLength("card seed", seed, SEED_BYTES);
  return CARD_PREFIX + toBase64Url(new Uint8Array([...seed, ...cardChecksum(seed)]));
}

/** Reads a card code back into its seed. Ignores spaces and line breaks. Throws a readable error on a typo. */
export function cardDecode(code: string): Uint8Array {
  const clean = code.replace(/\s+/g, "");
  if (!clean.startsWith(CARD_PREFIX)) throw new Error("This doesn't look like a Tabella card.");
  let raw: Uint8Array;
  try {
    raw = fromBase64Url(clean.slice(CARD_PREFIX.length));
  } catch {
    throw new Error("The card code has a character that doesn't belong. Check it and try again.");
  }
  if (raw.length !== SEED_BYTES + CHECK_BYTES) throw new Error("The card code is too short or too long.");
  const seed = raw.slice(0, SEED_BYTES);
  const check = raw.slice(SEED_BYTES);
  const expected = cardChecksum(seed);
  if (!check.every((b, i) => b === expected[i])) throw new Error("The card code has a typo. Check it and try again.");
  return seed;
}

