/**
 * TEMPORARY diagnostic (to be removed): asks Brevo what happened to the email for one letter, and prints it to the log.
 * It opens the letter's Postman package (the helper can) to get the recipient address, then calls Brevo with the existing BREVO_API_KEY:
 *   GET /v3/smtp/statistics/events   (that address, the last 24 hours)
 *   GET /v3/smtp/blockedContacts     (and DELETE of that address if, and only if, it is on the list)
 *   GET /v3/senders, GET /v3/account (is the sender active, is it the same address as the recipient, are there credits)
 * Nothing secret and no address is ever logged: addresses are shown as <email>.
 */
import { decodeFunctionResult, encodeFunctionData, hexToBytes, type Hex } from "viem";
import { openPostmanPackage } from "../../shared/surprise.ts";
import type { SealKeyPair } from "../../shared/tabella-crypto.ts";
import { postmanAbi } from "./abi.js";
import type { Chain } from "./chain.js";
import type { Config } from "./config.js";
import { scrub } from "./notify/providers.js";

const BASE = "https://api.brevo.com/v3";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function brevo(method: "GET" | "DELETE", path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "api-key": process.env.BREVO_API_KEY!.trim(), accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body (a 204) */
  }
  return { status: res.status, json };
}

async function once(deps: { chain: Chain; cfg: Config; keys: SealKeyPair; ids: bigint[]; log: (l: string) => void }) {
  const { chain, cfg, keys, ids, log } = deps;
  const from = (process.env.EMAIL_FROM ?? "").trim().toLowerCase().replace(/^.*<([^>]+)>\s*$/, "$1");
  const acct = await brevo("GET", "/account");
  log(`[diag] account: HTTP ${acct.status}; plans ${JSON.stringify((acct.json?.plan ?? []).map((p: any) => ({ type: p.type, credits: p.credits, creditsType: p.creditsType })))}`);
  const senders = await brevo("GET", "/senders");
  log(`[diag] senders: HTTP ${senders.status}; ${JSON.stringify((senders.json?.senders ?? []).map((s: any) => ({ active: s.active, isEmailFrom: String(s.email ?? "").toLowerCase() === from })))}`);

  for (const id of ids) {
    const data = encodeFunctionData({ abi: postmanAbi, functionName: "getLetter", args: [id] });
    const letter = decodeFunctionResult({ abi: postmanAbi, functionName: "getLetter", data: await chain.call({ to: cfg.registry, data }) }) as unknown as { partBForPostman: Hex };
    const email = (openPostmanPackage(hexToBytes(letter.partBForPostman), keys).pkg?.recipient.email ?? "").trim();
    if (!email) {
      log(`[diag] letter #${id}: no recipient email in its package`);
      continue;
    }
    log(`[diag] letter #${id}: recipient is the same address as the sender: ${email.toLowerCase() === from}`);
    const ev = await brevo("GET", `/smtp/statistics/events?email=${encodeURIComponent(email)}&days=1&limit=100&sort=desc`);
    const events: any[] = ev.json?.events ?? [];
    log(`[diag] letter #${id}: events HTTP ${ev.status}, ${events.length} event(s)${ev.status !== 200 ? ` (${scrub(String(ev.json?.message ?? ""))})` : ""}`);
    for (const e of events) log(`[diag] letter #${id}: event=${e.event} at=${e.date} subject="${scrub(String(e.subject ?? ""))}" reason="${scrub(String(e.reason ?? ""))}" messageId=${scrub(String(e.messageId ?? ""))}`);

    // the blocked list (a hard bounce, a spam complaint or an unsubscribe puts an address there; Brevo then refuses to send to it)
    let found: any = null;
    for (let offset = 0; offset < 1000 && !found; offset += 100) {
      const b = await brevo("GET", `/smtp/blockedContacts?limit=100&offset=${offset}&sort=desc`);
      if (b.status !== 200) {
        log(`[diag] blockedContacts: HTTP ${b.status} (${scrub(String(b.json?.message ?? ""))})`);
        break;
      }
      const page: any[] = b.json?.contacts ?? [];
      found = page.find((c) => String(c.email ?? "").toLowerCase() === email.toLowerCase());
      if (page.length < 100) break;
    }
    if (found) {
      log(`[diag] letter #${id}: the address IS on Brevo's blocked list: reason=${found.reason?.code ?? "?"} "${scrub(String(found.reason?.message ?? ""))}" blockedAt=${found.blockedAt}`);
      const del = await brevo("DELETE", `/smtp/blockedContacts/${encodeURIComponent(email)}`);
      log(`[diag] letter #${id}: removed from the blocked list: HTTP ${del.status}${del.status >= 300 ? ` (${scrub(String(del.json?.message ?? ""))})` : ""}`);
    } else {
      log(`[diag] letter #${id}: the address is NOT on Brevo's blocked list`);
    }
  }
}

/** Runs 30 s after start, then 3 and 8 minutes later (so a "deferred" can be seen turning into "delivered" or a bounce). */
export async function runBrevoDiag(deps: { chain: Chain; cfg: Config; keys: SealKeyPair; ids: bigint[]; log?: (l: string) => void }) {
  if (!process.env.BREVO_API_KEY?.trim()) return;
  const log = deps.log ?? ((l: string) => console.log(l));
  for (const wait of [30_000, 180_000, 300_000]) {
    await sleep(wait);
    try {
      await once({ ...deps, log });
    } catch (err) {
      log(`[diag] failed: ${err instanceof Error ? err.name : "error"} ${scrub(err instanceof Error ? err.message : "")}`);
    }
  }
}
