import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyHash, newSeed, signingKeysFromSeed } from "../../shared/tabella-crypto.ts";
import type { PostmanPackage } from "../../shared/surprise.ts";
import { createEscalation } from "../src/escalation.js";
import { BREVO_URL, ProviderError, createDryRunNotifier, createNotifier, plainAddress } from "../src/notify/providers.js";
import { createMemoryStore } from "../src/notify/store.js";
import type { Notifier } from "../src/notify/types.js";

const ENV = { BREVO_API_KEY: "brevo-key-123", EMAIL_FROM: "owner.sender@gmail.com" };
const real = globalThis.fetch;
let calls: { url: string; init: RequestInit }[];
const answer = (status: number, body: unknown) => (globalThis.fetch = (async (url: string, init: RequestInit) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch);
beforeEach(() => (calls = []));
afterEach(() => (globalThis.fetch = real));

describe("Brevo, the email provider that needs no domain", () => {
  it("is used when BREVO_API_KEY is set, and Resend otherwise", () => {
    expect(createNotifier(ENV).emailProvider).toBe("brevo");
    expect(createNotifier(ENV).channels.email).toBe(true);
    expect(createNotifier({ RESEND_API_KEY: "k", RESEND_FROM: "T <a@b.co>" }).emailProvider).toBe("resend");
    expect(createNotifier({ ...ENV, RESEND_API_KEY: "k", RESEND_FROM: "T <a@b.co>" }).emailProvider).toBe("brevo"); // Brevo wins when both are set
  });
  it("is off until the sender address is set too", () => {
    expect(createNotifier({ BREVO_API_KEY: "k" }).channels.email).toBe(false);
    expect(createNotifier({ BREVO_API_KEY: "k", EMAIL_FROM: "  " }).channels.email).toBe(false);
  });
  it("takes the plain address out of 'Name <address>'", () => {
    expect(plainAddress("Tabella <me@gmail.com>")).toBe("me@gmail.com");
    expect(plainAddress(" me@gmail.com ")).toBe("me@gmail.com");
    expect(createNotifier({ BREVO_API_KEY: "k", EMAIL_FROM: "Someone <me@gmail.com>" }).channels.email).toBe(true);
  });
  it("sends through Brevo's transactional email API, as 'Tabella', with the key in the api-key header", async () => {
    answer(201, { messageId: "<abc@smtp-relay.mailin.fr>" });
    await createNotifier(ENV).email("mia.recipient@mail.test-domain.io", "Alex left you a letter", "Open it here:\nhttps://app.example/open?letter=7", "tabella-7-r-email");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(BREVO_URL);
    expect(BREVO_URL).toBe("https://api.brevo.com/v3/smtp/email");
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h["api-key"]).toBe("brevo-key-123");
    expect(h.authorization).toBeUndefined();
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.sender).toEqual({ name: "Tabella", email: "owner.sender@gmail.com" });
    expect(body.to).toEqual([{ email: "mia.recipient@mail.test-domain.io" }]);
    expect(body.subject).toBe("Alex left you a letter");
    expect(body.textContent).toContain("https://app.example/open?letter=7");
    expect(body.htmlContent).toContain("<a href=");
  });
  it("counts only an ACCEPTED message as sent: a refusal throws, whatever the reason", async () => {
    const n = createNotifier(ENV);
    for (const [status, body, expected] of [
      [401, { code: "unauthorized", message: "Key not found" }, /HTTP 401 \(unauthorized: Key not found\)/],
      [400, { code: "invalid_parameter", message: "Sender is not valid" }, /HTTP 400/],
      [403, { code: "permission_denied", message: "Account not activated" }, /HTTP 403/],
      [429, { code: "too_many_requests", message: "slow down" }, /HTTP 429/],
      [503, { message: "down" }, /HTTP 503/],
    ] as const) {
      answer(status, body);
      await expect(n.email("x.y@mail.test-domain.io", "s", "t", "k")).rejects.toThrow(expected);
    }
  });
  it("never puts the recipient's address in what it reports", async () => {
    answer(400, { code: "invalid_parameter", message: "Invalid recipient mia.recipient@mail.test-domain.io" });
    await expect(createNotifier(ENV).email("mia.recipient@mail.test-domain.io", "s", "t", "k")).rejects.toThrow(/<email>/);
    await createNotifier(ENV).email("mia.recipient@mail.test-domain.io", "s", "t", "k").catch((e) => expect(String(e.message)).not.toContain("mia.recipient"));
  });
});

