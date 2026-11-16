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
import type { Chain } from "./chain.js";
import type { Config } from "./config.js";
import { clientIp, createRateLimiter, type RateLimiter } from "./ratelimit.js";
import { describe, submit, type Json } from "./submit.js";
import { parseRelayRequest } from "./validate.js";
import { Mutex, windowIsLow } from "./window.js";

export interface AppDeps {
  chain: Chain;
  cfg: Config;
  /** Clock, injectable for tests. */
  now?: () => number;
  /** Log sink; default console.log. Never pass secrets in. */
  log?: (line: string) => void;
  /** Serialises every tx the helper sends. Share it with the Postman (same nonce counter). */
  mutex?: Mutex;
  /** Public Postman info for /health (public key, last run). Omitted when the Postman is off. */
  postmanInfo?: () => Json;
}

const HEALTH_CACHE_MS = 5_000;

export function createApp(deps: AppDeps): Hono {
  const { chain, cfg } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));

  const perIp = createRateLimiter({ limit: cfg.rateLimitPerMin, now });
  const everyone = createRateLimiter({ limit: cfg.globalRateLimitPerMin, now });
  const healthPerIp = createRateLimiter({ limit: 30, now });
  const mutex = deps.mutex ?? new Mutex();

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
          ...(deps.postmanInfo ? { postman: deps.postmanInfo() } : {}),
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
  function relayOne(fn: string, data: `0x${string}`) {
    return submit(chain, cfg, { fn, to: cfg.registry, data }, log);
  }

  return app;
}
