import { decodeFunctionData, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { registryAbi } from "../src/abi.js";
import { RevertError } from "../src/chain.js";
import { loadConfig, type Config } from "../src/config.js";
import { createApp } from "../src/relay.js";
import { MockChain } from "./mockChain.js";

const REGISTRY = "0x1111111111111111111111111111111111111111" as Hex;
const PUBKEY = ("0x" + "11".repeat(2592)) as Hex;
const SIG = ("0x" + "22".repeat(4627)) as Hex;
const ADA = "0x00000000000000000000000000000000000ada00";
const SAM = "0x0000000000000000000000000000000000005a00";

const createBody = (over: Record<string, unknown> = {}) => ({
  fn: "createLetter",
  args: {
    heirs: [ADA, SAM],
    guardianKeyHash: "0x" + "ab".repeat(32),
    quietPeriod: 120,
    warningPeriod: "60",
    letterCiphertext: "0x" + "c1".repeat(100),
    partAEnvelope: "0x" + "a1".repeat(300),
    partBForPostman: "0x" + "b1".repeat(200),
  },
  pubkey: PUBKEY,
  sig: SIG,
  ...over,
});
const checkInBody = (over: Record<string, unknown> = {}) => ({ fn: "checkIn", args: { letterId: "7" }, pubkey: PUBKEY, sig: SIG, ...over });

let chain: MockChain;
let cfg: Config;
let nowMs: number;

function makeApp(env: Record<string, string> = {}) {
  cfg = loadConfig({ REGISTRY_ADDRESS: REGISTRY, RATE_LIMIT_PER_MIN: "1000", GLOBAL_RATE_LIMIT_PER_MIN: "1000", ...env });
  return createApp({ chain, cfg, now: () => nowMs, log: () => {} });
}

const post = (app: ReturnType<typeof makeApp>, body: unknown, headers: Record<string, string> = {}) =>
  app.request("/relay", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  chain = new MockChain();
  nowMs = 1_000_000;
});

