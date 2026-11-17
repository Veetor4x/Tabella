/**
 * POST /fund: a tiny amount of TEST QOR for a brand-new address, so the person can register their opening card.
 *
 * Safety, in the order it is checked:
 *   testnet only (off unless the REST host is a testnet) -> per-IP limit -> global limit -> address shape ->
 *   one-time per address (remembered, and also refused if the account already holds anything) ->
 *   the helper keeps its own reserve -> send one fixed, small amount.
 * The amount is fixed by the helper; the caller only names the address.
 */
import { bech32 } from "bech32";
import { getAddress } from "viem";
import type { Chain } from "./chain.js";
import type { Config } from "./config.js";
import { describe } from "./submit.js";
import type { Mutex } from "./window.js";

export type FundResult = { status: 200 | 400 | 403 | 409 | 429 | 502 | 503; body: Record<string, unknown> };

/** `qor1...` (or a 0x address) to the `qor1...` form, or undefined when it is not a plain 20-byte account address. */
export function normalizeQor(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  try {
    if (/^0x[0-9a-fA-F]{40}$/.test(s)) return bech32.encode("qor", bech32.toWords(Buffer.from(getAddress(s.toLowerCase()).slice(2), "hex")));
    if (/^qor1[0-9a-z]{30,60}$/.test(s)) {
      const { prefix, words } = bech32.decode(s);
      return prefix === "qor" && bech32.fromWords(words).length === 20 ? s : undefined;
    }
  } catch {
    /* bad checksum */
  }
  return undefined;
}

export function createFunder(deps: { chain: Chain; cfg: Config; mutex: Mutex; log: (line: string) => void }) {
  const { chain, cfg, mutex, log } = deps;
  const funded = new Set<string>(); // remembered for this run; the balance check covers restarts
  const inFlight = new Set<string>();

  return async function fund(address: unknown): Promise<FundResult> {
    if (!cfg.fundEnabled) return { status: 403, body: { ok: false, error: "fund_disabled" } };
    const qor = normalizeQor(address);
    if (!qor) return { status: 400, body: { ok: false, error: "invalid_address" } };
    if (qor === chain.qorAddress) return { status: 400, body: { ok: false, error: "invalid_address" } };
    if (funded.has(qor) || inFlight.has(qor)) return { status: 409, body: { ok: false, error: "already_funded" } };
    inFlight.add(qor);
    try {
      return await mutex.run(async (): Promise<FundResult> => {
        try {
          if ((await chain.balanceOfUqor(qor)) > 0n) {
            funded.add(qor);
            return { status: 409, body: { ok: false, error: "already_funded" } };
          }
          // the helper's own reserve (it must keep paying for letters) is never touched
          if ((await chain.balanceUqor()) < cfg.minBalanceUqor + cfg.fundAmountUqor) return { status: 503, body: { ok: false, error: "fund_unavailable" } };
          const txHash = await chain.broadcastNative([
            { typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: { fromAddress: chain.qorAddress, toAddress: qor, amount: [{ denom: "uqor", amount: cfg.fundAmountUqor.toString() }] } } as never,
          ]);
          funded.add(qor);
          return { status: 200, body: { ok: true, txHash, amountUqor: cfg.fundAmountUqor.toString() } };
        } catch (err) {
          log(`fund: failed (${describe(err)})`);
          return { status: 502, body: { ok: false, error: "fund_failed" } };
        }
      });
    } finally {
      inFlight.delete(qor);
    }
  };
}
