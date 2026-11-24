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
import { createFunder } from "./fund.js";
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
  /** Which message channels are set up (never the keys). Shown in /health. */
  messages?: () => { email: boolean; sms: boolean; call: boolean };
  /** "This letter was opened", signed by its card. From the Postman; omitted when there is no escalation ladder. */
  reportOpened?: (letterId: bigint, publicKey: Uint8Array, sig: Uint8Array) => Promise<"ok" | "unknown" | "bad">;
  /** The coarse state of a letter's email to its recipient, for the owner's page. From the Postman; omitted when there is no escalation ladder. */
  deliveryOf?: (letterId: bigint) => Promise<"waiting" | "none" | "sending" | "sent" | "failed" | "opened">;
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
  const fundPerIp = createRateLimiter({ limit: cfg.fundPerIpPerHour, windowMs: 3_600_000, now });
  const fundEveryone = createRateLimiter({ limit: cfg.fundGlobalPerHour, windowMs: 3_600_000, now });
  const openedPerIp = createRateLimiter({ limit: cfg.openedPerMinPerIp, now });
  const deliveryPerIp = createRateLimiter({ limit: 60, now });
  const funder = createFunder({ chain, cfg, mutex, log });

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
          ...(deps.messages ? { messages: deps.messages() } : {}),
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

  // -------------------------------------------------------------------- /fund

  app.post(
    "/fund",
    async (c, next) => {
      if (!cfg.fundEnabled) return c.json({ ok: false, error: "fund_disabled" }, 403);
      const a = fundPerIp.take(ipOf(c));
      if (!a.ok) return limited(c, a.retryAfterSec, "ip");
      const b = fundEveryone.take("all");
      if (!b.ok) return limited(c, b.retryAfterSec, "global");
      await next();
    },
    bodyLimit({ maxSize: 1024, onError: (c) => c.json({ ok: false, error: "body_too_large", maxBytes: 1024 }, 413) }),
    async (c) => {
      let raw: { address?: unknown } = {};
      try {
        raw = await c.req.json();
      } catch {
        return c.json({ ok: false, error: "invalid_json" }, 400);
      }
      const out = await funder(raw?.address);
      log(`fund ip=${ipOf(c)} -> ${out.status}${out.body.error ? ` ${String(out.body.error)}` : ""}`);
      return c.json(out.body, out.status);
    },
  );

  // ------------------------------------------------------------------ /opened

  app.post(
    "/opened",
    async (c, next) => {
      if (!deps.reportOpened) return c.json({ ok: false, error: "not_available" }, 404);
      const a = openedPerIp.take(ipOf(c));
      if (!a.ok) return limited(c, a.retryAfterSec, "ip");
      await next();
    },
    bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ ok: false, error: "body_too_large" }, 413) }),
    async (c) => {
      let raw: { letterId?: unknown; pubkey?: unknown; sig?: unknown } = {};
      try {
        raw = await c.req.json();
      } catch {
        return c.json({ ok: false, error: "invalid_json" }, 400);
      }
      const hex = (v: unknown, bytes: number) => (typeof v === "string" && new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v) ? Uint8Array.from(Buffer.from(v.slice(2), "hex")) : undefined);
      const id = typeof raw.letterId === "string" || typeof raw.letterId === "number" ? String(raw.letterId) : "";
      const pubkey = hex(raw.pubkey, 2592);
      const sig = hex(raw.sig, 4627);
      if (!/^[1-9]\d{0,18}$/.test(id) || !pubkey || !sig) return c.json({ ok: false, error: "invalid_request" }, 400);
      try {
        const out = await deps.reportOpened!(BigInt(id), pubkey, sig);
        log(`opened letter=${id} -> ${out}`);
        return c.json(out === "ok" ? { ok: true } : { ok: false, error: out === "bad" ? "bad_signature" : "unknown_letter" }, out === "ok" ? 200 : out === "bad" ? 403 : 404);
      } catch (err) {
        log(`opened: failed (${describe(err)})`);
        return c.json({ ok: false, error: "unavailable" }, 502);
      }
    },
  );

  // ------------------------------------------------------------------ /delivery/:id

  /** "Has the email to the recipient gone out?": one word, no address, no name. The owner's page asks it after the letter is released. */
  app.get("/delivery/:id", async (c) => {
    if (!deps.deliveryOf) return c.json({ ok: false, error: "not_available" }, 404);
    const a = deliveryPerIp.take(ipOf(c));
    if (!a.ok) return limited(c, a.retryAfterSec, "ip");
    const id = c.req.param("id");
    if (!/^[1-9]\d{0,18}$/.test(id)) return c.json({ ok: false, error: "invalid_request" }, 400);
    try {
      return c.json({ ok: true, state: await deps.deliveryOf(BigInt(id)) });
    } catch {
      return c.json({ ok: false, error: "unknown_letter" }, 404);
    }
  });

  /** Everything after validation. Runs one at a time (shared nonce / sequence). */
  function relayOne(fn: string, data: `0x${string}`) {
    return submit(chain, cfg, { fn, to: cfg.registry, data }, log);
  }

  return app;
}
