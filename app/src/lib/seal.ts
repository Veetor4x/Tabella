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
import { REGISTRY, evmRpcUrl, restUrl } from "./config";
import { HelperError, SealProblem, relay, warmUp } from "./helper";
import type { SealedLetter } from "./storage";

export { MAX_LETTER_BYTES };

const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;
const hexToU8 = (h: string) => Uint8Array.from(h.slice(2).match(/../g)!.map((b) => parseInt(b, 16)));

export interface SealInput {
  text: string;
  heirs: { name: string; evm: Hex; qor: string }[];
  guardianName: string | null;
  quiet: number;
  warning: number;
  whenLabel: string;
}

/** The steps shown to the person while sealing. */
export type Progress = "postman" | "people" | "wrap" | "send";

/** Is this person set up to receive a letter? (They have registered their opening card.) */
export async function isReady(qor: string): Promise<boolean> {
  const st = await fetchKemKey({ rest: restUrl(), address: qor });
  return st.registered && !!st.publicKey;
}

async function nextLetterId(): Promise<bigint> {
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
  const guardianSeed = input.guardianName ? newSeed() : undefined; // the guardian card
  const owner = signingKeysFromSeed(ownerSeed);
  const guardianKeyHash = guardianSeed ? keyHash(signingKeysFromSeed(guardianSeed).publicKey) : ZERO_HASH;

  const K = makeContentKey();
  const letterCiphertext = await encryptLetter(K, input.text);
  const { A, B } = splitKey(K);
  const partAEnvelope = sealPartA(A, heirKeys);
  const partBForPostman = sealPartB(B, postmanPublic);

  // 4. Sign and send. If someone else sealed a letter a moment ago, our number is taken: look again.
  onProgress("send");
  const payload = {
    heirs: input.heirs.map((h) => h.evm),
    guardianKeyHash,
    quietPeriod: input.quiet,
    warningPeriod: input.warning,
    letterCiphertext,
    partAEnvelope,
    partBForPostman,
  };
  const payloadHash = createPayloadHash(payload);

  let txHash = "";
  let letterId = 0n;
  for (let attempt = 0; ; attempt++) {
    letterId = await nextLetterId();
    const sig = signAction(ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId, action: "CREATE", nonce: 0, payloadHash }));
    try {
      ({ txHash } = await relay(buildCreateBody({ ...payload, ownerPublicKey: owner.publicKey, sig })));
      break;
    } catch (e) {
      const raced = e instanceof HelperError && e.code === "would_revert" && e.reason === "InvalidSignature";
      if (!raced || attempt >= 2) throw e;
    }
  }

  return {
    version: 1,
    letterId: letterId.toString(),
    txHash,
    createdAt: new Date().toISOString(),
    registry: REGISTRY,
    heirs: input.heirs,
    guardianName: input.guardianName,
    whenLabel: input.whenLabel,
    quietSeconds: input.quiet,
    warningSeconds: input.warning,
    ownerCard: cardEncode(ownerSeed),
    guardianCard: guardianSeed ? cardEncode(guardianSeed) : null,
  };
}
