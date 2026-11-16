/**
 * The helper's HTTP surface: POST /relay and GET /health.
 *
 * /relay is a gas-paying relay for exactly four TabellaRegistry calls. The helper is NOT trusted
 * with anything: every action carries the owner's / guardian's ML-DSA-87 signature, which the
 * contract verifies on-chain, so the helper can neither forge nor alter an action.
 *
 * Order of operations for each request (nothing costs gas until the last step):
 *   rate limit -> body size -> validate -> funds check -> simulate -> (window) -> send
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { RevertError, type Chain } from "./chain.js";
import type { Config } from "./config.js";
import { clientIp, createRateLimiter, type RateLimiter } from "./ratelimit.js";
import { parseRelayRequest } from "./validate.js";
import { Mutex, WindowError, ensureWindow, windowIsLow } from "./window.js";

export interface AppDeps {
  chain: Chain;
  cfg: Config;
  /** Clock, injectable for tests. */
  now?: () => number;
  /** Log sink; default console.log. Never pass secrets in. */
  log?: (line: string) => void;
}

type Json = Record<string, unknown>;
interface Outcome {
  status: 200 | 422 | 502 | 503;
  body: Json;
}

const HEALTH_CACHE_MS = 5_000;

export function createApp(deps: AppDeps): Hono {
  const { chain, cfg } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));

  const perIp = createRateLimiter({ limit: cfg.rateLimitPerMin, now });
  const everyone = createRateLimiter({ limit: cfg.globalRateLimitPerMin, now });
  const healthPerIp = createRateLimiter({ limit: 30, now });
  const mutex = new Mutex();

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: cfg.corsOrigins.includes("*") ? "*" : cfg.corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type"],
      maxAge: 600,
    }),
  );

  const ipOf = (c: Context): string => {
    let socket: string | undefined;
    try {
      socket = getConnInfo(c).remote.address;
    } catch {
      /* not running on the node server (tests) */
    }
    return clientIp(c.req.header("x-forwarded-for"), cfg.trustedProxyHops, socket);
  };

  const limited = (c: Context, retryAfterSec: number, scope: string) => {
    c.header("Retry-After", String(retryAfterSec));
    return c.json({ ok: false, error: "rate_limited", scope, retryAfterSec }, 429);
  };

  // ------------------------------------------------------------------ /health

  let healthCache: { at: number; status: 200 | 503; body: Json } | undefined;

  app.get("/health", async (c) => {
    const rl: RateLimiter = healthPerIp;
    const lim = rl.take(ipOf(c));
    if (!lim.ok) return limited(c, lim.retryAfterSec, "ip");

    if (healthCache && now() - healthCache.at < HEALTH_CACHE_MS) return c.json(healthCache.body, healthCache.status);

    let entry: NonNullable<typeof healthCache>;
    try {
      const [balance, w] = await Promise.all([chain.balanceUqor(), chain.windowStatus()]);
      entry = {
        at: now(),
        status: 200,
        body: {
          ok: true,
          service: "tabella-helper",
          network: "qorechain-diana",
          registry: cfg.registry,
          helper: { qor: chain.qorAddress, evm: chain.evmAddress },
          balanceUqor: balance.toString(),
          lowBalance: balance < cfg.minBalanceUqor,
          window: {
            found: w.found,
            live: w.live,
            remainingTxs: w.remainingTxs.toString(),
            remainingBlocks: w.remainingBlocks.toString(),
            remainingValueUqor: w.remainingValue.toString(),
            low: windowIsLow(w, cfg),
          },
          limits: { relayPerMinutePerIp: cfg.rateLimitPerMin, relayPerMinuteGlobal: cfg.globalRateLimitPerMin },
          time: new Date(now()).toISOString(),
        },
      };
    } catch (err) {
      log(`health: chain unavailable (${describe(err)})`);
      entry = { at: now(), status: 503, body: { ok: false, error: "chain_unavailable" } };
    }
    healthCache = entry;
    return c.json(entry.body, entry.status);
  });

  // ------------------------------------------------------------------- /relay

  app.post(
    "/relay",
    async (c, next) => {
      const ip = ipOf(c);
      const a = perIp.take(ip);
      if (!a.ok) return limited(c, a.retryAfterSec, "ip");
      const b = everyone.take("all");
      if (!b.ok) return limited(c, b.retryAfterSec, "global");
      await next();
    },
    bodyLimit({
      maxSize: cfg.maxBodyBytes,
      onError: (c) => c.json({ ok: false, error: "body_too_large", maxBytes: cfg.maxBodyBytes }, 413),
    }),
    async (c) => {
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json({ ok: false, error: "invalid_json" }, 400);
      }

      const parsed = parseRelayRequest(raw);
      if (!parsed.ok) {
        return c.json({ ok: false, error: parsed.error, details: parsed.details }, parsed.error === "function_not_allowed" ? 403 : 400);
      }

      const out = await mutex.run(() => relayOne(parsed.fn, parsed.data));
      log(`relay fn=${parsed.fn} ip=${ipOf(c)} -> ${out.status}${out.body.error ? ` ${String(out.body.error)}` : ""}`);
      return c.json(out.body, out.status);
    },
  );

  /** Everything after validation. Runs one at a time (shared nonce / sequence). */
  async function relayOne(fn: string, data: `0x${string}`): Promise<Outcome> {
    const to = cfg.registry;
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
      log(`relay: chain error (${describe(err)})`);
      return fail(503, "chain_unavailable");
    }
  }

  return app;
}

function fail(status: Outcome["status"], error: string, extra: Json = {}): Outcome {
  return { status, body: { ok: false, error, ...extra } };
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Name + message only. Never the error object itself, so nothing unexpected reaches the logs. */
function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : "unknown error";
}
