/**
 * Sealing a letter, end to end, in the browser. Uses the shared crypto library (shared/tabella-crypto.ts):
 * the letter is locked on this device, split in two halves, one half for the people who will open it and
 * one for the Postman, and the helper sends the result to the network. Nothing readable ever leaves here.
 */
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { createPublicClient, http, parseAbi, toHex, type Hex } from "viem";
import {
  EVM_CHAIN_ID,
  MAX_LETTER_BYTES,
  actionMessage,
  cardEncode,
  createDatedPayloadHash,
  createPayloadHash,
  encryptLetter,
  keyHash,
  makeContentKey,
  newSeed,
  sealPartA,
  sealPartB,
  signAction,
  signingKeysFromSeed,
  splitKey,
} from "../../../shared/tabella-crypto";
import { sealPostmanPackage, type PostmanPackage } from "../../../shared/surprise";
import { REGISTRY, evmRpcUrl, restUrl } from "./config";
import { ownerReminders } from "./reminders";
import { HelperError, SealProblem, relay, warmUp } from "./helper";
import type { Reminders, SealedLetter } from "./storage";

export { MAX_LETTER_BYTES };

export const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;
export const hexToU8 = (h: string) => Uint8Array.from(h.slice(2).match(/../g)!.map((b) => parseInt(b, 16)));

export interface SealInput {
  text: string;
  heirs: { name: string; evm: Hex; qor: string }[];
  guardianName: string | null;
  ownerName?: string;
  quiet: number;
  warning: number;
  whenLabel: string;
  /** a dated letter: the unix time it opens, or "demo" for 2 minutes from now. Then there is no quiet time and no guardian. */
  releaseAt?: number | "demo";
  /** the owner's reminders (emailed while the letter is in its warning); ignored for a dated letter */
  reminders?: Reminders;
  /** made on the /test page: labelled "Test" */
  test?: boolean;
}

/** The steps shown to the person while sealing. */
export type Progress = "postman" | "people" | "wrap" | "send";

/** Is this person set up to receive a letter? (They have registered their opening card.) */
export async function isReady(qor: string): Promise<boolean> {
  const st = await fetchKemKey({ rest: restUrl(), address: qor });
  return st.registered && !!st.publicKey;
}

export async function nextLetterId(): Promise<bigint> {
  const client = createPublicClient({ transport: http(evmRpcUrl()) });
  const count = await client.readContract({
    address: REGISTRY,
    abi: parseAbi(["function letterCount() view returns (uint256)"]),
    functionName: "letterCount",
  });
  return count + 1n;
}

/** The exact JSON `POST /relay` expects for a new letter. Pure, so it can be tested against the helper's validator. */
export function buildCreateBody(p: {
  heirs: Hex[];
  guardianKeyHash: Hex;
  quietPeriod: number;
  warningPeriod: number;
  letterCiphertext: Uint8Array;
  partAEnvelope: Uint8Array;
  partBForPostman: Uint8Array;
  ownerPublicKey: Uint8Array;
  sig: Uint8Array;
}) {
  return {
    fn: "createLetter",
    args: {
      heirs: p.heirs,
      guardianKeyHash: p.guardianKeyHash,
      quietPeriod: p.quietPeriod,
      warningPeriod: p.warningPeriod,
      letterCiphertext: toHex(p.letterCiphertext),
      partAEnvelope: toHex(p.partAEnvelope),
      partBForPostman: toHex(p.partBForPostman),
    },
    pubkey: toHex(p.ownerPublicKey),
    sig: toHex(p.sig),
  };
}

export function buildDatedBody(p: {
  heirs: Hex[];
  releaseAt: number;
  letterCiphertext: Uint8Array;
  partAEnvelope: Uint8Array;
  partBForPostman: Uint8Array;
  ownerPublicKey: Uint8Array;
  sig: Uint8Array;
}) {
  return {
    fn: "createDatedLetter",
    args: {
      heirs: p.heirs,
      releaseAt: String(p.releaseAt),
      letterCiphertext: toHex(p.letterCiphertext),
      partAEnvelope: toHex(p.partAEnvelope),
      partBForPostman: toHex(p.partBForPostman),
    },
    pubkey: toHex(p.ownerPublicKey),
    sig: toHex(p.sig),
  };
}

/** The network's own clock (unix seconds): a dated letter's day is checked against it, not against the phone's. */
export async function chainNowSeconds(): Promise<number> {
  const client = createPublicClient({ transport: http(evmRpcUrl()) });
  return Number((await client.getBlock({ blockTag: "latest" })).timestamp);
}

export const DEMO_DATED_SECONDS = 120;

/**
 * Sign a new letter (ordinary or dated) and have the helper send it. If someone else sealed a letter a moment ago,
 * our number is taken: look again, once or twice. Returns the new letter's number and, for a dated letter, its date.
 */
