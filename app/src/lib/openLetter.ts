/** Opening a letter on the loved one's own device: both halves are opened with her card, joined, and the letter is unlocked here. */
import { unpackContainer } from "../../../shared/surprise";
import { cardDecode, decryptLetter, joinKey, openPart, signingKeysFromSeed } from "../../../shared/tabella-crypto";
import { signOpened } from "../../../shared/surprise";
import { toHex } from "viem";
import { HELPER_URL, REGISTRY } from "./config";
import type { Identity } from "./heir";
import { SealProblem } from "./helper";
import type { HeirLetter } from "./registry";

const hexToU8 = (h: string) => Uint8Array.from(h.slice(2).match(/../g) ?? [], (b) => parseInt(b, 16));

export async function openLetter(id: Identity, letter: HeirLetter): Promise<string> {
  if (letter.state !== "ready") throw new SealProblem("This letter isn't ready to open yet.");
  try {
    const a = openPart(hexToU8(letter.partAEnvelope), id.keys);
    const b = openPart(hexToU8(letter.partBForHeirs), id.keys);
    const packed = hexToU8(letter.letterCiphertext);
    const ct = unpackContainer(packed)?.ciphertext ?? packed; // a surprise letter wraps its questions around the ciphertext
    return await decryptLetter(joinKey(a, b), ct);
  } catch {
    throw new SealProblem("This card can't open that letter. Please check you're using your own opening card.");
  }
}

/** Tell the Postman this letter was opened, signed by the unlocked card, so it stops asking. Quiet: a failure changes nothing for the reader. */
export async function reportOpened(card: string, letterId: bigint): Promise<void> {
  const seed = cardDecode(card);
  const body = JSON.stringify({ letterId: letterId.toString(), pubkey: toHex(signingKeysFromSeed(seed).publicKey), sig: toHex(signOpened(seed, REGISTRY, letterId)) });
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${HELPER_URL}/opened`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(60_000) });
      if (res.ok || res.status === 404 || res.status === 403) return; // done, or nothing to stop
    } catch {
      /* try again */
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
}