describe("what /relay accepts", () => {
  it("relays createLetter, checkIn, guardianPause and cancel to the registry with the right calldata", async () => {
    const app = makeApp();
    for (const fn of ["checkIn", "guardianPause", "cancel"] as const) {
      const res = await post(app, checkInBody({ fn }));
      expect(res.status, fn).toBe(200);
    }
    expect((await post(app, createBody())).status).toBe(200);

    expect(chain.sent).toHaveLength(4);
    for (const s of chain.sent) expect(s.to).toBe(REGISTRY); // only ever the registry

    const decoded = chain.sent.map((s) => decodeFunctionData({ abi: registryAbi, data: s.data }));
    expect(decoded.map((d) => d.functionName)).toEqual(["checkIn", "guardianPause", "cancel", "createLetter"]);
    expect(decoded[0]!.args).toEqual([7n, PUBKEY, SIG]);
    const create = decoded[3]!.args as readonly unknown[];
    expect((create[0] as string[]).map((a) => a.toLowerCase())).toEqual([ADA, SAM]); // viem returns checksummed addresses
    expect(create[2]).toBe(120n);
    expect(create[3]).toBe(60n);
    expect(create[7]).toBe(PUBKEY);
    expect(create[8]).toBe(SIG);
  });

  const datedBody = (over: Record<string, unknown> = {}) => ({
    fn: "createDatedLetter",
    args: { heirs: [ADA, SAM], releaseAt: "1900000000", letterCiphertext: "0x" + "c1".repeat(100), partAEnvelope: "0x" + "a1".repeat(300), partBForPostman: "0x" + "b1".repeat(200) },
    pubkey: PUBKEY,
    sig: SIG,
    ...over,
  });

  it("relays createDatedLetter (a letter that opens on an exact date) with the right calldata", async () => {
    const app = makeApp();
    const res = await post(app, datedBody());
    expect(res.status).toBe(200);
    const d = decodeFunctionData({ abi: registryAbi, data: chain.sent[0]!.data });
    expect(d.functionName).toBe("createDatedLetter");
    const a = d.args as readonly unknown[];
    expect((a[0] as string[]).map((x) => x.toLowerCase())).toEqual([ADA, SAM]);
    expect(a[1]).toBe(1_900_000_000n);
    expect(a[5]).toBe(PUBKEY);
    expect(a[6]).toBe(SIG);
    expect(chain.sent[0]!.to).toBe(REGISTRY);
  });
  it("refuses a dated letter with a missing or odd date, extra fields, or a guardian (dated letters have none)", async () => {
    const app = makeApp();
    const base = datedBody().args;
    for (const bad of [
      datedBody({ args: { ...base, releaseAt: undefined } }),
      datedBody({ args: { ...base, releaseAt: "0" } }),
      datedBody({ args: { ...base, releaseAt: "tomorrow" } }),
      datedBody({ args: { ...base, releaseAt: "-5" } }),
      datedBody({ args: { ...base, releaseAt: "99999999999999999999999" } }),
      datedBody({ args: { ...base, guardianKeyHash: "0x" + "ab".repeat(32) } }),
      datedBody({ args: { ...base, quietPeriod: 120 } }),
      datedBody({ args: { ...base, heirs: [] } }),
    ]) {
      expect((await post(app, bad)).status).toBe(400);
    }
    expect(chain.sent).toHaveLength(0);
  });
  it("names the contract's dated-letter refusals kindly (BadDate)", async () => {
    chain.revertWith("BadDate");
    const res = await post(makeApp(), datedBody());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "would_revert", reason: "BadDate" });
  });

  it("returns the tx hash, gas used and block", async () => {
    const res = await post(makeApp(), checkInBody());
    expect(await res.json()).toMatchObject({ ok: true, fn: "checkIn", txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/), gasUsed: "250000", blockNumber: "1001" });
  });

  it.each(["publishPartB", "setPostman", "transferOwnership", "withdraw", ""])("refuses %j (not one of the four calls)", async (fn) => {
    const res = await post(makeApp(), { fn, args: {}, pubkey: PUBKEY, sig: SIG });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "function_not_allowed" });
    expect(chain.calls).toEqual([]); // touched nothing
  });

  it("refuses a request that names no function or is not JSON", async () => {
    const app = makeApp();
    expect((await post(app, { args: {} })).status).toBe(400);
    expect((await post(app, "not json {")).status).toBe(400);
    expect((await post(app, "null")).status).toBe(400);
    expect((await post(app, "[]")).status).toBe(400);
    expect(chain.calls).toEqual([]);
  });
});

