/**
 * End-to-end on testnet: owner reminders for test-mode letters (2 minutes of quiet, a 1-minute warning).
 *
 *   Letter 1 (left alone):  three reminders arrive (start of the warning, halfway, 90%), then the letter is Released and Part B is published.
 *   Letter 2 (checks in):   the owner taps "I'm still here" right after the FIRST reminder. The other two never go out.
 *
 * It uses the real chain, the real relay and the real Postman. The only stand-in is the mail provider: emails are CAPTURED (printed,
 * never sent), so nothing leaves this machine and no real inbox is involved. Both letters are test letters made for a throw-away owner.
 *
 *   cd helper && HELPER_MNEMONIC=... npx tsx scripts/e2e-reminders.ts        (about 5 minutes)
 *
 * Prints ids, tx hashes, timings and the email subjects and links. Never a mnemonic, seed or key.
 */
import { serve } from "@hono/node-server";
import { qorechainTestnet } from "@qorechain/evm";
import { createPublicClient, defineChain, http, toHex, type Hex } from "viem";
import { EMPTY_PAYLOAD_HASH, EVM_CHAIN_ID, actionMessage, createPayloadHash, encryptLetter, keyHash, makeContentKey, newSeed, sealPartA, signAction, signingKeysFromSeed, splitKey } from "../../shared/tabella-crypto.ts";
import { sealPostmanPackage, type OwnerReminders, type PostmanPackage } from "../../shared/surprise.ts";
import { STATUS, postmanAbi, registryAbi } from "../src/abi.js";
import { createRealChain } from "../src/chain.js";
import { loadConfig } from "../src/config.js";
import { createEscalation } from "../src/escalation.js";
import type { Notifier } from "../src/notify/types.js";
import { createMemoryStore } from "../src/notify/store.js";
import { createPostman } from "../src/postman.js";
import { derivePostmanKeys, ensurePostmanKemKey } from "../src/postmanKeys.js";
import { createReminders } from "../src/reminders.js";
import { createApp } from "../src/relay.js";
import { Mutex } from "../src/window.js";

const DEFAULT_REGISTRY = "0xbBC6d3eEE6f8472482d5a8860F4e2d65f4867aD0"; // the registry the app uses today
const QUIET = 120;
const WARNING = 60;
const OWNER_EMAIL = "owner-e2e@mail.demo-tabella.io"; // a throw-away address: the mail provider is a capture here
const STATUS_NAME = ["Active", "Warning", "Released", "Cancelled"];

