/**
 * End-to-end on testnet: the whole life of a letter, with the real helper (relay + Postman) and no QoreX.
 *
 *   1. register the Postman's opening key on-chain (derived from HELPER_MNEMONIC)
 *   2. two fresh heir accounts, funded with 2 QOR each by the helper; each registers an ML-DSA-87 key and
 *      an ML-KEM opening key through the SDK (the registry path without QoreX)
 *   3. Alex seals a letter for them (guardian Priya, quiet 120 s, warning 60 s) through POST /relay
 *   4. one check-in, then silence
 *   5. meanwhile, on a second letter: two guardian pauses succeed, the third is refused, then it is cancelled
 *   6. the Postman notices the release and publishes Part B; both heirs open the letter
 *
 *   cd contracts && forge build
 *   cd helper    && npm run e2e        (HELPER_MNEMONIC in the environment; REGISTRY_ADDRESS optional)
 *
 * Prints addresses, balances, tx hashes and timings only. Never a mnemonic, seed or key.
 */
import { serve } from "@hono/node-server";
import { qorechainTestnet } from "@qorechain/evm";
import { buildRegisterKemKeyMessage } from "@qorechain/qoreseal";
import { deriveUnifiedAccount, ensurePqcRegistered, generateMnemonic } from "@qorechain/sdk";
import { createPublicClient, defineChain, http, toHex, type Hex } from "viem";
import {
  EMPTY_PAYLOAD_HASH,
  EVM_CHAIN_ID,
  actionMessage,
  createPayloadHash,
  decryptLetter,
  encryptLetter,
  joinKey,
  keyHash,
  makeContentKey,
  newSeed,
  openPart,
  sealKeysFromCardSeed,
  sealPartA,
  sealPartB,
  signAction,
  signingKeysFromSeed,
  splitKey,
} from "../../shared/tabella-crypto.ts";
import { STATUS, postmanAbi, registryAbi } from "../src/abi.js";
import { NATIVE_FEE, RevertError, createNativeLane, createRealChain } from "../src/chain.js";
import { loadConfig } from "../src/config.js";
import { createPostman } from "../src/postman.js";
import { derivePostmanKeys, ensurePostmanKemKey } from "../src/postmanKeys.js";
import { createApp } from "../src/relay.js";
import { Mutex } from "../src/window.js";

// The registry deployed by scripts/deploy-and-relay.ts (its postman() is the helper itself).
const DEFAULT_REGISTRY = "0xC0808aF18e2283dFE4d026315a462349561fFd1c";
const LETTER_TEXT = "Dear Ada and Sam,\nThe spare key is under the blue pot. I love you. - Alex (demo letter, fake data)";
const QUIET = 120;
const WARNING = 60;
const STATUS_NAME = ["Active", "Warning", "Released", "Cancelled"];

const mnemonic = process.env.HELPER_MNEMONIC?.trim();
if (!mnemonic) {
  console.error("HELPER_MNEMONIC is not set (testnet-only account).");
  process.exit(1);
}

const t0 = Date.now();
const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s`;
const say = (s: string) => console.log(`${stamp()}  ${s}`);
const step = (s: string) => console.log(`\n== ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hashes: [string, string][] = [];
const record = (what: string, hash: string) => {
  hashes.push([what, hash]);
  say(`${what}: ${hash}`);
};

const registry = (process.env.REGISTRY_ADDRESS?.trim() || DEFAULT_REGISTRY) as Hex;
const cfg = loadConfig({ ...process.env, REGISTRY_ADDRESS: registry, TRUSTED_PROXY_HOPS: "0", POSTMAN_INTERVAL_SECONDS: "20" });
const chain = await createRealChain({ mnemonic, restUrl: cfg.restUrl, evmRpcUrl: cfg.evmRpcUrl, abi: registryAbi });
const evm = createPublicClient({
  chain: defineChain({ ...qorechainTestnet, rpcUrls: { default: { http: [cfg.evmRpcUrl] } } }),
  transport: http(cfg.evmRpcUrl),
});

