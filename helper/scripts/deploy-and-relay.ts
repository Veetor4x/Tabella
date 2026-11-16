/**
 * Testnet check for build step 3: deploy TabellaRegistry, start the helper's HTTP server, and relay
 * a REAL createLetter and checkIn that were signed by shared/tabella-crypto.ts.
 *
 *   cd contracts && forge build          (the script reads the compiled contract)
 *   cd helper    && npm run deploy-and-relay      (HELPER_MNEMONIC in the environment)
 *
 * Prints addresses, balances and tx hashes only. Never the mnemonic or any key.
 */
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { qorechainTestnet } from "@qorechain/evm";
import {
  createPublicClient,
  defineChain,
  encodeDeployData,
  getAddress,
  http,
  toHex,
  type Abi,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
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
import { registryAbi } from "../src/abi.js";
import { createRealChain } from "../src/chain.js";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/relay.js";
import { ensureWindow } from "../src/window.js";

const EXPLORER = "https://explore.qore.network";
const LETTER = "Dear Ada and Sam,\nThe spare key is under the blue pot. I love you. - Alex (demo letter, fake data)";

const artifactUrl = new URL("../../contracts/out/TabellaRegistry.sol/TabellaRegistry.json", import.meta.url);
let artifact: { abi: Abi; bytecode: { object: Hex } };
try {
  artifact = JSON.parse(readFileSync(artifactUrl, "utf8"));
} catch {
  console.error("Compiled contract not found. Run:  cd contracts && forge build");
  process.exit(1);
}

const mnemonic = process.env.HELPER_MNEMONIC?.trim();
if (!mnemonic) {
  console.error("HELPER_MNEMONIC is not set (testnet-only account).");
  process.exit(1);
}

const step = (s: string) => console.log(`\n== ${s}`);
const hashes: Record<string, string> = {};

// A config with a placeholder registry, just to reuse the window sizing; the real one is set after deploying.
const bootCfg = loadConfig({ ...process.env, REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000001" });
const chain = await createRealChain({ mnemonic, restUrl: bootCfg.restUrl, evmRpcUrl: bootCfg.evmRpcUrl, abi: registryAbi });
const evm = createPublicClient({
  chain: defineChain({ ...qorechainTestnet, rpcUrls: { default: { http: [bootCfg.evmRpcUrl] } } }),
  transport: http(bootCfg.evmRpcUrl),
});

step("helper account");
console.log(`helper:  ${chain.qorAddress}  ${chain.evmAddress}`);
const startBalance = await chain.balanceUqor();
console.log(`balance: ${startBalance} uqor (${Number(startBalance) / 1e6} QOR)`);
const keyTx = await chain.ensurePqcKey();
console.log(`PQC key: ${keyTx ? `registered, tx ${keyTx}` : "already registered"}`);
if (keyTx) hashes["register ML-DSA-87 key"] = keyTx;

step("EVM window");
const w0 = await chain.windowStatus();
console.log(`before:  found=${w0.found} live=${w0.live} txs=${w0.remainingTxs} blocks=${w0.remainingBlocks} value=${w0.remainingValue} uqor`);
const windowTx = await ensureWindow(chain, bootCfg);
if (windowTx) hashes["open EVM window"] = windowTx;
const w1 = await chain.windowStatus();
console.log(`${windowTx ? "opened" : "reusing"}: live=${w1.live} txs=${w1.remainingTxs} blocks=${w1.remainingBlocks} value=${w1.remainingValue} uqor`);
console.log(`balance after window step: ${await chain.balanceUqor()} uqor`);

step("deploy TabellaRegistry");
const postman = (process.env.POSTMAN_ADDRESS?.trim() as Hex | undefined) ?? chain.evmAddress;
console.log(`postman (may call publishPartB): ${postman}${process.env.POSTMAN_ADDRESS ? "" : "  (the helper itself; change later with setPostman)"}`);
const deployData = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [postman] });
const deployGas = await chain.simulate({ data: deployData });
const gasPrice = await chain.gasPrice();
const maxFee = gasPrice * 2n > bootCfg.maxFeePerGasCap ? bootCfg.maxFeePerGasCap : gasPrice * 2n;
const dep = await chain.send({ data: deployData, gas: (deployGas * 125n) / 100n, maxFeePerGas: maxFee });
if (dep.status !== "success" || !dep.contractAddress) throw new Error("deployment failed");
const registry = getAddress(dep.contractAddress);
hashes["deploy TabellaRegistry"] = dep.txHash;
console.log(`contract: ${registry}`);
console.log(`tx:       ${dep.txHash}  (gas used ${dep.gasUsed})`);
console.log(`on-chain postman() = ${await evm.readContract({ address: registry, abi: artifact.abi, functionName: "postman" })}`);

step("start the helper (real HTTP server on localhost)");
const cfg = loadConfig({ ...process.env, REGISTRY_ADDRESS: registry, TRUSTED_PROXY_HOPS: "0" });
const app = createApp({ chain, cfg, log: (l) => console.log(`  [helper] ${l}`) });
const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
await new Promise<void>((r) => server.once("listening", () => r()));
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
console.log(`listening: ${base}`);

const relay = async (body: unknown) => {
  const res = await fetch(`${base}/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};
const hex = (b: Uint8Array) => toHex(b);

step("Alex seals a letter with the shared lib");
const ownerSeed = newSeed(); // I'm-still-here card
const guardianSeed = newSeed(); // guardian card
const ada = sealKeysFromCardSeed(newSeed());
const sam = sealKeysFromCardSeed(newSeed());
const postmanKeys = sealKeysFromCardSeed(newSeed());
const owner = signingKeysFromSeed(ownerSeed);
const guardian = signingKeysFromSeed(guardianSeed);

const K = makeContentKey();
const letterCiphertext = await encryptLetter(K, LETTER);
const { A, B } = splitKey(K);
const partAEnvelope = sealPartA(A, [ada.mlkemPublicKey, sam.mlkemPublicKey]);
const partBForPostman = sealPartB(B, postmanKeys.mlkemPublicKey);
const heirs = [privateKeyToAddress(generatePrivateKey()), privateKeyToAddress(generatePrivateKey())] as Hex[];
console.log(`ciphertext ${letterCiphertext.length} B, Part A envelope ${partAEnvelope.length} B, Part B envelope ${partBForPostman.length} B`);

const letterId = ((await evm.readContract({ address: registry, abi: artifact.abi, functionName: "letterCount" })) as bigint) + 1n;
const createPayload = {
  heirs,
  guardianKeyHash: keyHash(guardian.publicKey),
  quietPeriod: 120,
  warningPeriod: 60,
  letterCiphertext,
  partAEnvelope,
  partBForPostman,
};
const createSig = signAction(
  ownerSeed,
  actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId, action: "CREATE", nonce: 0, payloadHash: createPayloadHash(createPayload) }),
);

step(`POST /relay createLetter (letter #${letterId})`);
const created = await relay({
  fn: "createLetter",
  args: {
    heirs,
    guardianKeyHash: createPayload.guardianKeyHash,
    quietPeriod: 120,
    warningPeriod: 60,
    letterCiphertext: hex(letterCiphertext),
    partAEnvelope: hex(partAEnvelope),
    partBForPostman: hex(partBForPostman),
  },
  pubkey: hex(owner.publicKey),
  sig: hex(createSig),
});
console.log(created.status, JSON.stringify(created.json));
if (created.status !== 200) throw new Error("createLetter was not relayed");
hashes["createLetter (relayed)"] = created.json.txHash;
const createGas = created.json.gasUsed;

step("read the letter back from the chain");
type Letter = { ownerKeyHash: Hex; guardianKeyHash: Hex; heirs: Hex[]; nonce: bigint; lastCheckIn: bigint; pausesUsed: number; letterCiphertext: Hex; partAEnvelope: Hex };
const readLetter = () => evm.readContract({ address: registry, abi: artifact.abi, functionName: "getLetter", args: [letterId] }) as Promise<Letter>;
const readStatus = () => evm.readContract({ address: registry, abi: artifact.abi, functionName: "status", args: [letterId] }) as Promise<number>;
const STATUS = ["Active", "Warning", "Released", "Cancelled"];
let l = await readLetter();
console.log(`ownerKeyHash matches Alex's key: ${l.ownerKeyHash === keyHash(owner.publicKey)}`);
console.log(`guardianKeyHash matches Priya's key: ${l.guardianKeyHash === keyHash(guardian.publicKey)}`);
console.log(`heirs stored: ${l.heirs.length}   nonce: ${l.nonce}   status: ${STATUS[await readStatus()]}`);
// the bytes on chain are intact: Ada can open Part A from the chain, but Part A alone cannot read the letter
const aFromChain = openPart(Uint8Array.from(Buffer.from(l.partAEnvelope.slice(2), "hex")), ada);
console.log(`Ada opens Part A from the chain: ${Buffer.from(aFromChain).equals(Buffer.from(A))}`);
let aloneFails = false;
try {
  await decryptLetter(aFromChain, Uint8Array.from(Buffer.from(l.letterCiphertext.slice(2), "hex")));
} catch {
  aloneFails = true;
}
console.log(`Part A alone cannot read the letter: ${aloneFails}`);
console.log(`A + B together read it: ${(await decryptLetter(joinKey(aFromChain, B), Uint8Array.from(Buffer.from(l.letterCiphertext.slice(2), "hex")))) === LETTER}`);

step("POST /relay checkIn (Alex: I'm still here)");
await new Promise((r) => setTimeout(r, 6000)); // let the chain clock move so lastCheckIn visibly changes
const before = l.lastCheckIn;
const checkInSig = signAction(ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId, action: "CHECKIN", nonce: 1, payloadHash: EMPTY_PAYLOAD_HASH }));
const checkInReq = { fn: "checkIn", args: { letterId: letterId.toString() }, pubkey: hex(owner.publicKey), sig: hex(checkInSig) };
const checkedIn = await relay(checkInReq);
console.log(checkedIn.status, JSON.stringify(checkedIn.json));
if (checkedIn.status !== 200) throw new Error("checkIn was not relayed");
hashes["checkIn (relayed)"] = checkedIn.json.txHash;
l = await readLetter();
console.log(`nonce 1 -> ${l.nonce}; lastCheckIn ${before} -> ${l.lastCheckIn} (moved forward: ${l.lastCheckIn > before}); status: ${STATUS[await readStatus()]}`);

step("refusals cost nothing (simulate first)");
const balBefore = await chain.balanceUqor();
const replay = await relay(checkInReq); // same signature again
console.log("replayed checkIn  ->", replay.status, JSON.stringify(replay.json));
const wrongKeySig = signAction(guardianSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry, letterId, action: "CHECKIN", nonce: 2, payloadHash: EMPTY_PAYLOAD_HASH }));
const wrongKey = await relay({ fn: "checkIn", args: { letterId: letterId.toString() }, pubkey: hex(guardian.publicKey), sig: hex(wrongKeySig) });
console.log("guardian checkIn  ->", wrongKey.status, JSON.stringify(wrongKey.json));
const notAllowed = await relay({ fn: "publishPartB", args: { letterId: "1" }, pubkey: hex(owner.publicKey), sig: hex(checkInSig) });
console.log("publishPartB      ->", notAllowed.status, JSON.stringify(notAllowed.json));
const balAfter = await chain.balanceUqor();
console.log(`helper balance unchanged by the three refusals: ${balBefore === balAfter} (${balBefore} -> ${balAfter} uqor)`);

step("GET /health");
const health = await (await fetch(`${base}/health`)).json();
console.log(JSON.stringify(health, null, 2));

server.close();

step("SUMMARY");
console.log(`network:          qorechain-diana (EVM chain id ${EVM_CHAIN_ID})`);
console.log(`TabellaRegistry:  ${registry}`);
console.log(`explorer:         ${EXPLORER}/address/${registry}`);
console.log(`helper:           ${chain.evmAddress}  (${chain.qorAddress})`);
console.log(`letter id:        ${letterId}   createLetter gas used: ${createGas}   checkIn gas used: ${checkedIn.json.gasUsed}`);
for (const [what, h] of Object.entries(hashes)) console.log(`${what.padEnd(26)}${h}`);
console.log(`helper balance:   ${startBalance} -> ${await chain.balanceUqor()} uqor`);

const ok =
  created.status === 200 &&
  checkedIn.status === 200 &&
  replay.status === 422 &&
  wrongKey.status === 422 &&
  notAllowed.status === 403 &&
  balBefore === balAfter &&
  l.nonce === 2n;
console.log(ok ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(ok ? 0 : 2);
