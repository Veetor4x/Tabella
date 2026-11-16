/**
 * Risky-part test #2: does an ML-DSA-87 signature made with @qorechain/pqc (same lib as the
 * browser) verify inside a Solidity contract via the pqcVerify precompile (0x0A01)?
 *
 *   1. make an ML-DSA-87 keypair + sign a message
 *   2. deploy contracts/src/spike/PqcProbe.sol from the helper (open a new EVM window if needed)
 *   3. check(valid sig) -> expect true,  check(tampered sig) -> expect false
 *   4. act(valid sig) -> expect success, report gas used
 *   5. keyStatus(helper 0x address)
 *
 * Needs the contract built first:  cd ../contracts && npx forge build --skip test --skip script
 * Run (testnet only):              npm run 02      (HELPER_MNEMONIC in the environment)
 */
import { readFileSync } from "node:fs";
import { mldsa87 } from "@qorechain/pqc";
import { qorechainTestnet } from "@qorechain/evm";
import { createPublicClient, createWalletClient, defineChain, http, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ensureWindow, evmRpc, loadHelper, makeTxClient, net } from "./common.ts";

const acc = await loadHelper();
console.log(`helper:    ${acc.cosmos}  ${acc.evm}`);

// --- 1. keypair + signature (browser-style: noble-based @qorechain/pqc, no chain involved) ---
const kp = mldsa87.keygen();
const message = new TextEncoder().encode("TABELLA_V1 spike: I'm still here");
const sig = mldsa87.sign(kp.secretKey, message);
const tampered = Uint8Array.from(sig);
tampered[100] ^= 0x01;
console.log(`ML-DSA-87: pubkey ${kp.publicKey.length} B, signature ${sig.length} B`);
console.log(`local verify: valid=${mldsa87.verify(kp.publicKey, message, sig)} tampered=${mldsa87.verify(kp.publicKey, message, tampered)}`);

const pubkeyHex = toHex(kp.publicKey);
const sigHex = toHex(sig);
const badSigHex = toHex(tampered);
const msgHex = toHex(message);

// --- 2. clients + window + deploy ---
const chain = defineChain({ ...qorechainTestnet, rpcUrls: { default: { http: [evmRpc] } } });
const publicClient = createPublicClient({ chain, transport: http(evmRpc) });
const account = privateKeyToAccount(acc.privateKey as Hex);
const wallet = createWalletClient({ account, chain, transport: http(evmRpc) });

const artifact = JSON.parse(readFileSync(new URL("../contracts/out/PqcProbe.sol/PqcProbe.json", import.meta.url), "utf8"));
const abi = artifact.abi;
const bytecode = artifact.bytecode.object as Hex;

const txHashes: Record<string, string> = {};
// deploy + act = 2 EVM txs
const windowTx = await ensureWindow(makeTxClient(acc), acc, 2n);
if (windowTx) txHashes["open EVM window"] = windowTx;

// Keep every tx inside what the window was sized for: <= 3M gas at <= 250 gwei.
const MAX_GAS = 3_000_000n;
const MAX_FEE = 250_000_000_000n;
async function fees() {
  const base = await publicClient.getGasPrice();
  const maxFeePerGas = base * 2n > MAX_FEE ? MAX_FEE : base * 2n;
  return { maxFeePerGas, maxPriorityFeePerGas: 0n };
}
function pad(g: bigint) {
  const x = (g * 13n) / 10n;
  return x > MAX_GAS ? MAX_GAS : x;
}

const deployGas = pad(await publicClient.estimateGas({ account: account.address, data: bytecode }));
const deployHash = await wallet.deployContract({ chain, abi, bytecode, gas: deployGas, ...(await fees()) });
console.log(`deploy:    tx ${deployHash}`);
const deployRcpt = await publicClient.waitForTransactionReceipt({ hash: deployHash, timeout: 90_000 });
if (deployRcpt.status !== "success" || !deployRcpt.contractAddress) throw new Error(`deploy failed: ${deployRcpt.status}`);
const probe = deployRcpt.contractAddress;
txHashes["deploy PqcProbe"] = deployHash;
console.log(`contract:  ${probe}  (gas used ${deployRcpt.gasUsed})`);

// --- 3. check() ---
const call = (fn: string, args: unknown[]) => publicClient.readContract({ address: probe, abi, functionName: fn, args } as any);
const okValid = (await call("check", [pubkeyHex, sigHex, msgHex])) as boolean;
const okTampered = (await call("check", [pubkeyHex, badSigHex, msgHex])) as boolean;
console.log(`check(valid sig):     ${okValid}   (expect true)`);
console.log(`check(tampered sig):  ${okTampered}  (expect false)`);

// --- 4. act() ---
const actArgs = [pubkeyHex, sigHex, msgHex] as const;
const actGas = pad(await publicClient.estimateContractGas({ address: probe, abi, functionName: "act", args: actArgs, account: account.address }));
const actHash = await wallet.writeContract({ chain, address: probe, abi, functionName: "act", args: actArgs, gas: actGas, ...(await fees()) });
console.log(`act:       tx ${actHash}`);
const actRcpt = await publicClient.waitForTransactionReceipt({ hash: actHash, timeout: 90_000 });
txHashes["act(valid sig)"] = actHash;
console.log(`act:       ${actRcpt.status}, gas used ${actRcpt.gasUsed}, events ${actRcpt.logs.length}`);

// --- 5. keyStatus() ---
const [registered, algorithmId, statusKey] = (await call("keyStatus", [account.address])) as [boolean, number, Hex];
console.log(`keyStatus(${account.address}): registered=${registered} algorithmId=${algorithmId} pubkey=${(statusKey.length - 2) / 2} B`);
const sameKey = statusKey.toLowerCase() === toHex(acc.pqc.publicKey).toLowerCase();
console.log(`  matches helper's ML-DSA-87 key: ${sameKey}`);

console.log("\ntransactions:");
for (const [what, hash] of Object.entries(txHashes)) console.log(`  ${what}: ${hash}`);
console.log(`explorer: https://explore.qore.network/address/${probe}`);

const pass = okValid === true && okTampered === false && actRcpt.status === "success" && registered;
console.log(pass ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(pass ? 0 : 2);
