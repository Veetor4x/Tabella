/**
 * The escalation ladder for a "surprise" letter, run by the Postman once the letter is released.
 *
 *   0    email to the recipient:  "<Owner> left you a letter. It's been kept safe until now."  + a link
 *   +d1  a reminder email                                                          (3 days; demo: 2 minutes)
 *   +d2  backup 1, by email: "<Owner> left a letter for <Name> and asked you to help them receive it."   (7 days; demo: 4 minutes)
 *        then backup 2, backup 3, one every `gap` after the one before              (2 days; demo: 2 minutes)
 *
 * EMAIL ONLY FOR NOW. Text messages and phone calls are written and tested, but sit behind a provider switch: their steps
 * exist only while the notifier reports that channel as available (Twilio keys present). With the keys they add an SMS
 * with the first email, a phone call and a reminder SMS with the reminder email, and an SMS with each backup email.
 *   it stops as soon as the letter is opened ("opened" is reported with a signature from the unlocked card).
 *
 * Safe by construction: every step is CLAIMED in the store before anything is sent (so a second pass, a second
 * process or a restart never sends it twice); a failed send gives the claim back so the next pass retries it.
 * Never logged: addresses, phone numbers, names, links. Logs say "letter #N: step X sent".
 */
import type { PostmanPackage } from "../../shared/surprise.ts";
import { ProviderError } from "./notify/providers.js";
import type { LadderStore, Notifier } from "./notify/types.js";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
export const TIMINGS = {
  real: { call: 3 * DAY, backup: 7 * DAY, gap: 2 * DAY },
  demo: { call: 2 * MIN, backup: 4 * MIN, gap: 2 * MIN },
} as const;

