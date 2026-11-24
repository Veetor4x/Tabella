/**
 * The Postman: the release helper.
 *
 * Every `intervalMs` (20 s) it looks for letters whose status is Released and that have no Part B yet.
 * For each one it:  opens Part B (sealed to the Postman) -> reads every heir's registered ML-KEM key
 * -> seals Part B to them -> calls publishPartB.
 *
 * What it can and cannot do (say this honestly in the README):
 *   - it can DELAY a release (liveness), but it never sees Part A, so it cannot read a letter;
 *   - it cannot fake a check-in or a pause: those need the owner's / guardian's ML-DSA-87 signature.
 *
 * Retries are safe by construction, in layers:
 *   1. the contract itself allows publishPartB exactly once (AlreadyPublished) and only after Released;
 *   2. every call is simulated first, so a second attempt is refused for free;
 *   3. the on-chain `released` flag is read each tick, so a publish that succeeded while we saw an
 *      error (timeout) is noticed and never repeated;
 *   4. after a failed attempt a letter waits (30 s, 60 s, ... up to 5 min) before the next one;
 *   5. ticks never overlap and tx sending shares the relay's Mutex (one nonce counter).
 *
 * Startup catch-up: `start()` runs one FULL pass immediately (not after the first interval) and returns its
 * report. On a free Render instance the process is stopped when idle and restarted by the next request, so
 * this first pass is what publishes anything that became overdue while it slept, within seconds of waking.
 *
 * A letter whose Part B this Postman cannot open (sealed to some other key, or corrupt) can never become
 * openable, so it is marked "can't open": logged ONCE, then skipped for good (no reads, no gas, no log spam).
 *
 * Logs contain letter ids, counts and tx hashes only: never Part B, keys or envelopes.
 */
import { evmToQor } from "@qorechain/sdk";
import { bytesToHex, decodeFunctionResult, encodeFunctionData, hexToBytes, type Hex } from "viem";
import { keyHash, sealPartB, type SealKeyPair } from "../../shared/tabella-crypto.ts";
import { openPostmanPackage, verifyOpened, type PostmanPackage } from "../../shared/surprise.ts";
import type { Escalation } from "./escalation.js";
import type { Reminders } from "./reminders.js";
import { STATUS, postmanAbi } from "./abi.js";
import type { Chain } from "./chain.js";
import type { Config } from "./config.js";
import { describe, submit, type Json } from "./submit.js";
import type { Mutex } from "./window.js";

export interface PostmanDeps {
  chain: Chain;
  cfg: Config;
  /** The Postman's opening keys (derivePostmanKeys). */
  keys: SealKeyPair;
  /** Shared with /relay. */
  mutex: Mutex;
  log?: (line: string) => void;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
  /** The escalation ladder for surprise letters. Without it the Postman only publishes Part B. */
  escalation?: Escalation;
  /** Owner reminders, sent while a letter is in its warning. Without it the Postman sends none. */
  reminders?: Reminders;
}

export interface TickReport {
  /** true if another tick was still running */
  skipped: boolean;
  /** letters looked at (not yet finished) */
  scanned: number;
  published: bigint[];
  /** released letters we could not finish this tick (will retry) */
  waiting: bigint[];
  /** letters found this tick whose Part B this Postman cannot open (never retried) */
  cannotOpen: bigint[];
  errors: number;
}

interface LetterView {
  heirs: readonly Hex[];
  released: boolean;
  partBForPostman: Hex;
  quietPeriod?: bigint;
  warningPeriod?: bigint;
  releaseAt?: bigint;
  lastCheckIn?: bigint;
}

/** A letter whose owner asked for reminders: what we need to keep an eye on it while it is Active or in Warning. */
interface Watched {
  pkg: PostmanPackage;
  quiet: number;
  warning: number;
  /** unix seconds; refreshed every time the letter is read. A check-in only ever moves the warning LATER, so an old value is a safe (early) guess. */
  lastCheckIn: number;
}
/** How early before a warning we start looking at a letter every few seconds. */
const WATCH_AHEAD_MS = 30_000;
/** A letter is "imminent" (looked at every few seconds, not every 20) from this long before it is released... */
const FAST_WINDOW_MS = 5 * 60_000;
/** ...until this long after (a release that cannot finish yet is left to the slow pass after that). */
const FAST_GRACE_MS = 15 * 60_000;
/** A letter that cannot be released for longer than this is not even read by the slow pass: one cheap look is enough until it is closer. */
const FAR_MS = 10 * 60_000;

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
const WAIT_LOG_EVERY_MS = 5 * 60_000;