describe("input validation (nothing reaches the chain)", () => {
  const bad: [string, unknown][] = [
    ["unknown top-level field", checkInBody({ extra: 1 })],
    ["unknown arg", { ...checkInBody(), args: { letterId: "1", other: 1 } }],
    ["letterId 0", checkInBody({ args: { letterId: 0 } })],
    ["letterId negative", checkInBody({ args: { letterId: -1 } })],
    ["letterId not a number", checkInBody({ args: { letterId: "abc" } })],
    ["letterId too big", checkInBody({ args: { letterId: "99999999999999999999" } })],
    ["letterId float", checkInBody({ args: { letterId: 1.5 } })],
    ["pubkey too short", checkInBody({ pubkey: "0x" + "11".repeat(2591) })],
    ["pubkey too long", checkInBody({ pubkey: "0x" + "11".repeat(2593) })],
    ["sig too short", checkInBody({ sig: "0x" + "22".repeat(4626) })],
    ["sig not hex", checkInBody({ sig: "0x" + "zz".repeat(4627) })],
    ["sig without 0x", checkInBody({ sig: "22".repeat(4627) })],
    ["sig odd digits", checkInBody({ sig: "0x" + "2".repeat(9253) })],
    ["pubkey missing", { fn: "checkIn", args: { letterId: 1 }, sig: SIG }],
    ["no heirs", createBody({ args: { ...createBody().args, heirs: [] } })],
    ["four heirs", createBody({ args: { ...createBody().args, heirs: [ADA, SAM, ADA, SAM] } })],
    ["zero-address heir", createBody({ args: { ...createBody().args, heirs: ["0x" + "0".repeat(40)] } })],
    ["heir not an address", createBody({ args: { ...createBody().args, heirs: ["0x1234"] } })],
    ["quiet period 0", createBody({ args: { ...createBody().args, quietPeriod: 0 } })],
    ["warning period 0", createBody({ args: { ...createBody().args, warningPeriod: 0 } })],
    ["period over 10 years", createBody({ args: { ...createBody().args, quietPeriod: 3651 * 86400 } })],
    ["empty ciphertext", createBody({ args: { ...createBody().args, letterCiphertext: "0x" } })],
    ["ciphertext over 8192 bytes", createBody({ args: { ...createBody().args, letterCiphertext: "0x" + "aa".repeat(8193) } })],
    ["partA over 8192 bytes", createBody({ args: { ...createBody().args, partAEnvelope: "0x" + "aa".repeat(8193) } })],
    ["guardian hash wrong size", createBody({ args: { ...createBody().args, guardianKeyHash: "0x" + "ab".repeat(31) } })],
    ["missing arg", createBody({ args: { ...createBody().args, partBForPostman: undefined } })],
  ];

  it.each(bad)("rejects: %s", async (_name, body) => {
    const res = await post(makeApp(), body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: string; details: unknown[] };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("invalid_request");
    expect(chain.calls).toEqual([]);
  });

  it("accepts values exactly at the limits", async () => {
    const edge = createBody({
      args: {
        heirs: [ADA, SAM, "0x00000000000000000000000000000000000000c3"],
        guardianKeyHash: "0x" + "00".repeat(32), // no guardian
        quietPeriod: 3650 * 86400,
        warningPeriod: 1,
        letterCiphertext: "0x" + "aa".repeat(8192),
        partAEnvelope: "0x" + "bb".repeat(8192),
        partBForPostman: "0x" + "cc".repeat(1),
      },
    });
    expect((await post(makeApp(), edge)).status).toBe(200);
  });

  it("does not echo submitted values back in errors", async () => {
    const res = await post(makeApp(), checkInBody({ sig: "0xDEADBEEFSECRETVALUE" }));
    expect(JSON.stringify(await res.json())).not.toContain("SECRETVALUE");
  });

  it("rejects an oversized body with 413 before parsing it", async () => {
    const app = makeApp({ MAX_BODY_BYTES: "2000" });
    const res = await post(app, createBody());
    expect(res.status).toBe(413);
    expect(chain.calls).toEqual([]);
  });
});

