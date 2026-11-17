/**
 * Settings read from environment variables. Everything here is safe to log.
 * The mnemonic is deliberately NOT part of this object: it is read once in index.ts and handed
 * straight to the chain module, so a stray `console.log(config)` can never leak it.
 */
import { evmWindowCost, MAX_EVM_WINDOW_BLOCKS, MAX_EVM_WINDOW_TXS } from "@qorechain/evm";
import type { Hex } from "viem";

export interface Config {
  port: number;
  restUrl: string;
  evmRpcUrl: string;
  /** TabellaRegistry address: the only contract /relay will ever call. */
  registry: Hex;

  // --- abuse limits
  /** /relay requests per IP per minute. */
  rateLimitPerMin: number;
  /** /relay requests per minute from everyone together (protects the helper's balance). */
  globalRateLimitPerMin: number;
  /** Proxies in front of us whose X-Forwarded-For entry we trust (Render = 1, local = 0). */
  trustedProxyHops: number;
  /** Allowed browser origins for CORS; ["*"] = any. */
  corsOrigins: string[];
  maxBodyBytes: number;

  // --- gas / fees
  /** Refuse (and do not even send) a call whose simulation needs more gas than this. */
  maxTxGas: bigint;
  /** Never bid above this per gas (wei). The window is sized for it. */
  maxFeePerGasCap: bigint;
  /** Stop relaying when the helper has less than this (uqor) left. */
  minBalanceUqor: bigint;

  // --- EVM window (sized for a demo day)
  windowBlocks: bigint;
  windowMaxTxs: bigint;
  windowMaxUqor: bigint;
  /** Reopen when fewer than this many txs, blocks or worst-case txs' worth of value remain. */
  windowLowTxs: bigint;
  windowLowBlocks: bigint;

  // --- /fund: a tiny amount of test QOR so a new person can register their opening card (testnet only)
  fundEnabled: boolean;
  /** Sent once to each new address (uqor). Enough for two registrations, no more. */
  fundAmountUqor: bigint;
  fundPerIpPerHour: number;
  fundGlobalPerHour: number;

  // --- messages to the people a surprise letter is for
  /** The web app's address, used in the links we send. */
  appUrl: string;
  openedPerMinPerIp: number;

  // --- Postman
  postmanEnabled: boolean;
  /** How often the Postman looks for released letters. */
  postmanIntervalMs: number;
  /** If an heir still has no registered opening key this long after release, seal to the heirs that do. */
  heirKeyGraceMs: number;
}

const num = (env: NodeJS.ProcessEnv, key: string, fallback: number): number => {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`);
  return n;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const registry = env.REGISTRY_ADDRESS?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(registry)) {
    throw new Error("REGISTRY_ADDRESS must be set to the deployed TabellaRegistry address (0x...)");
  }

  const maxTxGas = BigInt(num(env, "MAX_TX_GAS", 12_000_000));
  const maxFeePerGasCap = BigInt(num(env, "MAX_FEE_GWEI", 250)) * 1_000_000_000n;

  // MAX_TX_GAS: measured on testnet, a normal createLetter (2 heirs, 3.3 KB Part A) uses ~4.2M gas because
  // the envelopes are stored on-chain; the largest allowed letter (3 heirs, 8 KB text) needs ~10-11M.
  //
  // Demo-day window: the chain maximum of 17,280 blocks is about 6.9 hours at ~1.44 s per block.
  // Value budget = worst-case cost of every tx the window admits. It is a cap, not a deposit
  // (the window charges gasLimit x maxFee per tx; the account is only charged what is actually used).
  const windowMaxTxs = BigInt(Math.min(num(env, "WINDOW_MAX_TXS", 200), Number(MAX_EVM_WINDOW_TXS)));
  const windowBlocks = BigInt(Math.min(num(env, "WINDOW_BLOCKS", 17_280), Number(MAX_EVM_WINDOW_BLOCKS)));
  const perTxWorstCase = evmWindowCost({ gas: maxTxGas, maxFeePerGas: maxFeePerGasCap });

  return {
    port: num(env, "PORT", 8787),
    restUrl: (env.QORE_REST_URL?.trim() || "https://api-testnet.qore.host").replace(/\/+$/, ""),
    evmRpcUrl: (env.QORE_EVM_RPC_URL?.trim() || "https://evm-testnet.qore.host").replace(/\/+$/, ""),
    registry: registry as Hex,

    rateLimitPerMin: num(env, "RATE_LIMIT_PER_MIN", 10),
    globalRateLimitPerMin: num(env, "GLOBAL_RATE_LIMIT_PER_MIN", 120),
    trustedProxyHops: num(env, "TRUSTED_PROXY_HOPS", 0),
    corsOrigins: (env.CORS_ORIGINS?.trim() || "*").split(",").map((s) => s.trim()).filter(Boolean),
    maxBodyBytes: num(env, "MAX_BODY_BYTES", 128 * 1024),

    maxTxGas,
    maxFeePerGasCap,
    minBalanceUqor: BigInt(num(env, "MIN_BALANCE_UQOR", 2_000_000)), // 2 QOR

    windowBlocks,
    windowMaxTxs,
    windowMaxUqor: BigInt(env.WINDOW_MAX_UQOR?.trim() || (perTxWorstCase * windowMaxTxs).toString()),
    windowLowTxs: BigInt(num(env, "WINDOW_LOW_TXS", 10)),
    windowLowBlocks: BigInt(num(env, "WINDOW_LOW_BLOCKS", 1_200)), // ~30 minutes

    // /fund only ever runs against a testnet endpoint (the REST host must say so), and can be switched off.
    fundEnabled: (env.FUND_ENABLED?.trim() ?? "true").toLowerCase() !== "false" && /testnet/i.test(env.QORE_REST_URL?.trim() || "https://api-testnet.qore.host"),
    fundAmountUqor: BigInt(num(env, "FUND_AMOUNT_UQOR", 400_000)), // 0.4 QOR: two 0.1 QOR registrations with room to spare
    fundPerIpPerHour: num(env, "FUND_PER_IP_PER_HOUR", 3),
    fundGlobalPerHour: num(env, "FUND_GLOBAL_PER_HOUR", 40),

    appUrl: (env.APP_URL?.trim() || "https://tabella-veetor4x.vercel.app").replace(/\/+$/, ""),
    openedPerMinPerIp: num(env, "OPENED_PER_MIN", 6),

    postmanEnabled: (env.POSTMAN_ENABLED?.trim() ?? "true").toLowerCase() !== "false",
    postmanIntervalMs: num(env, "POSTMAN_INTERVAL_SECONDS", 20) * 1000,
    heirKeyGraceMs: num(env, "POSTMAN_HEIR_KEY_GRACE_MINUTES", 30) * 60_000,
  };
}
