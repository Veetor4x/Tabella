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
 * A letter whose Part B this Postman cannot open (sealed to some other key, or corrupt) can never become
 * openable, so it is marked "can't open": logged ONCE, then skipped for good (no reads, no gas, no log spam).
 *
 * Logs contain letter ids, counts and tx hashes only: never Part B, keys or envelopes.
 */
import { evmToQor } from "@qorechain/sdk";
import { bytesToHex, decodeFunctionResult, encodeFunctionData, hexToBytes, type Hex } from "viem";
import { openPart, sealPartB, type SealKeyPair } from "../../shared/tabella-crypto.ts";
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
}

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

  let running = false;
  let stopped = true;
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
      B = openPart(hexToBytes(letter.partBForPostman), keys);
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
      finished.add(id);
      retry.delete(id);
      stats.published++;
      report.published.push(id);
      log(`published Part B for letter #${id} tx=${String(out.body.txHash)} gas=${String(out.body.gasUsed)}`);
      return;
    }
    if (out.body.error === "would_revert" && out.body.reason === "AlreadyPublished") {
      finished.add(id);
      log(`letter #${id}: Part B was already published`);
      return;
    }
    backoff(id);
    report.waiting.push(id);
    stats.lastError = String(out.body.error);
    log(`letter #${id}: not published (${String(out.body.error)}${out.body.reason ? `: ${String(out.body.reason)}` : ""}); will retry`);
  }

  async function visit(id: bigint, report: TickReport): Promise<void> {
    const status = Number(await read("status", [id]));
    if (status === STATUS.Cancelled) {
      finished.add(id);
      return;
    }
    if (status !== STATUS.Released) return; // Active or Warning: nothing to do yet

    const letter = (await read("getLetter", [id])) as LetterView;
    if (letter.released) {
      finished.add(id); // published (maybe by an earlier attempt of ours that looked like it failed)
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
        report.scanned++;
        try {
          await visit(id, report);
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

  /** Run a tick now, then every `postmanIntervalMs` after the previous one finishes (never overlapping). */
  function start(): void {
    if (!stopped) return;
    stopped = false;
    const loop = async () => {
      await tick();
      if (!stopped) timer = setTimeout(loop, cfg.postmanIntervalMs);
    };
    void loop();
  }

  function stop(): void {
    stopped = true;
    if (timer) clearTimeout(timer);
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

  return { tick, start, stop, info };
}

export type Postman = ReturnType<typeof createPostman>;
