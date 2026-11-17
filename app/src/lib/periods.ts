/** How long Alex can go quiet before the letter starts to open, and the warning before it does. */
export type WhenId = "3m" | "6m" | "12m" | "demo";

export interface WhenOption {
  id: WhenId;
  label: string;
  /** seconds of quiet before the countdown starts */
  quiet: number;
  /** seconds of countdown (the "Warning" period) before the letter opens */
  warning: number;
  /** only shown after the secret gesture / ?demo */
  hidden?: boolean;
}

const DAY = 86_400;
export const WARNING_DAYS = 14;

export const WHEN_OPTIONS: WhenOption[] = [
  { id: "3m", label: "3 months", quiet: 90 * DAY, warning: WARNING_DAYS * DAY },
  { id: "6m", label: "6 months", quiet: 180 * DAY, warning: WARNING_DAYS * DAY },
  { id: "12m", label: "12 months", quiet: 365 * DAY, warning: WARNING_DAYS * DAY },
  { id: "demo", label: "2 minutes (demo)", quiet: 120, warning: 60, hidden: true },
];

export const whenById = (id: WhenId): WhenOption => WHEN_OPTIONS.find((o) => o.id === id) ?? WHEN_OPTIONS[1]!;

// ------------------------------------------------------------------ "on a date"

/** How a letter decides when to open: if its owner goes quiet (the default), or on an exact day. */
export type WhenMode = "quiet" | "date";

/** The furthest ahead a dated letter may open: 50 years (the contract's own limit is 18,263 days, leap days included). */
export const MAX_DATED_YEARS = 50;
export const MAX_DATED_SECONDS = 18_263 * DAY;
/** "In 2 minutes": the demo choice for a dated letter, shown with the demo timer. */
export const DATED_DEMO_SECONDS = 120;

const pad = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD in the person's own time zone. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The earliest day that can be picked: tomorrow. */
export function minDay(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return isoDay(d);
}
/** The latest day that can be picked: 50 years from today, kept safely inside the contract's limit. */
export function maxDay(now = new Date()): string {
  const d = new Date(now.getFullYear() + MAX_DATED_YEARS, now.getMonth(), now.getDate() - 1);
  return isoDay(d);
}

/** A picked day as the exact moment it opens: the start of that day, in the person's time zone (unix seconds). Null if it is not a valid day in range. */
export function releaseAtFor(day: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  if (isNaN(d.getTime()) || isoDay(d) !== day) return null; // 31 February and friends
  const at = Math.floor(d.getTime() / 1000);
  const nowS = Math.floor(now.getTime() / 1000);
  if (at <= nowS || at - nowS > MAX_DATED_SECONDS - DAY) return null;
  return at;
}

/** "Saturday 14 June 2031" */
export function longDay(releaseAtSeconds: number, locale?: string): string {
  return new Date(releaseAtSeconds * 1000).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "about 5 years, 3 months from now" for the picker's friendly echo. */
export function fromNow(releaseAtSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const days = Math.max(1, Math.round((releaseAtSeconds - nowSeconds) / DAY));
  if (days < 45) return days === 1 ? "tomorrow" : `in ${days} days`;
  if (days < 700) {
    const months = Math.round(days / 30.4);
    return `in about ${months} months`;
  }
  const years = Math.floor(days / 365);
  const months = Math.round((days - years * 365) / 30.4);
  return `in about ${years} year${years === 1 ? "" : "s"}${months >= 1 && months < 12 ? `, ${months} month${months === 1 ? "" : "s"}` : ""}`;
}
