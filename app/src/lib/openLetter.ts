/** Opening a letter on the loved one's own device: both halves are opened with her card, joined, and the letter is unlocked here. */
import { decryptLetter, joinKey, openPart } from "../../../shared/tabella-crypto";
import type { Identity } from "./heir";
import { SealProblem } from "./helper";
import type { HeirLetter } from "./registry";

const hexToU8 = (h: string) => Uint8Array.from(h.slice(2).match(/../g) ?? [], (b) => parseInt(b, 16));

export async function openLetter(id: Identity, letter: HeirLetter): Promise<string> {
  if (letter.state !== "ready") throw new SealProblem("This letter isn't ready to open yet.");
  try {
    const a = openPart(hexToU8(letter.partAEnvelope), id.keys);
    const b = openPart(hexToU8(letter.partBForHeirs), id.keys);
    return await decryptLetter(joinKey(a, b), hexToU8(letter.letterCiphertext));
  } catch {
    throw new SealProblem("This card can't open that letter. Please check you're using your own opening card.");
  }
}
