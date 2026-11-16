/**
 * Talks to the Tabella helper (the Postman and the relay). The helper pays the network fees, so the
 * app needs no wallet. On Render's free plan it sleeps when idle, so the app wakes it early.
 */
import { HELPER_URL } from "./config";

export interface Health {
  ok: boolean;
  postman?: { mlkemPublicKey: string };
}

/** Thrown for anything the helper (or the network) refused. `reason` is the contract's own error name when known. */
export class HelperError extends Error {
  constructor(
    readonly code: string,
    readonly reason?: string,
  ) {
    super(code);
    this.name = "HelperError";
  }
}

function timeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

let warm: Promise<Health> | undefined;

/** Ask the helper how it is. The first call also wakes it from sleep (can take up to a minute). */
export function warmUp(): Promise<Health> {
  warm ??= (async () => {
    let res: Response;
    try {
      res = await fetch(`${HELPER_URL}/health`, { signal: timeout(90_000) });
    } catch {
      throw new HelperError("helper_unreachable");
    }
    if (!res.ok) throw new HelperError("helper_unavailable");
    const h = (await res.json()) as Health;
    if (!h.ok || !h.postman?.mlkemPublicKey) throw new HelperError("helper_unavailable");
    return h;
  })().catch((e) => {
    warm = undefined; // let the next attempt try again
    throw e;
  });
  return warm;
}

export async function relay(body: unknown): Promise<{ txHash: string }> {
  let res: Response;
  try {
    res = await fetch(`${HELPER_URL}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: timeout(120_000),
    });
  } catch {
    throw new HelperError("helper_unreachable");
  }
  let json: { ok?: boolean; error?: string; reason?: string; txHash?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (res.ok && json.ok && json.txHash) return { txHash: json.txHash };
  throw new HelperError(json.error ?? `http_${res.status}`, json.reason);
}

/** A kind sentence for whatever went wrong. No jargon, and it always says what to do next. */
export function friendlyError(err: unknown): string {
  if (err instanceof HelperError) {
    if (err.code === "wrong_card") return "That card doesn't belong to this letter.";
    if (err.code === "would_revert") {
      if (err.reason === "PauseLimitReached") return "Both pauses have already been used for this letter.";
      if (err.reason === "NotOpen") return "This letter has already opened or been cancelled, so nothing can change now.";
      if (err.reason === "WrongKey") return "That card doesn't belong to this letter.";
      if (err.reason === "NoGuardian") return "This letter has no guardian.";
    }
    switch (err.code) {
      case "helper_unreachable":
      case "helper_unavailable":
        return "We couldn't reach the Postman. It may still be waking up. Give it a minute and try again.";
      case "rate_limited":
        return "That's a lot at once. Please wait a minute and try again.";
      case "would_revert":
        return err.reason === "InvalidSignature"
          ? "Something changed while we were sealing. Please try once more."
          : "Something about your letter or the people you chose isn't quite right. Please go back and check.";
      case "invalid_request":
      case "body_too_large":
        return "That letter is a little too long to seal. Please shorten it and try again.";
      case "relayer_out_of_funds":
      case "window_unavailable":
      case "gas_price_too_high":
      case "chain_unavailable":
      case "too_expensive":
        return "The network is busy right now. Please try again in a few minutes.";
    }
  }
  if (err instanceof SealProblem) return err.message;
  return "Something went wrong on our side. Your letter is safe here on this device. Please try again.";
}

/** A problem we can explain in the person's own terms. */
export class SealProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealProblem";
  }
}