// ------------------------------------------------------------------ reads
type Letter = {
  ownerKeyHash: Hex;
  guardianKeyHash: Hex;
  heirs: readonly Hex[];
  lastCheckIn: bigint;
  nonce: bigint;
  pausesUsed: number;
  released: boolean;
  letterCiphertext: Hex;
  partAEnvelope: Hex;
  partBForHeirs: Hex;
};
const readLetter = (id: bigint) => evm.readContract({ address: registry, abi: postmanAbi, functionName: "getLetter", args: [id] }) as unknown as Promise<Letter>;
const readStatus = async (id: bigint) => Number(await evm.readContract({ address: registry, abi: postmanAbi, functionName: "status", args: [id] }));
const readCount = () => evm.readContract({ address: registry, abi: postmanAbi, functionName: "letterCount" }) as Promise<bigint>;
const fromHex = (h: Hex) => Uint8Array.from(Buffer.from(h.slice(2), "hex"));
const hex = (b: Uint8Array) => toHex(b);

// ------------------------------------------------------------------ 0. helper
step("helper");
say(`helper:   ${chain.qorAddress}  ${chain.evmAddress}`);
say(`registry: ${registry}`);
const startBalance = await chain.balanceUqor();
say(`balance:  ${startBalance} uqor (${Number(startBalance) / 1e6} QOR)`);
const onChainPostman = await evm.readContract({ address: registry, abi: [{ type: "function", name: "postman", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "postman" });
if ((onChainPostman as string).toLowerCase() !== chain.evmAddress.toLowerCase()) {
  throw new Error(`the registry's postman() is ${onChainPostman}, not the helper. Deploy with scripts/deploy-and-relay.ts or call setPostman.`);
}
const pqcTx = await chain.ensurePqcKey();
if (pqcTx) record("helper ML-DSA-87 key", pqcTx);

// ---------------------------------------------------- 1. Postman opening key
step("1. the Postman's opening key (derived from HELPER_MNEMONIC, no new secret)");
const postmanKeys = derivePostmanKeys(mnemonic);
const postmanKemTx = await ensurePostmanKemKey(chain, postmanKeys);
if (postmanKemTx) record("Postman ML-KEM key registered", postmanKemTx);
else say("Postman ML-KEM key: already registered on-chain");
const onChainKey = await chain.kemKey(chain.qorAddress);
say(`on-chain key matches the derived one: ${!!onChainKey && Buffer.from(onChainKey).equals(Buffer.from(postmanKeys.mlkemPublicKey))}`);

// ------------------------------------------------------------ 2. test heirs
step("2. two fresh heir accounts (Ada, Sam), funded by the helper, keys registered through the SDK");
const FUND_UQOR = "2000000"; // 2 QOR each
const heirs = [] as { name: string; acc: Awaited<ReturnType<typeof deriveUnifiedAccount>>; keys: ReturnType<typeof sealKeysFromCardSeed> }[];
for (const name of ["Ada", "Sam"]) {
  const acc = await deriveUnifiedAccount(generateMnemonic(), 0); // throw-away mnemonic, never printed or saved
  heirs.push({ name, acc, keys: sealKeysFromCardSeed(newSeed()) });
  say(`${name}: ${acc.cosmos}  ${acc.evm}`);
}
for (const h of heirs) {
  const tx = await chain.broadcastNative([
    { typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: { fromAddress: chain.qorAddress, toAddress: h.acc.cosmos, amount: [{ denom: "uqor", amount: FUND_UQOR }] } } as never,
  ]);
  record(`fund ${h.name} with 2 QOR`, tx);
}
for (const h of heirs) {
  const lane = createNativeLane(h.acc, cfg.restUrl);
  const reg = await ensurePqcRegistered(lane.tx, { pqcKeypair: h.acc.pqc, rest: cfg.restUrl, fee: NATIVE_FEE });
  if (reg.txHash) record(`${h.name} ML-DSA-87 key registered`, reg.txHash);
  // the registry path without QoreX: build the message with QoreSeal, sign it with the heir's account
  const kemTx = await lane.broadcast([buildRegisterKemKeyMessage({ sender: h.acc.cosmos, mlkemPublicKey: h.keys.mlkemPublicKey })]);
  record(`${h.name} ML-KEM opening key registered`, kemTx);
  const k = await chain.kemKey(h.acc.cosmos);
  say(`${h.name}'s opening key is in the registry: ${!!k && Buffer.from(k).equals(Buffer.from(h.keys.mlkemPublicKey))}`);
  if (!k) throw new Error(`${h.name}'s key did not show up in the registry`);
}

// ---------------------------------------------------- start the helper itself
step("start the helper: real HTTP server + the Postman (20 s loop)");
const mutex = new Mutex();
const publishLog: { id: bigint; tx: string; wallMs: number }[] = [];
const postman = createPostman({
  chain,
  cfg,
  keys: postmanKeys,
  mutex,
  log: (l) => {
    say(`[postman] ${l}`);
    const m = /published Part B for letter #(\d+) tx=(0x[0-9a-f]{64})/.exec(l);
    if (m) publishLog.push({ id: BigInt(m[1]!), tx: m[2]!, wallMs: Date.now() });
  },
});
const app = createApp({ chain, cfg, mutex, postmanInfo: postman.info, log: (l) => say(`[relay] ${l}`) });
const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
await new Promise<void>((r) => server.once("listening", () => r()));
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
postman.start();
say(`listening on ${base}`);

const relay = async (body: unknown) => {
  const res = await fetch(`${base}/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};

// What the app would do: Part B is sealed to the Postman's PUBLIC key, read from GET /health.
const health = (await (await fetch(`${base}/health`)).json()) as any;
const postmanPubkey = fromHex(health.postman.mlkemPublicKey);
say(`/health shows the Postman's public key (${postmanPubkey.length} bytes): ${Buffer.from(postmanPubkey).equals(Buffer.from(postmanKeys.mlkemPublicKey))}`);

// ------------------------------------------------------------ letter factory
const ownerSeed = newSeed(); // Alex: I'm-still-here card
const guardianSeed = newSeed(); // Priya: guardian card
const owner = signingKeysFromSeed(ownerSeed);
const guardian = signingKeysFromSeed(guardianSeed);

async function createLetter(label: string) {
  const heirKeys = [] as Uint8Array[];
  for (const h of heirs) heirKeys.push((await chain.kemKey(h.acc.cosmos))!); // from the registry, like the app
  const K = makeContentKey();
  const letterCiphertext = await encryptLetter(K, `${LETTER_TEXT} [${label}]`);
  const { A, B } = splitKey(K);
  const partAEnvelope = sealPartA(A, heirKeys);
  const partBForPostman = sealPartB(B, postmanPubkey);
  const id = (await readCount()) + 1n;
  const payload = {
    heirs: heirs.map((h) => h.acc.evm as Hex),
    guardianKeyHash: keyHash(guardian.publicKey),
    quietPeriod: QUIET,
    warningPeriod: WARNING,
    letterCiphertext,
    partAEnvelope,
    partBForPostman,
  };
  const sig = signAction(ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId: id, action: "CREATE", nonce: 0, payloadHash: createPayloadHash(payload) }));
  const res = await relay({
    fn: "createLetter",
    args: {
      heirs: payload.heirs,
      guardianKeyHash: payload.guardianKeyHash,
      quietPeriod: QUIET,
      warningPeriod: WARNING,
      letterCiphertext: hex(letterCiphertext),
      partAEnvelope: hex(partAEnvelope),
      partBForPostman: hex(partBForPostman),
    },
    pubkey: hex(owner.publicKey),
    sig: hex(sig),
  });
  if (res.status !== 200) throw new Error(`createLetter (${label}) was not relayed: ${JSON.stringify(res.json)}`);
  record(`createLetter #${id} (${label})`, res.json.txHash);
  return { id, K, A, B, text: `${LETTER_TEXT} [${label}]`, gas: res.json.gasUsed as string };
}

/** A signed owner/guardian action through /relay. nonce = the letter's current nonce. */
async function act(fn: "checkIn" | "guardianPause" | "cancel", id: bigint, who: "owner" | "guardian") {
  const nonce = (await readLetter(id)).nonce;
  const action = fn === "checkIn" ? "CHECKIN" : fn === "guardianPause" ? "PAUSE" : "CANCEL";
  const seed = who === "owner" ? ownerSeed : guardianSeed;
  const pub = who === "owner" ? owner.publicKey : guardian.publicKey;
  const sig = signAction(seed, actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId: id, action, nonce, payloadHash: EMPTY_PAYLOAD_HASH }));
  return relay({ fn, args: { letterId: id.toString() }, pubkey: hex(pub), sig: hex(sig) });
}

