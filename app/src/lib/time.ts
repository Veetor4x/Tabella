import type { LetterView } from "./registry";

/** Seconds on the network's clock right now (it keeps counting between reads). */
export const chainNowOf = (l: LetterView, nowMs = Date.now()) => l.chainNow + (nowMs - l.fetchedAt) / 1000;

export interface Countdown {
  /** what the ring shows: 1 = just checked in, 0 = out of time */
  fraction: number;
  /** seconds to the next thing that happens (the end of the quiet time, or of the countdown) */
  left: number;
  phase: "quiet" | "warning" | "over";
}

export function countdown(l: LetterView, nowMs = Date.now()): Countdown {
  const now = chainNowOf(l, nowMs);
  if (l.releaseAt) {
    // a dated letter: one stretch, from when it was made to its day (no quiet time, no warning)
    const total = Math.max(1, l.releaseAt - l.lastCheckIn);
    if (now < l.releaseAt) return { fraction: Math.max(0, Math.min(1, (l.releaseAt - now) / total)), left: l.releaseAt - now, phase: "quiet" };
    return { fraction: 0, left: 0, phase: "over" };
  }
  const quietEnd = l.lastCheckIn + l.quiet;
  const warnEnd = quietEnd + l.warning;
  if (now < quietEnd) return { fraction: Math.max(0, Math.min(1, (quietEnd - now) / l.quiet)), left: quietEnd - now, phase: "quiet" };
  if (now < warnEnd) return { fraction: Math.max(0, Math.min(1, (warnEnd - now) / l.warning)), left: warnEnd - now, phase: "warning" };
  return { fraction: 0, left: 0, phase: "over" };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "28 days", "3 hours", "1 minute 20 seconds": the biggest sensible unit, never "28d". */
export function span(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 2 * 86400) return plural(Math.round(s / 86400), "day");
  if (s >= 86400) return `1 day ${plural(Math.floor((s % 86400) / 3600), "hour")}`;
  if (s >= 2 * 3600) return plural(Math.round(s / 3600), "hour");
  if (s >= 3600) return `1 hour ${plural(Math.floor((s % 3600) / 60), "minute")}`;
  if (s >= 120) return plural(Math.round(s / 60), "minute");
  if (s >= 60) return `1 minute ${plural(s - 60, "second")}`;
  return plural(s, "second");
}

/** The two-line reading inside the ring: a big figure and what it counts. */
export function ringText(l: LetterView, c: Countdown): { big: string; small: string } {
  if (l.state === "Cancelled") return { big: "Cancelled", small: "Nobody can open it" };
  if (l.state === "Opened") return { big: "Opened", small: "For the people you chose" };
  if (l.releaseAt) return { big: span(c.left), small: "until it opens" };
  if (c.phase === "warning" || l.state === "Warning") return { big: span(c.left), small: "until it opens" };
  return { big: span(c.left), small: "until your next check-in" };
}
