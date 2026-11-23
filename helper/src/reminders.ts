/**
 * Owner reminders: while a letter is in its WARNING (the quiet time has run out and the countdown has begun), the Postman emails the
 * OWNER a few gentle "tap here to say you're still around" messages.
 *
 *   Main letters (3, 6 or 12 months, a 14-day warning):  day 1, day 7 and day 14 (the last day) of the warning.
 *   Test letters (a short warning):                      at the start of the warning, halfway through it, and 90% of the way.
 *
 * What an email may say: only that it has been a while, and the link. NEVER a letter, the recipient or anything inside it.
 *
 * Safe by construction, the same way the escalation ladder is:
 *   - each reminder is CLAIMED in the store before it is sent, so a second pass, a second process or a restart never sends it twice;
 *     the claim is keyed by the letter AND its last check-in, so a later warning (after a check-in) has reminders of its own;
 *   - reminders go out ONLY while the letter's status is Warning. A check-in (or a guardian pause) moves the letter back to Active, so
 *     every reminder still to come for that warning is simply never sent;
 *   - if the helper was asleep and several reminders are due at once, only the latest is sent (never a burst);
 *   - a failed send gives its claim back and waits (30 s, 1 min, 2 min, 5 min) before the next try.
 * Never logged: the address, the subject, the line, the link. Logs say "letter #N: reminder 2 sent".
 */
import { REMINDER_LINE_MAX, REMINDER_SUBJECT_MAX, type OwnerReminders, type PostmanPackage } from "../../shared/surprise.ts";
import { sendable } from "./escalation.js";
import { STATUS } from "./abi.js";
import { ProviderError } from "./notify/providers.js";
import type { LadderStore, Notifier } from "./notify/types.js";

const DAY = 86_400;
const MIN = 60_000;
/** A warning this long (or longer) is a "main" letter's: reminders go on whole days. Anything shorter (tests, demos) is spread across the warning. */
export const MAIN_WARNING_SECONDS = 14 * DAY;

/** Seconds after the warning starts at which each reminder goes out. */
export function reminderOffsets(warningSeconds: number): [number, number, number] {
  if (warningSeconds >= MAIN_WARNING_SECONDS) return [0, 6 * DAY, 13 * DAY]; // day 1, day 7, day 14
  return [0, Math.floor(warningSeconds * 0.5), Math.floor(warningSeconds * 0.9)];
}

/** One line, no angle brackets, no line breaks: what an owner typed can never break the email's header or markup. */
const oneLine = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\r\n\t<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export const SIMPLE_SUBJECT = "A quick check-in from Tabella";

/** The email for one reminder. The link is the owner's own letter page. */
export function reminderMessage(r: OwnerReminders, link: string): { subject: string; text: string } {
  if (r.style === "personal") {
    const subject = oneLine(r.subject, REMINDER_SUBJECT_MAX);
    const line = oneLine(r.line, REMINDER_LINE_MAX);
    if (subject && line) return { subject, text: `${line}\n\n${link}` };
    // an empty personal note falls back to the plain wording rather than sending something blank
  }
  return { subject: SIMPLE_SUBJECT, text: `It's been a while. Tap here to let us know you're still around: ${link}` };
}

export interface ReminderState {
  /** TabellaRegistry.Status, from the network now */
  status: number;
  /** unix seconds of the letter's last check-in (or pause), from the network now */
  lastCheckIn: number;
  quiet: number;
  warning: number;
}

export interface ReminderDeps {
  notifier: Notifier;
  store: LadderStore;
  appUrl: string;
  now?: () => number;
  log?: (line: string) => void;
}

export interface ReminderReport {
  /** reminder numbers (1 to 3) sent in this pass */
  sent: number[];
  /** reminders that were due but passed over because a later one was due too */
  skipped: number[];
  failed: number[];
}

/** The key under which reminder `n` of the warning that began after `lastCheckIn` is remembered. */
export const reminderStep = (lastCheckIn: number, n: number) => `rem:${lastCheckIn}:${n}`;

export function createReminders(deps: ReminderDeps) {
  const { notifier, store, appUrl } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((l: string) => console.log(`[reminders] ${l}`));
  const retry = new Map<string, { n: number; at: number }>();
  const link = (letterId: string) => `${appUrl.replace(/\/+$/, "")}/me/${encodeURIComponent(letterId)}`;

  /** The warning's window in ms: [start, end). A reminder is only ever due inside it. */
  const windowOf = (s: ReminderState) => {
    const start = (s.lastCheckIn + s.quiet) * 1000;
    return { start, end: start + s.warning * 1000 };
  };

  /** Does this letter have anything to remind about? (An owner email we can really send to.) */
  const wants = (pkg: PostmanPackage | null | undefined): pkg is PostmanPackage & { reminders: OwnerReminders } => !!pkg?.reminders && sendable(pkg.reminders.email);

  /** One pass for one letter: send whatever reminder is due and not yet sent. Cheap and repeatable. */
  async function check(letterId: string, pkg: PostmanPackage, s: ReminderState): Promise<ReminderReport> {
    const report: ReminderReport = { sent: [], skipped: [], failed: [] };
    if (!wants(pkg) || !notifier.channels.email) return report;
    if (s.status !== STATUS.Warning) return report; // Active (checked in) or Released or Cancelled: nothing to remind about
    const { start, end } = windowOf(s);
    const t = now();
    if (t < start || t >= end) return report;

    const offsets = reminderOffsets(s.warning);
    const due = offsets.map((o, i) => ({ n: i + 1, at: start + o * 1000 })).filter((d) => d.at <= t);
    if (due.length === 0) return report;
    const done = await store.steps(letterId);
    const pending = due.filter((d) => !done.has(reminderStep(s.lastCheckIn, d.n)));
    if (pending.length === 0) return report;

    // only the latest due reminder is sent; the earlier ones that were missed are remembered as passed over
    const latest = pending[pending.length - 1]!;
    for (const d of pending.slice(0, -1)) {
      if (await store.claim(letterId, reminderStep(s.lastCheckIn, d.n), t)) report.skipped.push(d.n);
    }
    const key = reminderStep(s.lastCheckIn, latest.n);
    const wait = retry.get(`${letterId}:${key}`);
    if (wait && t < wait.at) return report;
    if (!(await store.claim(letterId, key, t))) return report; // already done (maybe by another pass or process)
    try {
      const m = reminderMessage(pkg.reminders, link(letterId));
      await notifier.email(pkg.reminders.email, m.subject, m.text, `tabella-${letterId}-rem-${s.lastCheckIn}-${latest.n}`);
      retry.delete(`${letterId}:${key}`);
      report.sent.push(latest.n);
      log(`letter #${letterId}: reminder ${latest.n} sent`);
    } catch (err) {
      await store.release(letterId, key); // try again on a later pass
      const n = (retry.get(`${letterId}:${key}`)?.n ?? 0) + 1;
      const hopeless = err instanceof ProviderError && err.hopeless;
      const delay = hopeless ? 10 * MIN : Math.min(30_000 * 2 ** (n - 1), 5 * MIN);
      retry.set(`${letterId}:${key}`, { n, at: t + delay });
      report.failed.push(latest.n);
      log(`letter #${letterId}: reminder ${latest.n} failed (${err instanceof Error ? err.message : "error"}); will retry in ${Math.round(delay / 1000)} s`);
    }
    return report;
  }

  return { check, wants, windowOf };
}
export type Reminders = ReturnType<typeof createReminders>;