// ------------------------------------------------ what the owner's page may say

describe("the real state of the recipient's email", () => {
  const pkg: PostmanPackage = { v: 1, mode: "demo", owner: "Alex", cardKeyHash: keyHash(signingKeysFromSeed(newSeed()).publicKey), recipient: { name: "Mia", email: "mia.recipient@mail.test-domain.io", phone: "" }, backups: [] };
  const EMAIL_ONLY = { email: true, sms: false, call: false };
  let now: number;
  beforeEach(() => (now = 10_000_000));
  const make = (notifier: Notifier) => {
    const store = createMemoryStore();
    return { esc: createEscalation({ notifier, store, appUrl: "https://app.example", now: () => now, log: () => {} }), store };
  };

  it("'sending' before anything has been tried, then 'sent' once the provider accepted it", async () => {
    const n = createDryRunNotifier(EMAIL_ONLY);
    const { esc } = make(n);
    expect(await esc.deliveryState("5", pkg)).toBe("sending");
    await esc.run("5", pkg);
    expect(await esc.deliveryState("5", pkg)).toBe("sent");
  });
  it("'failed' while the provider refuses it, and 'sent' as soon as a retry is accepted", async () => {
    let refuse = true;
    const flaky: Notifier = { channels: EMAIL_ONLY, async email() { if (refuse) throw new ProviderError(403, "validation_error"); }, async sms() {}, async call() {} };
    const { esc } = make(flaky);
    await esc.run("5", pkg);
    expect(await esc.deliveryState("5", pkg)).toBe("failed");
    refuse = false;
    now += 10 * 60_000 + 1; // after the ten-minute wait the same step is tried again
    await esc.run("5", pkg);
    expect(await esc.deliveryState("5", pkg)).toBe("sent");
  });
  it("'opened' only once the recipient's card says so, and 'none' with no email to send to", async () => {
    const { esc } = make(createDryRunNotifier(EMAIL_ONLY));
    await esc.run("5", pkg);
    await esc.markOpened("5");
    expect(await esc.deliveryState("5", pkg)).toBe("opened");
    expect(await esc.deliveryState("6", { ...pkg, recipient: { name: "Mia", email: "", phone: "" } })).toBe("none");
    expect(await esc.deliveryState("7", { ...pkg, recipient: { name: "Mia", email: "mia@example.com", phone: "" } })).toBe("none"); // never a real inbox
  });
  it("a letter sent before this record existed (claimed long ago, never failed) counts as sent", async () => {
    const { esc, store } = make(createDryRunNotifier(EMAIL_ONLY));
    await store.claim("9", "r:email", now - 10 * 60_000);
    expect(await esc.deliveryState("9", pkg)).toBe("sent");
    await store.claim("10", "r:email", now - 1000);
    expect(await esc.deliveryState("10", pkg)).toBe("sending"); // moments ago: still in flight
  });
  it("a failed email is retried by the same ladder with no new code, once the provider works (letters 14, 16 and 20)", async () => {
    let refuse = true;
    const sent: string[] = [];
    const n: Notifier = { channels: EMAIL_ONLY, async email(to, s) { if (refuse) throw new ProviderError(403, "validation_error"); sent.push(s); }, async sms() {}, async call() {} };
    const { esc } = make(n);
    for (const id of ["14", "16", "20"]) await esc.run(id, pkg);
    expect(sent).toHaveLength(0);
    refuse = false; // Brevo is live
    now += 10 * 60_000 + 1;
    for (const id of ["14", "16", "20"]) await esc.run(id, pkg);
    expect(sent.filter((x) => x === "Alex left you a letter")).toHaveLength(3); // each letter's first email goes out (its reminder is due by then too)
    for (const id of ["14", "16", "20"]) expect(await esc.deliveryState(id, pkg)).toBe("sent");
  });
});