const mnemonic = process.env.HELPER_MNEMONIC?.trim();
if (!mnemonic) {
  console.error("HELPER_MNEMONIC is not set (testnet-only account).");
  process.exit(1);
}
const t0 = Date.now();
const say = (s: string) => console.log(`+${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s  ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

const registry = (process.env.REGISTRY_ADDRESS?.trim() || DEFAULT_REGISTRY) as Hex;
const cfg = loadConfig({ ...process.env, REGISTRY_ADDRESS: registry, TRUSTED_PROXY_HOPS: "0", POSTMAN_INTERVAL_SECONDS: "10", REMINDER_INTERVAL_SECONDS: "3" });
const chain = await createRealChain({ mnemonic, restUrl: cfg.restUrl, evmRpcUrl: cfg.evmRpcUrl, abi: registryAbi });
const evm = createPublicClient({ chain: defineChain({ ...qorechainTestnet, rpcUrls: { default: { http: [cfg.evmRpcUrl] } } }), transport: http(cfg.evmRpcUrl) });
type Letter = { nonce: bigint; lastCheckIn: bigint; released: boolean; partBForHeirs: Hex };
const readLetter = (id: bigint) => evm.readContract({ address: registry, abi: postmanAbi, functionName: "getLetter", args: [id] }) as unknown as Promise<Letter>;
const readStatus = async (id: bigint) => Number(await evm.readContract({ address: registry, abi: postmanAbi, functionName: "status", args: [id] }));
const readCount = () => evm.readContract({ address: registry, abi: postmanAbi, functionName: "letterCount" }) as Promise<bigint>;

say(`registry ${registry}; helper ${chain.evmAddress}`);
const onChainPostman = await evm.readContract({ address: registry, abi: [{ type: "function", name: "postman", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "postman" });
if ((onChainPostman as string).toLowerCase() !== chain.evmAddress.toLowerCase()) throw new Error(`the registry's postman() is ${onChainPostman}, not this helper`);
await chain.ensurePqcKey();
const postmanKeys = derivePostmanKeys(mnemonic);
await ensurePostmanKemKey(chain, postmanKeys);

// ------------------------------------------------ a mail provider that only captures
const captured: { at: number; to: string; subject: string; text: string; letter: string }[] = [];
const notifier: Notifier = {
  channels: { email: true, sms: false, call: false },
  async email(to, subject, text) {
    const letter = /\/me\/(\d+)/.exec(text)?.[1] ?? "?";
    captured.push({ at: Date.now(), to, subject, text, letter });
    say(`EMAIL captured for letter #${letter}: subject "${subject}"`);
  },
  async sms() {},
  async call() {},
};
const store = createMemoryStore();
const mutex = new Mutex();
const escalation = createEscalation({ notifier, store, appUrl: cfg.appUrl });
const reminders = createReminders({ notifier, store, appUrl: cfg.appUrl, log: (l) => say(`[reminders] ${l}`) });
const publishedIds = new Set<string>();
const postman = createPostman({
  chain,
  cfg,
  keys: postmanKeys,
  mutex,
  escalation,
  reminders,
  log: (l) => {
    const m = /published Part B for letter #(\d+)/.exec(l);
    if (m) {
      publishedIds.add(m[1]!);
      say(`[postman] ${l.replace(/ tx=.*/, "")}`);
    }
  },
});
const app = createApp({ chain, cfg, mutex, postmanInfo: postman.info, log: () => {} });
const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
await new Promise<void>((r) => server.once("listening", () => r()));
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
const relay = async (body: unknown) => {
  const res = await fetch(`${base}/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};
postman.start();

// ------------------------------------------------ what the app does when it seals a test letter
async function sealTestLetter(label: string, reminder: OwnerReminders) {
  const ownerSeed = newSeed();
  const owner = signingKeysFromSeed(ownerSeed);
  const K = makeContentKey();
  const letterCiphertext = await encryptLetter(K, `test letter (${label}), fake data`);
  const { A, B } = splitKey(K);
  const partAEnvelope = sealPartA(A, [postmanKeys.mlkemPublicKey]);
  // an "invite them" style package: no recipient, so no ladder; only the owner's reminders
  const pkg: PostmanPackage = { v: 1, mode: "demo", reminders: reminder, owner: "", cardKeyHash: `0x${"00".repeat(32)}`, recipient: { name: "", email: "", phone: "" }, backups: [] };
  const partBForPostman = sealPostmanPackage(B, pkg, postmanKeys.mlkemPublicKey);
  const id = (await readCount()) + 1n;
  const payload = { heirs: [chain.evmAddress as Hex], guardianKeyHash: `0x${"00".repeat(32)}` as Hex, quietPeriod: QUIET, warningPeriod: WARNING, letterCiphertext, partAEnvelope, partBForPostman };
  const sig = signAction(ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId: id, action: "CREATE", nonce: 0, payloadHash: createPayloadHash(payload) }));
  const res = await relay({
    fn: "createLetter",
    args: { heirs: payload.heirs, guardianKeyHash: payload.guardianKeyHash, quietPeriod: QUIET, warningPeriod: WARNING, letterCiphertext: toHex(letterCiphertext), partAEnvelope: toHex(partAEnvelope), partBForPostman: toHex(partBForPostman) },
    pubkey: toHex(owner.publicKey),
    sig: toHex(sig),
  });
  if (res.status !== 200) throw new Error(`createLetter (${label}) was not relayed: ${JSON.stringify(res.json)}`);
  say(`letter #${id} sealed (${label}): tx ${res.json.txHash}`);
  return { id, ownerSeed, owner };
}
async function act(L: { id: bigint; ownerSeed: Uint8Array; owner: { publicKey: Uint8Array } }, fn: "checkIn" | "cancel") {
  const nonce = (await readLetter(L.id)).nonce;
  const sig = signAction(L.ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId: L.id, action: fn === "checkIn" ? "CHECKIN" : "CANCEL", nonce, payloadHash: EMPTY_PAYLOAD_HASH }));
  return relay({ fn, args: { letterId: L.id.toString() }, pubkey: toHex(L.owner.publicKey), sig: toHex(sig) });
}

