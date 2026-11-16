/**
 * The three things a card can do to a letter: check in (owner), pause (guardian), cancel (owner).
 * Each one confirms with the card on this device, then the helper sends it. The card never leaves the device.
 */
import { toHex } from "viem";
import { EMPTY_PAYLOAD_HASH, EVM_CHAIN_ID, actionMessage, cardDecode, keyHash, signAction, signingKeysFromSeed } from "../../../shared/tabella-crypto";
import { REGISTRY } from "./config";
import { HelperError, relay, warmUp } from "./helper";
import { readLetter, type LetterView } from "./registry";

type Kind = "checkIn" | "guardianPause" | "cancel";
const ACTION = { checkIn: "CHECKIN", guardianPause: "PAUSE", cancel: "CANCEL" } as const;

/** Which card a letter's fingerprint belongs to. Throws a readable error if it is the wrong card. */
export function cardFingerprint(card: string): `0x${string}` {
  return keyHash(signingKeysFromSeed(cardDecode(card)).publicKey);
}

async function act(kind: Kind, card: string, letterId: bigint): Promise<{ txHash: string }> {
  const seed = cardDecode(card);
  const keys = signingKeysFromSeed(seed);
  const mine = keyHash(keys.publicKey).toLowerCase();
  await warmUp().catch(() => {}); // wake the helper while we look at the letter
  for (let attempt = 0; ; attempt++) {
    const L: LetterView = await readLetter(letterId); // a fresh look: the number to confirm changes after every action
    const expected = (kind === "guardianPause" ? L.guardianKeyHash : L.ownerKeyHash).toLowerCase();
    if (expected !== mine) throw new HelperError("wrong_card");
    const sig = signAction(seed, actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId, action: ACTION[kind], nonce: L.nonce, payloadHash: EMPTY_PAYLOAD_HASH }));
    try {
      return await relay({ fn: kind, args: { letterId: letterId.toString() }, pubkey: toHex(keys.publicKey), sig: toHex(sig) });
    } catch (e) {
      const raced = e instanceof HelperError && e.code === "would_revert" && e.reason === "InvalidSignature";
      if (!raced || attempt >= 2) throw e; // someone else acted a moment ago: look again, once or twice
    }
  }
}

export const checkIn = (card: string, id: bigint) => act("checkIn", card, id);
export const guardianPause = (card: string, id: bigint) => act("guardianPause", card, id);
export const cancelLetter = (card: string, id: bigint) => act("cancel", card, id);