export async function sendCreate(p: {
  ownerSeed: Uint8Array;
  ownerPublicKey: Uint8Array;
  heirs: Hex[];
  guardianKeyHash: Hex;
  quiet: number;
  warning: number;
  releaseAt?: number | "demo";
  letterCiphertext: Uint8Array;
  partAEnvelope: Uint8Array;
  partBForPostman: Uint8Array;
}): Promise<{ txHash: string; letterId: bigint; releaseAt?: number }> {
  const releaseAt = p.releaseAt === "demo" ? (await chainNowSeconds()) + DEMO_DATED_SECONDS : p.releaseAt;
  const parts = { heirs: p.heirs, letterCiphertext: p.letterCiphertext, partAEnvelope: p.partAEnvelope, partBForPostman: p.partBForPostman };
  const payloadHash = releaseAt ? createDatedPayloadHash({ ...parts, releaseAt }) : createPayloadHash({ ...parts, guardianKeyHash: p.guardianKeyHash, quietPeriod: p.quiet, warningPeriod: p.warning });
  for (let attempt = 0; ; attempt++) {
    const letterId = await nextLetterId();
    const sig = signAction(p.ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId, action: releaseAt ? "CREATE_DATED" : "CREATE", nonce: 0, payloadHash }));
    try {
      const body = releaseAt
        ? buildDatedBody({ ...parts, releaseAt, ownerPublicKey: p.ownerPublicKey, sig })
        : buildCreateBody({ ...parts, guardianKeyHash: p.guardianKeyHash, quietPeriod: p.quiet, warningPeriod: p.warning, ownerPublicKey: p.ownerPublicKey, sig });
      const { txHash } = await relay(body);
      return { txHash, letterId, releaseAt };
    } catch (e) {
      const raced = e instanceof HelperError && e.code === "would_revert" && e.reason === "InvalidSignature";
      if (!raced || attempt >= 2) throw e;
    }
  }
}

export async function sealLetter(input: SealInput, onProgress: (p: Progress) => void = () => {}): Promise<SealedLetter> {
  if (new TextEncoder().encode(input.text).length > MAX_LETTER_BYTES) throw new SealProblem("That letter is a little too long to seal. Please shorten it.");

  // 1. The Postman (wakes the helper if it was asleep).
  onProgress("postman");
  const health = await warmUp();
  const postmanPublic = hexToU8(health.postman!.mlkemPublicKey);

  // 2. Each person's opening card must already be set up: the letter is sealed just for them.
  onProgress("people");
  const heirKeys: Uint8Array[] = [];
  for (const h of input.heirs) {
    const st = await fetchKemKey({ rest: restUrl(), address: h.qor });
    if (!st.registered || !st.publicKey) throw new SealProblem(`${h.name} hasn't set up their opening card yet, so the letter can't be sealed for them.`);
    heirKeys.push(st.publicKey);
  }

  // 3. Lock the letter on this device.
  onProgress("wrap");
  const ownerSeed = newSeed(); // the I'm-still-here card
  const guardianSeed = input.guardianName && !input.releaseAt ? newSeed() : undefined; // the guardian card (a dated letter has none)
  const owner = signingKeysFromSeed(ownerSeed);
  const guardianKeyHash = guardianSeed ? keyHash(signingKeysFromSeed(guardianSeed).publicKey) : ZERO_HASH;

  const K = makeContentKey();
  const letterCiphertext = await encryptLetter(K, input.text);
  const { A, B } = splitKey(K);
  const partAEnvelope = sealPartA(A, heirKeys);
  // With reminders, Part B travels with a small package for the Postman (the owner's email and wording; no recipient, so no ladder).
  const reminders = ownerReminders(input.reminders, !!input.releaseAt);
  const pkg: PostmanPackage | null = reminders
    ? { v: 1, mode: input.test ? "demo" : "real", reminders, owner: input.ownerName?.trim() || "", cardKeyHash: ZERO_HASH, recipient: { name: "", email: "", phone: "" }, backups: [] }
    : null;
  const partBForPostman = pkg ? sealPostmanPackage(B, pkg, postmanPublic) : sealPartB(B, postmanPublic);

  // 4. Sign and send.
  onProgress("send");
  const sent = await sendCreate({ ownerSeed, ownerPublicKey: owner.publicKey, heirs: input.heirs.map((h) => h.evm), guardianKeyHash, quiet: input.quiet, warning: input.warning, releaseAt: input.releaseAt, letterCiphertext, partAEnvelope, partBForPostman });
  const { txHash, letterId } = sent;

  return {
    version: 1,
    letterId: letterId.toString(),
    ownerName: input.ownerName?.trim() || undefined,
    txHash,
    createdAt: new Date().toISOString(),
    registry: REGISTRY,
    heirs: input.heirs,
    guardianName: input.releaseAt ? null : input.guardianName,
    whenLabel: input.whenLabel,
    quietSeconds: sent.releaseAt ? 0 : input.quiet,
    warningSeconds: sent.releaseAt ? 0 : input.warning,
    ...(sent.releaseAt ? { releaseAt: sent.releaseAt } : {}),
    ownerCard: cardEncode(ownerSeed),
    guardianCard: guardianSeed ? cardEncode(guardianSeed) : null,
    ...(input.test ? { test: true } : {}),
  };
}
