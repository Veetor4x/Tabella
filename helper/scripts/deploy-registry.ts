/**
 * Deploy a fresh TabellaRegistry to testnet and print its address (public). Nothing else.
 *
 *   cd contracts && forge build
 *   cd helper    && HELPER_MNEMONIC=... npx tsx scripts/deploy-registry.ts      (the mnemonic comes from the environment; it is never printed)
 *
 * The helper's own address becomes the Postman (the only address that may publish Part B).
 */
import { readFileSync } from "node:fs";
import { qorechainTestnet } from "@qorechain/evm";
import { createPublicClient, defineChain, encodeDeployData, getAddress, http, type Abi, type Hex } from "viem";
import { registryAbi } from "../src/abi.js";
import { createRealChain } from "../src/chain.js";
import { loadConfig } from "../src/config.js";
import { ensureWindow } from "../src/window.js";

const mnemonic = process.env.HELPER_MNEMONIC?.trim();
if (!mnemonic) {
  console.error("HELPER_MNEMONIC is not set (testnet-only account).");
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(new URL("../../contracts/out/TabellaRegistry.sol/TabellaRegistry.json", import.meta.url), "utf8")) as { abi: Abi; bytecode: { object: Hex } };

const cfg = loadConfig({ ...process.env, REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000001" });
const chain = await createRealChain({ mnemonic, restUrl: cfg.restUrl, evmRpcUrl: cfg.evmRpcUrl, abi: registryAbi });
const evm = createPublicClient({ chain: defineChain({ ...qorechainTestnet, rpcUrls: { default: { http: [cfg.evmRpcUrl] } } }), transport: http(cfg.evmRpcUrl) });

console.log(`helper: ${chain.qorAddress}  ${chain.evmAddress}`);
console.log(`balance: ${await chain.balanceUqor()} uqor`);
const keyTx = await chain.ensurePqcKey();
console.log(`PQC key: ${keyTx ? `registered ${keyTx}` : "already registered"}`);
const windowTx = await ensureWindow(chain, cfg);
console.log(`EVM window: ${windowTx ? `opened ${windowTx}` : "reusing the live one"}`);

const postman = chain.evmAddress;
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [postman] });
const gas = await chain.simulate({ data });
const price = await chain.gasPrice();
const maxFee = price * 2n > cfg.maxFeePerGasCap ? cfg.maxFeePerGasCap : price * 2n;
const dep = await chain.send({ data, gas: (gas * 125n) / 100n, maxFeePerGas: maxFee });
if (dep.status !== "success" || !dep.contractAddress) throw new Error("deployment failed");
const registry = getAddress(dep.contractAddress);
console.log(`REGISTRY: ${registry}`);
console.log(`tx:       ${dep.txHash}  (gas used ${dep.gasUsed})`);
console.log(`postman() = ${await evm.readContract({ address: registry, abi: artifact.abi, functionName: "postman" })}`);
console.log(`MAX_DATED_AHEAD = ${await evm.readContract({ address: registry, abi: artifact.abi, functionName: "MAX_DATED_AHEAD" })} s`);