describe("simulate first: never waste gas", () => {
  it("refuses a call that would revert, and spends nothing (no window opened, nothing sent)", async () => {
    chain.window = { found: true, live: true, remainingBlocks: 5n, remainingTxs: 1n, remainingValue: 1n }; // low window
    chain.revertWith("InvalidSignature");
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "would_revert", reason: "InvalidSignature" });
    expect(chain.spending).toEqual([]);
    expect(chain.calls).toEqual(["balance", "simulate"]);
  });

  it("simulates before it opens a window or sends", async () => {
    chain.window = { found: false, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n };
    await post(makeApp(), checkInBody());
    expect(chain.calls).toEqual(["balance", "simulate", "gasPrice", "window", "openWindow", "window", "send"]);
  });

  it("sends with gas = estimate + 25%, and a fee at most the cap", async () => {
    chain.simulateImpl = () => 400_000n;
    await post(makeApp(), checkInBody());
    expect(chain.sent[0]!.gas).toBe(500_000n);
    expect(chain.sent[0]!.maxFeePerGas).toBe(225_000_000_000n); // 2 x 112.5 gwei, under the 250 gwei cap
  });

  it("caps the fee at the window's cap and refuses when gas is above it", async () => {
    chain.gasPriceWei = 200_000_000_000n;
    await post(makeApp(), checkInBody());
    expect(chain.sent[0]!.maxFeePerGas).toBe(250_000_000_000n);

    chain = new MockChain();
    chain.gasPriceWei = 300_000_000_000n;
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "gas_price_too_high" });
    expect(chain.spending).toEqual([]);
  });

  it("refuses a call that needs more gas than MAX_TX_GAS", async () => {
    chain.simulateImpl = () => 12_000_001n;
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "too_expensive" });
    expect(chain.spending).toEqual([]);
  });

  it("never sets a gas limit above MAX_TX_GAS", async () => {
    chain.simulateImpl = () => 11_000_000n; // +25% would be 13.75M
    await post(makeApp(), checkInBody());
    expect(chain.sent[0]!.gas).toBe(12_000_000n);
  });

  it("stops when the helper is out of funds, before simulating", async () => {
    chain.balance = 1_000n;
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "relayer_out_of_funds" });
    expect(chain.calls).toEqual(["balance"]);
  });

  it("reports 502 if a tx still reverts on chain (state changed after the simulation)", async () => {
    chain.sendStatus = "reverted";
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: "reverted_onchain", txHash: expect.any(String) });
  });
});