const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,24}$/;
const PHONE = /^\+[1-9]\d{6,14}$/;
export const validEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && EMAIL.test(s);
export const validPhone = (s: unknown): s is string => typeof s === "string" && PHONE.test(s.replace(/[\s()-]/g, ""));
const phoneOf = (s: string) => s.replace(/[\s()-]/g, "");
/** Addresses that can never be real inboxes: nothing is ever sent to them (so test letters cannot bounce). */
const RESERVED = /@(?:[^@]+\.)?(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
export const sendable = (s: unknown): s is string => validEmail(s) && !RESERVED.test(s);
const clean = (s: string) => s.replace(/[\r\n<>]/g, " ").trim().slice(0, 60);

interface Step {
  key: string;
  /** ms after the ladder started */
  at: number;
  channel: "email" | "sms" | "call";
  send: (n: Notifier) => Promise<void>;
}

export function buildSteps(letterId: string, pkg: PostmanPackage, appUrl: string, channels: Notifier["channels"] = { email: true, sms: false, call: false }): Step[] {
  const t = TIMINGS[pkg.mode === "demo" ? "demo" : "real"];
  const link = `${appUrl.replace(/\/+$/, "")}/open?letter=${encodeURIComponent(letterId)}`;
  const owner = clean(pkg.owner) || "Someone who cares about you";
  const r = pkg.recipient;
  const rName = clean(r.name);
  const steps: Step[] = [];
  const add = (key: string, at: number, channel: Step["channel"], send: Step["send"]) => steps.push({ key, at, channel, send });
  const footer = "Tabella: sealed today, opened when it matters.";

  if (sendable(r.email)) {
    add("r:email", 0, "email", (n) => n.email(r.email, `${owner} left you a letter`, `${owner} left you a letter. It's been kept safe until now.\n\nOpen it here:\n${link}\n\nYou'll be asked one question that only you can answer.\n\n${footer}`, `tabella-${letterId}-r-email`));
    add("r:email2", t.call, "email", (n) => n.email(r.email, `A gentle reminder: ${owner} left you a letter`, `A gentle reminder: ${owner} left you a letter, and it's still waiting for you.\n\nOpen it here:\n${link}\n\nYou'll be asked one question that only you can answer. Take your time.\n\n${footer}`, `tabella-${letterId}-r-email2`));
  }
  // text messages and calls: only while Twilio is switched on
  if (channels.sms && validPhone(r.phone)) {
    add("r:sms", 0, "sms", (n) => n.sms(phoneOf(r.phone), `${owner} left you a letter. It's been kept safe until now. ${link}`));
    add("r:sms2", t.call, "sms", (n) => n.sms(phoneOf(r.phone), `A gentle reminder: ${owner} left you a letter. ${link}`));
  }
  if (channels.call && validPhone(r.phone)) add("r:call", t.call, "call", (n) => n.call(phoneOf(r.phone), `Hello${rName ? ` ${rName}` : ""}. This is a message from Tabella. ${owner} left you a letter, and it has been kept safe until now. Please check your messages, or look for Tabella online, to open it. Take your time.`));

  pkg.backups.slice(0, 3).forEach((b, i) => {
    const at = t.backup + i * t.gap;
    const line = `${owner} left a letter for ${rName || "someone you know"} and asked you to help them receive it.`;
    if (sendable(b.email)) add(`b${i + 1}:email`, at, "email", (n) => n.email(b.email, `${owner} asked for your help`, `${line}\n\nYou can help here:\n${link}\n\nYou'll be asked one question that only you can answer.\n\n${footer}`, `tabella-${letterId}-b${i + 1}-email`));
    if (channels.sms && validPhone(b.phone)) add(`b${i + 1}:sms`, at, "sms", (n) => n.sms(phoneOf(b.phone), `${line} ${link}`));
  });
  return steps;
}

export interface EscalationDeps {
  notifier: Notifier;
  store: LadderStore;
  appUrl: string;
  now?: () => number;
  log?: (line: string) => void;
}

export interface PassReport {
  sent: string[];
  skipped: string[];
  failed: string[];
  /** nothing left to send (all done) or the letter was opened */
  finished: boolean;
  opened: boolean;
}

export function createEscalation(deps: EscalationDeps) {
  const { notifier, store, appUrl } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((l: string) => console.log(`[ladder] ${l}`));
  const waitingLogged = new Set<string>();
  /** after a failed send a step waits before the next try (30 s, 1 min, 2 min, 5 min), and a refusal that will not fix itself waits 10 minutes */
  const retry = new Map<string, { n: number; at: number }>();

  /** One pass for one released letter. Cheap and repeatable: it only does what is due and not yet done. */
  async function run(letterId: string, pkg: PostmanPackage): Promise<PassReport> {
    const report: PassReport = { sent: [], skipped: [], failed: [], finished: false, opened: false };
    const done = await store.steps(letterId);
    if (done.has("opened")) return { ...report, finished: true, opened: true };

    // the clock starts when the first message CAN go out (no key yet = nothing starts, nothing is lost)
    if (!notifier.channels.email && !notifier.channels.sms) {
      if (!waitingLogged.has(`${letterId}:start`)) {
        waitingLogged.add(`${letterId}:start`);
        log(`letter #${letterId}: waiting, no message channel is set up yet`);
      }
      return report;
    }
    if (!done.has("start") && (await store.claim(letterId, "start", now()))) log(`letter #${letterId}: the ladder starts`);
    const startedAt = (await store.steps(letterId)).get("start") ?? now();
    const elapsed = now() - startedAt;

    const steps = buildSteps(letterId, pkg, appUrl, notifier.channels);
    for (const s of steps) {
      if (s.at > elapsed) continue;
      // the letter may have been opened while we were busy: look again before every step
      if ((await store.steps(letterId)).has("opened")) return { ...report, finished: true, opened: true };
      if (done.has(s.key)) continue;
      if (!notifier.channels[s.channel]) {
        // not set up yet (no key): leave the step waiting, so it goes out the moment the key is added
        if (!waitingLogged.has(`${letterId}:${s.key}`)) {
          waitingLogged.add(`${letterId}:${s.key}`);
          log(`letter #${letterId}: step ${s.key} is waiting (${s.channel} is not set up)`);
        }
        report.skipped.push(s.key);
        continue;
      }
      const wait = retry.get(`${letterId}:${s.key}`);
      if (wait && now() < wait.at) continue; // still waiting after a failed try
      if (!(await store.claim(letterId, s.key, now()))) continue; // already done (maybe by an earlier pass)
      try {
        await s.send(notifier);
        retry.delete(`${letterId}:${s.key}`);
        report.sent.push(s.key);
        log(`letter #${letterId}: step ${s.key} sent`);
      } catch (err) {
        await store.release(letterId, s.key); // try again on a later pass
        const n = (retry.get(`${letterId}:${s.key}`)?.n ?? 0) + 1;
        const hopeless = err instanceof ProviderError && err.hopeless;
        const delay = hopeless ? 10 * MIN : Math.min(30_000 * 2 ** (n - 1), 5 * MIN);
        retry.set(`${letterId}:${s.key}`, { n, at: now() + delay });
        report.failed.push(s.key);
        log(`letter #${letterId}: step ${s.key} failed (${err instanceof Error ? err.message : "error"}); will retry in ${Math.round(delay / 1000)} s`);
      }
    }
    const after = await store.steps(letterId);
    report.finished = steps.length === 0 || steps.every((s) => after.has(s.key));
    return report;
  }

  /** The browser says the letter was opened (already checked against the card's signature). Stops the ladder. */
  async function markOpened(letterId: string): Promise<boolean> {
    const first = await store.claim(letterId, "opened", now());
    if (first) log(`letter #${letterId}: opened, the ladder stops`);
    return first;
  }

  return { run, markOpened };
}
export type Escalation = ReturnType<typeof createEscalation>;
