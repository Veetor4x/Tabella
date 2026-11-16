/**
 * Keeps an EVM authorisation window open for the helper.
 *
 * Every EVM tx the helper sends needs a live window (opened by a hybrid-signed native message).
 * We open one big window (see config: ~6.9 h, 200 txs) and reuse it, and only open a new one
 * when it runs low. Opening costs a native fee, so it is never done for a request that would revert.
 */
import type { Chain, WindowStatus } from "./chain.js";
import { worstCaseTxCost } from "./chain.js";
import type { Config } from "./config.js";

export function windowIsLow(w: WindowStatus, cfg: Config): boolean {
  if (!w.found || !w.live) return true;
  const perTx = worstCaseTxCost(cfg.maxTxGas, cfg.maxFeePerGasCap);
  return (
    w.remainingTxs <= cfg.windowLowTxs ||
    w.remainingBlocks <= cfg.windowLowBlocks ||
    w.remainingValue < perTx * (cfg.windowLowTxs > 0n ? cfg.windowLowTxs : 1n)
  );
}

export class WindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WindowError";
  }
}

/** Reuse the window if it has room, otherwise open a fresh one. Returns the tx hash when it opened one. */
export async function ensureWindow(chain: Chain, cfg: Config): Promise<string | undefined> {
  const before = await chain.windowStatus();
  if (!windowIsLow(before, cfg)) return undefined;

  const hash = await chain.openWindow({ blocks: cfg.windowBlocks, maxTxs: cfg.windowMaxTxs, maxValue: cfg.windowMaxUqor });

  const after = await chain.windowStatus();
  if (!after.found || !after.live) throw new WindowError("opened an EVM window but the chain does not show it as live");
  return hash;
}

/** Run jobs one at a time. Needed because the EVM nonce and the native sequence are one counter. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job, job);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