describe("EVM window management", () => {
  it("reuses a healthy window: it is never reopened", async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i++) expect((await post(app, checkInBody())).status).toBe(200);
    expect(chain.opened).toHaveLength(0);
    expect(chain.sent).toHaveLength(5);
  });

  it.each([
    ["no window at all", { found: false, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n }],
    ["window expired", { found: true, live: false, remainingBlocks: 0n, remainingTxs: 50n, remainingValue: 10n ** 12n }],
    ["few txs left", { found: true, live: true, remainingBlocks: 15_000n, remainingTxs: 10n, remainingValue: 10n ** 12n }],
    ["few blocks left", { found: true, live: true, remainingBlocks: 1_200n, remainingTxs: 150n, remainingValue: 10n ** 12n }],
    ["little value left", { found: true, live: true, remainingBlocks: 15_000n, remainingTxs: 150n, remainingValue: 1_000n }],
  ])("reopens when low: %s", async (_name, w) => {
    chain.window = w;
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(200);
    expect(chain.opened).toHaveLength(1);
    expect(chain.calls.indexOf("openWindow")).toBeLessThan(chain.calls.indexOf("send")); // before sending
    expect(await res.json()).toMatchObject({ windowOpenedTx: "WINDOWTX1" });
  });

  it("opens a demo-day-sized window: 17,280 blocks (~6.9 h) and 200 txs, value sized for the worst case", async () => {
    chain.window = { found: false, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n };
    await post(makeApp(), checkInBody());
    expect(chain.opened[0]).toEqual({
      blocks: 17_280n,
      maxTxs: 200n,
      maxValue: 200n * 3_000_000n, // 200 txs x (12M gas x 250 gwei = 3 QOR)
    });
  });

  it("clamps configured window sizes to the chain maximums", () => {
    const c = loadConfig({ REGISTRY_ADDRESS: REGISTRY, WINDOW_BLOCKS: "999999", WINDOW_MAX_TXS: "999999" });
    expect(c.windowBlocks).toBe(17_280n);
    expect(c.windowMaxTxs).toBe(1_000n);
  });

  it("opens the window once when many requests arrive together", async () => {
    chain.window = { found: false, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n };
    chain.delayMs = 5;
    const app = makeApp();
    const results = await Promise.all(Array.from({ length: 8 }, () => post(app, checkInBody())));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(chain.opened).toHaveLength(1);
    expect(chain.sent).toHaveLength(8);
  });

  it("sends one request at a time (EVM nonce and native sequence are one counter)", async () => {
    chain.delayMs = 5;
    const app = makeApp();
    await Promise.all(Array.from({ length: 6 }, () => post(app, checkInBody())));
    expect(chain.maxInFlight).toBe(1);
  });

  it("if the simulation is refused only for lack of a window, opens one and tries again", async () => {
    let first = true;
    chain.simulateImpl = () => {
      if (first) {
        first = false;
        throw new RevertError("evm window: no-window", "window");
      }
      return 300_000n;
    };
    chain.window = { found: false, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n };
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(200);
    expect(chain.calls.filter((c) => c === "simulate")).toHaveLength(2);
    expect(chain.opened).toHaveLength(1);
  });

  it("returns 503 (and sends nothing) if the opened window is not live", async () => {
    chain.window = { found: false, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n };
    chain.openLeavesWindowDead = true;
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "window_unavailable" });
    expect(chain.sent).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("allows the limit per IP, then answers 429 with Retry-After", async () => {
    const app = makeApp({ RATE_LIMIT_PER_MIN: "3", TRUSTED_PROXY_HOPS: "1" });
    const as = (ip: string) => post(app, checkInBody(), { "x-forwarded-for": ip });
    for (let i = 0; i < 3; i++) expect((await as("9.9.9.9")).status).toBe(200);
    const blocked = await as("9.9.9.9");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.json()).toMatchObject({ ok: false, error: "rate_limited", scope: "ip" });
    expect(chain.sent).toHaveLength(3); // the blocked one never reached the chain

    expect((await as("8.8.8.8")).status).toBe(200); // someone else is unaffected
  });

  it("starts a new window after a minute", async () => {
    const app = makeApp({ RATE_LIMIT_PER_MIN: "2", TRUSTED_PROXY_HOPS: "1" });
    const go = () => post(app, checkInBody(), { "x-forwarded-for": "9.9.9.9" });
    await go();
    await go();
    expect((await go()).status).toBe(429);
    nowMs += 61_000;
    expect((await go()).status).toBe(200);
  });

  it("cannot be dodged by spoofing X-Forwarded-For: only the entry the trusted proxy added counts", async () => {
    const app = makeApp({ RATE_LIMIT_PER_MIN: "2", TRUSTED_PROXY_HOPS: "1" });
    // the attacker prepends fake addresses; the proxy appends their real one (7.7.7.7) on the right
    const go = (fake: string) => post(app, checkInBody(), { "x-forwarded-for": `${fake}, 7.7.7.7` });
    expect((await go("1.1.1.1")).status).toBe(200);
    expect((await go("2.2.2.2")).status).toBe(200);
    expect((await go("3.3.3.3")).status).toBe(429);
  });

  it("also has a global limit that protects the helper's balance", async () => {
    const app = makeApp({ RATE_LIMIT_PER_MIN: "100", GLOBAL_RATE_LIMIT_PER_MIN: "4", TRUSTED_PROXY_HOPS: "1" });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post(app, checkInBody(), { "x-forwarded-for": `10.0.0.${i}` })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 429, 429]);
  });

  it("counts invalid requests too (they cost the helper CPU)", async () => {
    const app = makeApp({ RATE_LIMIT_PER_MIN: "2", TRUSTED_PROXY_HOPS: "1" });
    const go = () => post(app, { fn: "nope" }, { "x-forwarded-for": "9.9.9.9" });
    await go();
    await go();
    expect((await go()).status).toBe(429);
  });
});