// ---------------------------------------------- 3 + 4. the letter, check-in, silence
step("3. Alex seals the letter (through POST /relay)");
const A = await createLetter("main");
step("4. Alex checks in once, then goes silent");
await sleep(8000);
const checkedIn = await act("checkIn", A.id, "owner");
if (checkedIn.status !== 200) throw new Error(`checkIn failed: ${JSON.stringify(checkedIn.json)}`);
record(`checkIn #${A.id}`, checkedIn.json.txHash);
const afterCheckIn = await readLetter(A.id);
const releaseAt = afterCheckIn.lastCheckIn + BigInt(QUIET + WARNING); // chain-clock seconds
say(`lastCheckIn (chain clock) = ${afterCheckIn.lastCheckIn}; the letter is Released at ${releaseAt} (3 minutes later)`);
say("Alex is silent from now on.");

// ------------------------------------------- 5. guardian pauses on another letter
step("5. guardian pause (max 2) on a second letter, then cancel it so the Postman ignores it");
const B2 = await createLetter("pause-test");
for (const n of [1, 2]) {
  const p = await act("guardianPause", B2.id, "guardian");
  say(`pause #${n} -> ${p.status} ${JSON.stringify(p.json)}`);
  if (p.status !== 200) throw new Error(`pause #${n} should have worked`);
  record(`guardianPause #${n} on letter #${B2.id}`, p.json.txHash);
}
const afterTwo = await readLetter(B2.id);
say(`pausesUsed on chain: ${afterTwo.pausesUsed}, status: ${STATUS_NAME[await readStatus(B2.id)]}`);
const balBeforeThird = await chain.balanceUqor();
const third = await act("guardianPause", B2.id, "guardian");
say(`pause #3 -> ${third.status} ${JSON.stringify(third.json)}`);
const balAfterThird = await chain.balanceUqor();
say(`third pause cost the helper nothing: ${balBeforeThird === balAfterThird}`);
const cancelled = await act("cancel", B2.id, "owner");
if (cancelled.status !== 200) throw new Error(`cancel failed: ${JSON.stringify(cancelled.json)}`);
record(`cancel letter #${B2.id}`, cancelled.json.txHash);
say(`letter #${B2.id} status: ${STATUS_NAME[await readStatus(B2.id)]}`);

