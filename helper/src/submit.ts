/**
 * The one way the helper sends an EVM transaction to the registry: used by /relay AND by the Postman.
 *
 *   funds check -> simulate (refuse anything that would revert, for free) -> fee check
 *   -> make sure an EVM window with room is open -> send
 *
 * Callers must run this inside the shared Mutex (the EVM nonce and native sequence are one counter).
 */
import type { Hex } from "viem";
import { RevertError, type Chain } from "./chain.js";
import type { Config } from "./config.js";
import { WindowError, ensureWindow } from "./window.js";

export type Json = Record<string, unknown>;

export interface Outcome {
  status: 200 | 422 | 502 | 503;
  body: Json;
}

export function fail(status: Outcome["status"], error: string, extra: Json = {}): Outcome {
  return { status, body: { ok: false, error, ...extra } };
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Name + message only. Never the error object itself, so nothing unexpected reaches the logs. */
export function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : "unknown error";
}

export async function submit(
  chain: Chain,
  cfg: Config,
  call: { fn: string; to: Hex; data: Hex },
  log: (line: string) => void,
): Promise<Outcome> {
  const { to, data, fn } = call;
  try {
    // 1. Is the helper able to pay at all?
    const balance = await chain.balanceUqor();
    if (balance < cfg.minBalanceUqor) return fail(503, "relayer_out_of_funds");

    // 2. Simulate. Anything that would revert is refused here, for free.
    let gasEstimate: bigint;
    try {
      gasEstimate = await chain.simulate({ to, data });
    } catch (err) {
      if (err instanceof RevertError && err.kind === "window") {
        // The simulation was refused only because the window ran out: open one and look again.
        await ensureWindow(chain, cfg);
        gasEstimate = await chain.simulate({ to, data });
      } else {
        throw err;
      }
    }
    if (gasEstimate > cfg.maxTxGas) return fail(422, "too_expensive", { gas: gasEstimate.toString(), maxGas: cfg.maxTxGas.toString() });

    // 3. Fee: never above the cap the window is sized for.
    const gasPrice = await chain.gasPrice();
    if (gasPrice > cfg.maxFeePerGasCap) return fail(503, "gas_price_too_high");
    const maxFeePerGas = gasPrice * 2n > cfg.maxFeePerGasCap ? cfg.maxFeePerGasCap : gasPrice * 2n;
    const gasLimit = min((gasEstimate * 125n) / 100n, cfg.maxTxGas);

    // 4. Make sure a window with room is open (reuse it; reopen only when low).
    const windowTx = await ensureWindow(chain, cfg);

    // 5. Send.
    const r = await chain.send({ to, data, gas: gasLimit, maxFeePerGas });
    if (r.status !== "success") {
      return { status: 502, body: { ok: false, error: "reverted_onchain", txHash: r.txHash } };
    }
    return {
      status: 200,
      body: {
        ok: true,
        fn,
        txHash: r.txHash,
        gasUsed: r.gasUsed.toString(),
        blockNumber: r.blockNumber.toString(),
        ...(windowTx ? { windowOpenedTx: windowTx } : {}),
      },
    };
  } catch (err) {
    if (err instanceof RevertError) return fail(422, "would_revert", { reason: err.reason });
    if (err instanceof WindowError) return fail(503, "window_unavailable");
    log(`${fn}: chain error (${describe(err)})`);
    return fail(503, "chain_unavailable");
  }
}
