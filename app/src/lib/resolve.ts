import { BaseError, HttpRequestError, TimeoutError } from "viem";
import { cardFingerprint } from "./actions";
import { REGISTRIES, isCurrentRegistry, versionOf } from "./config";
import { readLetter, type LetterView } from "./registry";
import type { SealedLetter } from "./storage";

/**
 * What a saved letter turned out to be, looked up on the registry version it was sealed on (a letter's number only means something there):
 *  - current:     sealed on the current version; this is the real status
 *  - older:       sealed on an earlier test version (its real status is shown when it can be read)
 *  - missing:     found nowhere: it never finished sealing
 *  - unreachable: the network could not be reached (this says nothing about the letter)
 */
export type Resolved = { kind: "current"; view: LetterView } | { kind: "older"; view: LetterView | null } | { kind: "missing" } | { kind: "unreachable" };

const isNetworkError = (e: unknown) => e instanceof BaseError && !!e.walk((x) => x instanceof HttpRequestError || x instanceof TimeoutError || /fetch failed|Failed to fetch|NetworkError/i.test((x as Error)?.message ?? ""));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function resolveLetter(saved: SealedLetter, tries = 3, pause = [1200, 3500]): Promise<Resolved> {
  const owner = saved.ownerCard ? (() => { try { return cardFingerprint(saved.ownerCard).toLowerCase(); } catch { return null; } })() : null;
  const known = saved.registry ? versionOf(saved.registry) : undefined;
  if (saved.registry && !known) return { kind: "older", view: null }; // an address we do not know: certainly not the current one
  const order = known ? [known] : REGISTRIES;
  for (let attempt = 0; attempt < tries; attempt++) {
    let networkTrouble = false;
    for (const v of order) {
      try {
        const view = await readLetter(BigInt(saved.letterId), v.address);
        if (!owner || view.ownerKeyHash.toLowerCase() === owner) return isCurrentRegistry(v.address) ? { kind: "current", view } : { kind: "older", view };
        // a different letter has this number on this version: not ours
      } catch (e) {
        if (isNetworkError(e)) networkTrouble = true;
        // otherwise the version answered "no such letter" (or cannot be read): not found here
      }
    }
    if (!networkTrouble) return known && !isCurrentRegistry(known.address) ? { kind: "older", view: null } : { kind: "missing" };
    if (attempt < tries - 1) await sleep(pause[attempt] ?? 3000);
  }
  return known && !isCurrentRegistry(known.address) ? { kind: "older", view: null } : { kind: "unreachable" };
}
