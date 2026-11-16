/** A tiny in-memory fixed-window rate limiter. Fine for one helper process; resets on restart. */
export interface RateLimiter {
  /** Count one request for `key`. */
  take(key: string): { ok: boolean; retryAfterSec: number };
}

export function createRateLimiter(opts: { limit: number; windowMs?: number; now?: () => number }): RateLimiter {
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { start: number; count: number }>();

  return {
    take(key) {
      const t = now();
      // keep memory bounded: drop expired buckets once the map gets big
      if (buckets.size > 10_000) {
        for (const [k, b] of buckets) if (t - b.start >= windowMs) buckets.delete(k);
      }
      let b = buckets.get(key);
      if (!b || t - b.start >= windowMs) {
        b = { start: t, count: 0 };
        buckets.set(key, b);
      }
      b.count++;
      if (b.count > opts.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.start + windowMs - t) / 1000)) };
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

/**
 * The caller's IP. Behind `hops` trusted proxies (Render = 1) the real client is the entry the
 * nearest proxy appended: `hops` from the RIGHT of X-Forwarded-For. Anything a client puts further
 * left is ignored, so it cannot dodge the limit by spoofing the header.
 */
export function clientIp(forwardedFor: string | undefined, hops: number, socketAddress: string | undefined): string {
  if (hops > 0 && forwardedFor) {
    const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - hops];
    if (ip) return ip;
  }
  return socketAddress ?? "unknown";
}
