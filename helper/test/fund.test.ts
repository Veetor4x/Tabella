import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type Config } from "../src/config.js";
import { normalizeQor } from "../src/fund.js";
import { createApp } from "../src/relay.js";
import { MockChain } from "./mockChain.js";

const REGISTRY = "0x1111111111111111111111111111111111111111";
const MIA = normalizeQor("0x00000000000000000000000000000000000ada00")!;
const LEO = normalizeQor("0x0000000000000000000000000000000000005a00")!;
const OTHER = normalizeQor("0x0000000000000000000000000000000000000b0b")!;

let chain: MockChain;
let cfg: Config;
let nowMs: number;
const makeApp = (env: Record<string, string> = {}) => {
  cfg = loadConfig({ REGISTRY_ADDRESS: REGISTRY, TRUSTED_PROXY_HOPS: "1", ...env });
  return createApp({ chain, cfg, now: () => nowMs, log: () => {} });
};
const fund = (app: ReturnType<typeof makeApp>, address: unknown, ip = "1.1.1.1") =>
  app.request("/fund", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ address }) });

beforeEach(() => {
  chain = new MockChain();
  nowMs = 1_000_000;
});

describe("/fund", () => {
  it("sends a small fixed amount to a new address, and says so", async () => {
    const app = makeApp();
    const res = await fund(app, MIA);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json).toMatchObject({ ok: true, amountUqor: "400000" });
    expect(chain.nativeBroadcasts).toHaveLength(1);
    const m = chain.nativeBroadcasts[0]![0]! as any;
    expect(m.typeUrl).toBe("/cosmos.bank.v1beta1.MsgSend");
    expect(m.value).toMatchObject({ fromAddress: chain.qorAddress, toAddress: MIA, amount: [{ denom: "uqor", amount: "400000" }] });
  });
  it("accepts the 0x form of an address too (and funds the same account)", async () => {
    const app = makeApp();
    expect((await fund(app, "0x00000000000000000000000000000000000ada00")).status).toBe(200);
    expect(((chain.nativeBroadcasts[0]![0] as any).value as any).toAddress).toBe(MIA);
  });
  it("funds each address once: a second ask is refused and nothing more is sent", async () => {
    const app = makeApp();
    expect((await fund(app, MIA)).status).toBe(200);
    const again = await fund(app, MIA, "2.2.2.2");
    expect(again.status).toBe(409);
    expect(((await again.json()) as any).error).toBe("already_funded");
    expect(chain.nativeBroadcasts).toHaveLength(1);
  });
  it("refuses an address that already holds something (also after a restart, when memory is empty)", async () => {
    chain.balances.set(MIA, 5n);
    const app = makeApp();
    expect((await fund(app, MIA)).status).toBe(409);
    expect(chain.nativeBroadcasts).toHaveLength(0);
  });
  it("two asks at the same moment send only once", async () => {
    chain.delayMs = 20;
    const app = makeApp();
    const [a, b] = await Promise.all([fund(app, MIA, "3.3.3.3"), fund(app, MIA, "4.4.4.4")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(chain.nativeBroadcasts).toHaveLength(1);
  });
  it("refuses anything that is not a plain account address", async () => {
    const app = makeApp();
    let n = 0;
    for (const bad of ["", "hello", "qor1abc", "0x1234", MIA.slice(0, -1) + "q", "cosmos1" + MIA.slice(4), 42, null, { a: 1 }, chain.qorAddress]) {
      expect((await fund(app, bad, `7.7.7.${++n}`)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(chain.nativeBroadcasts).toHaveLength(0);
  });
  it("is strictly rate limited: 3 per IP per hour, then a wait; each IP has its own count", async () => {
    const app = makeApp();
    const addrs = [MIA, LEO, OTHER, normalizeQor("0x00000000000000000000000000000000000000c1")!];
    expect((await fund(app, addrs[0], "9.9.9.9")).status).toBe(200);
    expect((await fund(app, addrs[1], "9.9.9.9")).status).toBe(200);
    expect((await fund(app, addrs[2], "9.9.9.9")).status).toBe(200);
    const blocked = await fund(app, addrs[3], "9.9.9.9");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(60);
    expect((await fund(app, addrs[3], "8.8.8.8")).status).toBe(200);
    nowMs += 3_600_001; // an hour later the IP may ask again
    expect((await fund(app, normalizeQor("0x00000000000000000000000000000000000000c2")!, "9.9.9.9")).status).toBe(200);
  });
  it("has a global hourly cap that protects the helper", async () => {
    const app = makeApp({ FUND_GLOBAL_PER_HOUR: "2" });
    expect((await fund(app, MIA, "1.0.0.1")).status).toBe(200);
    expect((await fund(app, LEO, "1.0.0.2")).status).toBe(200);
    const res = await fund(app, OTHER, "1.0.0.3");
    expect(res.status).toBe(429);
    expect(((await res.json()) as any).scope).toBe("global");
  });
  it("never dips into the helper's reserve", async () => {
    chain.balance = 2_000_000n + 399_999n; // reserve + a little less than one gift
    const app = makeApp();
    const res = await fund(app, MIA);
    expect(res.status).toBe(503);
    expect(chain.nativeBroadcasts).toHaveLength(0);
  });
  it("is testnet only: off for anything but a testnet endpoint, and off when switched off", async () => {
    expect((await fund(makeApp({ QORE_REST_URL: "https://api.qore.example" }), MIA)).status).toBe(403);
    expect((await fund(makeApp({ FUND_ENABLED: "false" }), MIA)).status).toBe(403);
    expect(chain.nativeBroadcasts).toHaveLength(0);
  });
  it("the amount is not up to the caller", async () => {
    const app = makeApp();
    const res = await app.request("/fund", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "6.6.6.3" }, body: JSON.stringify({ address: MIA, amount: "99999999999", amountUqor: 1e12 }) });
    expect(res.status).toBe(200);
    expect(((chain.nativeBroadcasts[0]![0] as any).value as any).amount[0].amount).toBe("400000");
  });
  it("refuses a body that is not JSON or is too big, and a failed send does not use up the address", async () => {
    const app = makeApp();
    expect((await app.request("/fund", { method: "POST", headers: { "x-forwarded-for": "6.6.6.1" }, body: "nope" })).status).toBe(400);
    expect((await app.request("/fund", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "6.6.6.2" }, body: JSON.stringify({ address: MIA, pad: "x".repeat(2000) }) })).status).toBe(413);
    chain.down = true;
    expect((await fund(app, MIA, "5.5.5.5")).status).toBe(502);
    chain.down = false;
    expect((await fund(app, MIA, "5.5.5.5")).status).toBe(200);
  });
  it("answers browser pre-flight checks (CORS)", async () => {
    const res = await makeApp().request("/fund", { method: "OPTIONS", headers: { origin: "https://x.example", "access-control-request-method": "POST" } });
    expect(res.status).toBeLessThan(300);
  });
});