// ------------------------------------------- 6. wait for the Postman
step("6. waiting for letter #" + A.id + " to be Released, and for the Postman to publish Part B");
let seenReleasedWall = 0;
const deadline = Date.now() + 8 * 60_000;
while (Date.now() < deadline) {
  const st = await readStatus(A.id);
  if (st === STATUS.Released && !seenReleasedWall) {
    seenReleasedWall = Date.now();
    say("status is now Released (first seen)");
  }
  if ((await readLetter(A.id)).released) break;
  await sleep(3000);
}
const finalLetter = await readLetter(A.id);
if (!finalLetter.released) throw new Error("the Postman did not publish Part B in time");
const pub = publishLog.find((p) => p.id === A.id);
if (!pub) throw new Error("Part B is on-chain but this Postman's log did not record the publication");
record(`publishPartB #${A.id} (by the Postman)`, pub.tx);

const receipt = await evm.getTransactionReceipt({ hash: pub.tx as Hex });
const block = await evm.getBlock({ blockNumber: receipt.blockNumber });
const latencyChain = Number(block.timestamp) - Number(releaseAt);
say(`released at (chain clock) ${releaseAt}; Part B in block ${receipt.blockNumber} at ${block.timestamp}; gas used ${receipt.gasUsed}`);
say(`==> Released -> Part B published: ${latencyChain} s on the chain clock`);