// ------------------------------------------------ run
say("sealing two test letters (2 minutes quiet, 1 minute warning), each with owner reminders");
const L1 = await sealTestLetter("left alone", { email: OWNER_EMAIL, style: "simple" });
const L2 = await sealTestLetter("checks in", { email: OWNER_EMAIL, style: "personal", subject: "Water the plants", line: "A quick tap, then back to your day." });
const lastCheckIn1 = (await readLetter(L1.id)).lastCheckIn;
const warnStart1 = Number(lastCheckIn1) + QUIET; // chain-clock seconds
say(`letter #${L1.id}: warning starts at chain time ${warnStart1} (${Math.max(0, warnStart1 - Math.floor(Date.now() / 1000))} s from now)`);

// letter 2: tap "I'm still here" as soon as its first reminder arrives
let checkedInAt = 0;
const watcher = (async () => {
  while (!captured.some((c) => c.letter === L2.id.toString())) await sleep(1000);
  await sleep(1500);
  const r = await act(L2, "checkIn");
  checkedInAt = Date.now();
  say(`letter #${L2.id}: owner taps "I'm still here" after the first reminder -> ${r.status === 200 ? "ok" : JSON.stringify(r.json)}`);
})();

// wait for letter 1 to be released and published, then give letter 2's old schedule time to pass
const deadline = Date.now() + 8 * 60_000;
while (Date.now() < deadline && !(publishedIds.has(L1.id.toString()) || (await readLetter(L1.id)).released)) await sleep(3000);
await watcher;
say("letter 1 is out; waiting past letter 2's old schedule to prove its other reminders never come");
await sleep(45_000);

// ------------------------------------------------ checks
const mine = (id: bigint) => captured.filter((c) => c.letter === id.toString());
const s1 = await readStatus(L1.id);
const l1 = await readLetter(L1.id);
const e1 = mine(L1.id);
console.log("\n== letter 1 (left alone)");
for (const e of e1) console.log(`   ${((e.at / 1000 - warnStart1)).toFixed(0).padStart(3)} s into the warning: "${e.subject}"`);
check(e1.length === 3, `three reminder emails arrived (${e1.length})`);
check(e1.every((e) => e.subject === "A quick check-in from Tabella" && e.to === OWNER_EMAIL), "each one is the simple check-in, to the owner");
check(e1.every((e) => e.text === `It's been a while. Tap here to let us know you're still around: ${cfg.appUrl}/me/${L1.id}`), "the words and the link are exactly as agreed");
check(!e1.some((e) => /letter|recipient|sealed|secret/i.test(`${e.subject} ${e.text}`)), "no email mentions a letter, the recipient or what is inside");
const offs = e1.map((e) => e.at / 1000 - warnStart1);
check(offs.length === 3 && offs[0]! >= -2 && offs[0]! <= 12 && offs[1]! >= 28 && offs[1]! <= 40 && offs[2]! >= 52 && offs[2]! <= 60, "they came at the start, halfway and near the end of the warning");
check(s1 === STATUS.Released, `then the letter was released (status ${STATUS_NAME[s1]})`);
check(l1.released && l1.partBForHeirs.length > 4, "and Part B was published, so it can open");

const s2 = await readStatus(L2.id);
const e2 = mine(L2.id);
console.log("\n== letter 2 (owner taps I'm still here after the first reminder)");
for (const e of e2) console.log(`   subject "${e.subject}"`);
check(e2.length === 1, `only the first reminder was sent (${e2.length})`);
check(e2[0]?.subject === "Water the plants" && e2[0]?.text === `A quick tap, then back to your day.\n\n${cfg.appUrl}/me/${L2.id}`, "it used the owner's own subject and line, with the link added at the end");
check(checkedInAt > 0 && s2 !== STATUS.Released, `the check-in reset the timer (status ${STATUS_NAME[s2]})`);

// clean up: cancel letter 2 so it never warns again, then stop
const cancelled = await act(L2, "cancel");
say(`letter #${L2.id} cancelled (cleanup): ${cancelled.status === 200 ? "ok" : JSON.stringify(cancelled.json)}`);
postman.stop();
server.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
