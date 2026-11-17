import { cardDecode } from "../../../shared/tabella-crypto";
import { cardFingerprint } from "./actions";
import { identityFromCard } from "./heir";
import { findLetters, findLettersForHeir } from "./registry";

export type CardKind = "owner" | "guardian" | "opening";

/** A code pasted or scanned: the bare code, or the address on a printed QR ("…/card#tbl1_…"). */
export function extractCode(raw: string): string {
  const t = raw.trim();
  const m = /tbl1_[A-Za-z0-9_-]+/.exec(t.replace(/\s+/g, ""));
  return m ? m[0] : t.replace(/\s+/g, "");
}

export const BAD_CARD = "That doesn't look like a Tabella card. Please check the code, or scan the QR code on the card.";
export const NO_LETTER = "We couldn't find a letter for that card yet. If it was only just made, give it a minute and try again.";

/**
 * Works out what a card is, so nobody has to choose: an I'm-still-here card (it owns letters), a guardian card (it watches over
 * letters) or an opening card (letters are addressed to it). Throws a kind message for something that is not a card at all.
 */
export async function detectCard(raw: string): Promise<{ kind: CardKind; code: string } | null> {
  const code = extractCode(raw);
  try {
    cardDecode(code);
  } catch {
    throw new Error(BAD_CARD);
  }
  const [mine, heir] = await Promise.allSettled([findLetters(cardFingerprint(code)), identityFromCard(code).then((id) => findLettersForHeir(id.evm))]);
  if (mine.status === "fulfilled" && mine.value.owner.length) return { kind: "owner", code };
  if (mine.status === "fulfilled" && mine.value.guardian.length) return { kind: "guardian", code };
  if (heir.status === "fulfilled" && heir.value.length) return { kind: "opening", code };
  if (mine.status === "rejected" && heir.status === "rejected") throw mine.reason;
  return null;
}