// -------------------------------------------------- both heirs open the letter
step("7. both heirs open the letter");
const partA = fromHex(finalLetter.partAEnvelope);
const partBForHeirs = fromHex(finalLetter.partBForHeirs);
const ct = fromHex(finalLetter.letterCiphertext);
let heirsOk = true;
for (const h of heirs) {
  const text = await decryptLetter(joinKey(openPart(partA, h.keys), openPart(partBForHeirs, h.keys)), ct);
  const ok = text === A.text;
  heirsOk &&= ok;
  say(`${h.name} opens the letter: ${ok ? "yes" : "NO"}  "${text.split("\n")[0]}..."`);
}
let postmanCanRead = true;
try {
  openPart(partBForHeirs, postmanKeys);
} catch {
  postmanCanRead = false;
}
say(`the Postman can re-open what it published: ${postmanCanRead}  (expected false)`);

// ------------------------------------------------ never twice: wait 2 more ticks
step("8. never twice: two more Postman ticks, then a direct duplicate attempt");
const publishedBefore = publishLog.length;
await sleep(45_000);
say(`publications logged: ${publishLog.filter((p) => p.id === A.id).length} for letter #${A.id} (extra ones since: ${publishLog.length - publishedBefore})`);
let dupRefused = false;
try {
  const { encodeFunctionData } = await import("viem");
  await chain.simulate({ to: registry, data: encodeFunctionData({ abi: postmanAbi, functionName: "publishPartB", args: [A.id, "0x01"] }) });
} catch (e) {
  dupRefused = e instanceof RevertError && e.reason === "AlreadyPublished";
  say(`a second publishPartB is refused by the chain: ${e instanceof RevertError ? e.reason : String(e)}`);
}

postman.stop();
server.close();

// ------------------------------------------------------------------ summary
step("SUMMARY");
console.log(`network:           qorechain-diana (EVM chain id ${EVM_CHAIN_ID})`);
console.log(`TabellaRegistry:   ${registry}`);
console.log(`helper/Postman:    ${chain.evmAddress}  (${chain.qorAddress})`);
console.log(`Ada:               ${heirs[0]!.acc.evm}  (${heirs[0]!.acc.cosmos})`);
console.log(`Sam:               ${heirs[1]!.acc.evm}  (${heirs[1]!.acc.cosmos})`);
console.log(`main letter:       #${A.id} (createLetter gas ${A.gas}); pause-test letter: #${B2.id}`);
console.log("");
for (const [what, h] of hashes) console.log(`${what.padEnd(46)}${h}`);
console.log("");
console.log(`Released -> Part B published: ${latencyChain} s (chain clock). Postman checks every 20 s.`);
if (seenReleasedWall) console.log(`first seen Released -> publish logged (wall clock): ${((pub.wallMs - seenReleasedWall) / 1000).toFixed(1)} s (includes this script's 3 s polling)`);
console.log(`helper balance: ${startBalance} -> ${await chain.balanceUqor()} uqor (includes the 4 QOR sent to the heirs)`);

const pass =
  finalLetter.released &&
  heirsOk &&
  !postmanCanRead &&
  third.status === 422 &&
  third.json.reason === "PauseLimitReached" &&
  balBeforeThird === balAfterThird &&
  afterTwo.pausesUsed === 2 &&
  publishLog.filter((p) => p.id === A.id).length === 1 &&
  dupRefused;
console.log(pass ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(pass ? 0 : 2);