export function createPostman(deps: PostmanDeps) {
  const { chain, cfg, keys, mutex } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(`[postman] ${line}`));

  /** Letters that need nothing more from us (published by anyone, or cancelled). */
  const finished = new Set<bigint>();
  /** Letters whose Part B is not openable with our key. Permanent for this process; never retried. */
  const cannotOpen = new Set<bigint>();
  const retry = new Map<bigint, { attempts: number; at: number }>();
  const firstSeenReleased = new Map<bigint, number>();
  const lastWaitLog = new Map<bigint, number>();
  const stats = { lastTickAt: 0, lastTickOk: true, published: 0, scanned: 0, lastError: null as string | null };

  /** Letters with owner reminders that are still Active or in Warning. */
  const watched = new Map<bigint, Watched>();
  /** Letters we have looked at and that will never need a reminder (none asked for, or a dated letter). */
  const noReminders = new Set<bigint>();
  /**
   * When each Active or Warning letter will be released AT THE EARLIEST (ms). A check-in or a pause only moves the release LATER, so an old
   * value is a safe (early) guess: it can make us look too soon, never too late.
   */
  const due = new Map<bigint, { at: number; checked: number }>();
  /** Test-timed ladders that are still sending their steps (minutes apart): looked at quickly until they are done. id -> stop looking at (ms). */
  const quickLadders = new Map<bigint, number>();
  /** Letters being worked on right now, so the slow and the quick pass never do the same letter at the same time. */
  const busy = new Set<bigint>();
  let fastRunning = false;
  let fastTimer: ReturnType<typeof setTimeout> | undefined;
  let remindersRunning = false;
  let remTimer: ReturnType<typeof setTimeout> | undefined;

  let running = false;
  let stopped = true;
  let catchUp: Promise<TickReport> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function read(functionName: "letterCount" | "status" | "getLetter", args: unknown[] = []): Promise<unknown> {
    const data = encodeFunctionData({ abi: postmanAbi, functionName, args } as never);
    const out = await chain.call({ to: cfg.registry, data });
    return decodeFunctionResult({ abi: postmanAbi, functionName, data: out } as never);
  }

  function backoff(id: bigint) {
    const attempts = (retry.get(id)?.attempts ?? 0) + 1;
    retry.set(id, { attempts, at: now() + Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS) });
  }

  /** A released letter without Part B: do everything needed to publish it. */
  async function handle(id: bigint, letter: LetterView, report: TickReport): Promise<void> {
    // 1. Open Part B (sealed to the Postman at creation time).
    let B: Uint8Array;
    try {
      ({ B } = openPostmanPackage(hexToBytes(letter.partBForPostman), keys));
    } catch (err) {
      // Not sealed to our key (or corrupt): that will never change, so say so once and stop looking at it.
      cannotOpen.add(id);
      report.cannotOpen.push(id);
      log(`letter #${id}: cannot open Part B (${(err as { code?: string }).code ?? "error"}); it is not sealed to this Postman's key. Marked can't-open, not retrying`);
      return;
    }

    // 2. Every heir's registered opening key.
    const heirKeys: Uint8Array[] = [];
    let missing = 0;
    for (const heir of letter.heirs) {
      const k = await chain.kemKey(evmToQor(heir));
      if (k) heirKeys.push(k);
      else missing++;
    }
    if (missing > 0) {
      const waited = now() - (firstSeenReleased.get(id) ?? now());
      if (heirKeys.length === 0 || waited < cfg.heirKeyGraceMs) {
        // Publishing is a one-shot: never seal to a partial set unless the grace period is over.
        report.waiting.push(id);
        if (now() - (lastWaitLog.get(id) ?? 0) >= WAIT_LOG_EVERY_MS) {
          lastWaitLog.set(id, now());
          log(`letter #${id}: waiting for ${missing} of ${letter.heirs.length} heirs to register an opening key`);
        }
        return;
      }
      log(`WARNING letter #${id}: grace period over, sealing Part B to ${heirKeys.length} of ${letter.heirs.length} heirs`);
    }

    // 3. Seal Part B to the heirs and publish. The contract + simulation make a repeat harmless.
    const envelope = sealPartB(B, heirKeys);
    const data = encodeFunctionData({ abi: postmanAbi, functionName: "publishPartB", args: [id, bytesToHex(envelope)] });
    const out = await mutex.run(() => submit(chain, cfg, { fn: "publishPartB", to: cfg.registry, data }, log));

    if (out.status === 200) {
      if (!deps.escalation) finished.add(id); // with a ladder, the letter is finished only when its ladder is
      retry.delete(id);
      stats.published++;
      report.published.push(id);
      log(`published Part B for letter #${id} tx=${String(out.body.txHash)} gas=${String(out.body.gasUsed)}`);
      await ladder(id, { ...letter, released: true }, report); // a surprise letter starts its ladder at once
      return;
    }
    if (out.body.error === "would_revert" && out.body.reason === "AlreadyPublished") {
      if (!deps.escalation) finished.add(id);
      log(`letter #${id}: Part B was already published`);
      return;
    }
    backoff(id);
    report.waiting.push(id);
    stats.lastError = String(out.body.error);
    log(`letter #${id}: not published (${String(out.body.error)}${out.body.reason ? `: ${String(out.body.reason)}` : ""}); will retry`);
  }

  /** The contact package of a surprise letter (cached; undefined for an ordinary letter, which is finished once published). */
  const packages = new Map<bigint, PostmanPackage | null>();
  async function packageOf(id: bigint, letter: LetterView): Promise<PostmanPackage | null> {
    if (packages.has(id)) return packages.get(id)!;
    let pkg: PostmanPackage | null = null;
    try {
      pkg = openPostmanPackage(hexToBytes(letter.partBForPostman), keys).pkg ?? null;
    } catch {
      pkg = null;
    }
    packages.set(id, pkg);
    return pkg;
  }

  /** Run the escalation ladder for a released letter, if it has one. */
  async function ladder(id: bigint, letter: LetterView, report: TickReport): Promise<void> {
    const pkg = deps.escalation ? await packageOf(id, letter) : null;
    // an "invite them" letter that only carries owner reminders has an empty recipient: there is no ladder to run
    if (pkg && !pkg.recipient.email && !pkg.recipient.phone && pkg.backups.length === 0) {
      finished.add(id);
      return;
    }
    if (!pkg || !deps.escalation) {
      finished.add(id);
      return;
    }
    const r = await deps.escalation.run(id.toString(), pkg);
    if (r.finished) {
      finished.add(id);
      packages.delete(id);
      quickLadders.delete(id);
    } else if (pkg.mode === "demo" && !quickLadders.has(id)) {
      quickLadders.set(id, now() + FAST_GRACE_MS); // its steps are minutes apart: check every few seconds, not every 20
    }
  }

  /**
   * "Opened" from a browser: valid only if it is signed by the card this letter was made for (its fingerprint is in
   * the Postman's package). Returns "ok", "unknown" (not a surprise letter or not released yet) or "bad" (wrong signature).
   */
  async function reportOpened(id: bigint, publicKey: Uint8Array, sig: Uint8Array): Promise<"ok" | "unknown" | "bad"> {
    if (!deps.escalation) return "unknown";
    let letter: LetterView;
    try {
      letter = (await read("getLetter", [id])) as LetterView;
    } catch {
      return "unknown"; // no such letter
    }
    if (!letter.released) return "unknown";
    const pkg = await packageOf(id, letter);
    if (!pkg) return "unknown";
    if (keyHash(publicKey).toLowerCase() !== pkg.cardKeyHash.toLowerCase()) return "bad";
    if (!verifyOpened(publicKey, sig, cfg.registry, id)) return "bad";
    await deps.escalation.markOpened(id.toString());
    finished.add(id);
    return "ok";
  }

  // ---------------------------------------------------------------- owner reminders

  /** Look at one watched letter now (fresh from the network) and send whatever reminder is due. */
  async function remind(id: bigint): Promise<void> {
    const w = watched.get(id);
    if (!w || !deps.reminders) return;
    const status = Number(await read("status", [id]));
    if (status !== STATUS.Active && status !== STATUS.Warning) {
      watched.delete(id); // released or cancelled: no more reminders, ever
      return;
    }
    const letter = (await read("getLetter", [id])) as LetterView;
    w.lastCheckIn = Number(letter.lastCheckIn ?? w.lastCheckIn);
    await deps.reminders.check(id.toString(), w.pkg, { status, lastCheckIn: w.lastCheckIn, quiet: w.quiet, warning: w.warning });
  }

  /** Is it time to look at this letter every few seconds? (Its warning is about to start, or has.) */
  const nearWarning = (w: Watched) => now() >= (w.lastCheckIn + w.quiet) * 1000 - WATCH_AHEAD_MS;

  /** Called for a letter that is Active or in Warning: start watching it if its owner asked for reminders. */
  async function watch(id: bigint): Promise<void> {
    if (!deps.reminders) return;
    const known = watched.get(id);
    if (known) {
      if (nearWarning(known)) await remind(id); // far from its warning there is nothing to read: no calls spent
      return;
    }
    if (noReminders.has(id) || packages.get(id) === null) return; // already looked: this letter has no reminders
    const letter = (await read("getLetter", [id])) as LetterView;
    if (letter.releaseAt && letter.releaseAt > 0n) {
      noReminders.add(id); // a dated letter has no quiet time, so nothing to remind about
      return;
    }
    const pkg = await packageOf(id, letter);
    if (!pkg || !deps.reminders.wants(pkg)) {
      noReminders.add(id); // looked once: never read again for reminders
      return;
    }
    watched.set(id, { pkg, quiet: Number(letter.quietPeriod ?? 0n), warning: Number(letter.warningPeriod ?? 0n), lastCheckIn: Number(letter.lastCheckIn ?? 0n) });
    if (nearWarning(watched.get(id)!)) await remind(id);
  }

  /** The quick loop: only the few letters that are close to (or in) their warning, every few seconds, so a reminder goes out on time. */
  async function remindersPass(): Promise<void> {
    if (remindersRunning || !deps.reminders) return;
    remindersRunning = true;
    try {
      for (const [id, w] of [...watched]) {
        if (!nearWarning(w)) continue;
        try {
          await remind(id);
        } catch (err) {
          log(`letter #${id}: reminders ${describe(err)}`);
        }
      }
    } finally {
      remindersRunning = false;
    }
  }

  /** For the owner's page: has the recipient's email gone out? (Only the coarse state: never an address.) */
  async function deliveryOf(id: bigint): Promise<"waiting" | "none" | "sending" | "sent" | "failed" | "opened"> {
    if (!deps.escalation) return "none";
    const letter = (await read("getLetter", [id])) as LetterView;
    if (!letter.released) return "waiting";
    const pkg = await packageOf(id, letter);
    if (!pkg || (!pkg.recipient.email && !pkg.recipient.phone)) return "none";
    return deps.escalation.deliveryState(id.toString(), pkg);
  }

  /** Learn (or refresh) when a letter will be released, at the earliest. Cheap: it reads the letter at most once in a while. */
  async function noteDue(id: bigint): Promise<void> {
    const t = now();
    const known = due.get(id);
    // still in the future: nothing to learn. Past (a check-in moved it): look again, quickly if it matters now, rarely if it does not.
    if (known && (t <= known.at || t - known.checked < (t - known.at > FAST_GRACE_MS ? 300_000 : 10_000))) return;
    const l = (await read("getLetter", [id])) as LetterView;
    const at = l.releaseAt && l.releaseAt > 0n ? Number(l.releaseAt) * 1000 : (Number(l.lastCheckIn ?? 0n) + Number(l.quietPeriod ?? 0n) + Number(l.warningPeriod ?? 0n)) * 1000;
    due.set(id, { at, checked: t });
  }

  /** One letter, at most one worker at a time (the slow and the quick pass share the work). */
  async function visitOnce(id: bigint, report: TickReport): Promise<void> {
    if (busy.has(id)) return;
    busy.add(id);
    try {
      await visit(id, report);
    } finally {
      busy.delete(id);
    }
  }

  /** The slow pass can leave this letter alone: it cannot be released for a good while, and nothing about its reminders is due. */
  const farAway = (id: bigint): boolean => {
    const d = due.get(id);
    const w = watched.get(id);
    return !!d && d.at - now() > FAR_MS && !(w && nearWarning(w));
  };

  /**
   * The quick pass: only letters that are about to be released (or just were), and test-timed ladders still sending. Every few seconds,
   * a few letters, one cheap read each. It is what makes the first email go out within seconds of the release instead of up to a pass later.
   */
  async function fastPass(): Promise<void> {
    if (fastRunning) return;
    fastRunning = true;
    try {
      const t = now();
      const ids = new Set<bigint>();
      for (const [id, until] of quickLadders) {
        if (t > until || finished.has(id)) quickLadders.delete(id);
        else ids.add(id);
      }
      for (const [id, d] of due) if (!finished.has(id) && !cannotOpen.has(id) && d.at - t <= FAST_WINDOW_MS && t - d.at <= FAST_GRACE_MS) ids.add(id);
      for (const id of ids) {
        const report: TickReport = { skipped: false, scanned: 0, published: [], waiting: [], cannotOpen: [], errors: 0 };
        try {
          await visitOnce(id, report);
        } catch (err) {
          log(`letter #${id}: ${describe(err)}`);
        }
      }
    } finally {
      fastRunning = false;
    }
  }

  async function visit(id: bigint, report: TickReport): Promise<void> {
    const status = Number(await read("status", [id]));
    if (status === STATUS.Cancelled) {
      finished.add(id);
      watched.delete(id);
      return;
    }
    if (status === STATUS.Active || status === STATUS.Warning) {
      await noteDue(id);
      await watch(id).catch((err) => log(`letter #${id}: reminders ${describe(err)}`));
      return; // nothing else to do yet
    }
    watched.delete(id);
    due.delete(id);

    const letter = (await read("getLetter", [id])) as LetterView;
    if (letter.released) {
      // Part B is out (by us, or by an earlier attempt that looked like it failed). A surprise letter now needs its ladder.
      await ladder(id, letter, report);
      return;
    }
    if (!firstSeenReleased.has(id)) {
      firstSeenReleased.set(id, now());
      log(`letter #${id} is Released and has no Part B yet`);
    }
    const r = retry.get(id);
    if (r && now() < r.at) {
      report.waiting.push(id);
      return;
    }
    await handle(id, letter, report);
  }

  /** One pass over all letters. Safe to call at any time; a second call while one runs does nothing. */
  async function tick(): Promise<TickReport> {
    const report: TickReport = { skipped: false, scanned: 0, published: [], waiting: [], cannotOpen: [], errors: 0 };
    if (running) return { ...report, skipped: true };
    running = true;
    try {
      const count = (await read("letterCount")) as bigint;
      for (let id = 1n; id <= count; id++) {
        if (finished.has(id) || cannotOpen.has(id)) continue; // nothing more to do, and no RPC calls spent on them
        if (farAway(id)) continue; // not for a good while: the quick pass will pick it up when it is close
        report.scanned++;
        try {
          await visitOnce(id, report);
        } catch (err) {
          // one bad letter must not stop the others
          report.errors++;
          stats.lastError = err instanceof Error ? err.name : "error";
          log(`letter #${id}: ${describe(err)}`);
        }
      }
      stats.scanned = report.scanned;
      stats.lastTickOk = report.errors === 0;
    } catch (err) {
      report.errors++;
      stats.lastTickOk = false;
      stats.lastError = err instanceof Error ? err.name : "error";
      log(`tick failed: ${describe(err)}`);
    } finally {
      stats.lastTickAt = now();
      running = false;
    }
    return report;
  }

  /**
   * Run a full catch-up tick RIGHT NOW, then a tick every `postmanIntervalMs` after the previous one finishes
   * (never overlapping). Resolves with the catch-up tick's report; it never rejects (errors are logged and
   * counted in the report). Calling it again while running returns the same promise.
   */
  function start(): Promise<TickReport> {
    if (!stopped && catchUp) return catchUp;
    stopped = false;
    const loop = async () => {
      if (stopped) return;
      await tick();
      if (!stopped) timer = setTimeout(loop, cfg.postmanIntervalMs);
    };
    catchUp = tick(); // one full pass over every letter, before any waiting
    void catchUp.then(() => {
      if (!stopped) timer = setTimeout(loop, cfg.postmanIntervalMs);
    });
    const fast = async () => {
      if (stopped) return;
      await fastPass();
      if (!stopped) fastTimer = setTimeout(fast, cfg.fastIntervalMs);
    };
    fastTimer = setTimeout(fast, cfg.fastIntervalMs);
    if (deps.reminders) {
      const quick = async () => {
        if (stopped) return;
        await remindersPass();
        if (!stopped) remTimer = setTimeout(quick, cfg.reminderIntervalMs);
      };
      remTimer = setTimeout(quick, cfg.reminderIntervalMs);
    }
    return catchUp;
  }

  function stop(): void {
    stopped = true;
    catchUp = undefined;
    if (timer) clearTimeout(timer);
    if (remTimer) clearTimeout(remTimer);
    if (fastTimer) clearTimeout(fastTimer);
  }

  /** Public information for GET /health. */
  function info(): Json {
    return {
      enabled: true,
      address: chain.evmAddress,
      mlkemPublicKey: bytesToHex(keys.mlkemPublicKey),
      intervalSeconds: cfg.postmanIntervalMs / 1000,
      lastTickAt: stats.lastTickAt ? new Date(stats.lastTickAt).toISOString() : null,
      lastTickOk: stats.lastTickOk,
      lettersWatched: stats.scanned,
      published: stats.published,
      cannotOpen: cannotOpen.size,
      lastError: stats.lastError,
    };
  }

  return { tick, start, stop, info, reportOpened, deliveryOf, remindersPass, fastPass, watching: () => watched.size };
}

export type Postman = ReturnType<typeof createPostman>;