describe("failures never leak details", () => {
  it("an RPC outage gives a generic 503", async () => {
    chain.down = true;
    const res = await post(makeApp(), checkInBody());
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(JSON.parse(text)).toEqual({ ok: false, error: "chain_unavailable" });
    expect(text).not.toMatch(/rpc down|SECRET/i);
  });

  it("a thrown error's message is logged server-side as name + message only", async () => {
    const lines: string[] = [];
    chain.down = true;
    const app = createApp({ chain, cfg: loadConfig({ REGISTRY_ADDRESS: REGISTRY, RATE_LIMIT_PER_MIN: "100" }), now: () => nowMs, log: (l) => lines.push(l) });
    await post(app, checkInBody());
    expect(lines.join("\n")).toMatch(/chain error \(Error: rpc down/);
  });
});

describe("GET /health", () => {
  it("shows balance and window status, and only whitelisted fields", async () => {
    const res = await makeApp().request("/health");
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, any>;
    expect(json).toMatchObject({
      ok: true,
      service: "tabella-helper",
      network: "qorechain-diana",
      registry: REGISTRY,
      helper: { qor: chain.qorAddress, evm: chain.evmAddress },
      balanceUqor: "100000000",
      lowBalance: false,
      window: { found: true, live: true, remainingTxs: "150", remainingBlocks: "15000", low: false },
    });
    expect(Object.keys(json).sort()).toEqual(["balanceUqor", "helper", "limits", "lowBalance", "network", "ok", "registry", "service", "time", "window"]);
  });

  it("never contains secrets", async () => {
    const text = await (await makeApp().request("/health")).text();
    for (const secret of ["SECRET-MNEMONIC", "SECRETPRIVATEKEY", "mnemonic", "privateKey", "HELPER_MNEMONIC"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("flags a low balance and a low window", async () => {
    chain.balance = 5n;
    chain.window = { found: true, live: true, remainingBlocks: 100n, remainingTxs: 2n, remainingValue: 1n };
    const json = (await (await makeApp().request("/health")).json()) as any;
    expect(json.lowBalance).toBe(true);
    expect(json.window.low).toBe(true);
  });

  it("does not hammer the chain: answers from a 5 s cache", async () => {
    const app = makeApp();
    await app.request("/health");
    await app.request("/health");
    expect(chain.calls.filter((c) => c === "balance")).toHaveLength(1);
    nowMs += 6_000;
    await app.request("/health");
    expect(chain.calls.filter((c) => c === "balance")).toHaveLength(2);
  });

  it("answers 503 with a generic body when the chain is down", async () => {
    chain.down = true;
    const res = await makeApp().request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "chain_unavailable" });
  });

  it("is rate limited too", async () => {
    const app = makeApp({ TRUSTED_PROXY_HOPS: "1" });
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await app.request("/health", { headers: { "x-forwarded-for": "5.5.5.5" } })).status;
    expect(last).toBe(429);
  });
});

describe("CORS and misc", () => {
  it("answers browser preflight and allows any origin by default", async () => {
    const res = await makeApp().request("/relay", {
      method: "OPTIONS",
      headers: { origin: "https://tabella.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("can be limited to named origins", async () => {
    const app = makeApp({ CORS_ORIGINS: "https://tabella-veetor4x.vercel.app" });
    const ok = await app.request("/health", { headers: { origin: "https://tabella-veetor4x.vercel.app" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://tabella-veetor4x.vercel.app");
    const other = await app.request("/health", { headers: { origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("only POST works on /relay; there are no other routes", async () => {
    const app = makeApp();
    expect((await app.request("/relay")).status).toBe(404);
    expect((await app.request("/admin")).status).toBe(404);
  });
});

describe("config", () => {
  it("requires a registry address", () => {
    expect(() => loadConfig({})).toThrow(/REGISTRY_ADDRESS/);
    expect(() => loadConfig({ REGISTRY_ADDRESS: "0x123" })).toThrow(/REGISTRY_ADDRESS/);
  });

  it("does not carry the mnemonic (a stray console.log(config) is safe)", () => {
    const c = loadConfig({ REGISTRY_ADDRESS: REGISTRY, HELPER_MNEMONIC: "word ".repeat(12) });
    expect(JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("word");
  });
});
