/**
 * Risky-part test #1: can the helper account do the full PQC + EVM-window dance?
 *
 *   1. read HELPER_MNEMONIC from the environment (never printed)
 *   2. show the helper's qor1 and 0x addresses and balance
 *   3. register its ML-DSA-87 key (ensurePqcRegistered, idempotent)
 *   4. open an EVM window (hybrid-signed native message) and print its status
 *
 * Run (testnet only):  npm run 01      (from spike/, with HELPER_MNEMONIC set)
 */
import { ensurePqcRegistered, fetchEvmWindow } from "@qorechain/sdk";
import { FEE, balanceUqor, loadHelper, makeTxClient, net, openWindow, rest } from "./common.ts";

// Everything below prints addresses, balances and tx hashes only.
const acc = await loadHelper();
console.log(`network:   ${net.chainId}`);
console.log(`helper:    ${acc.cosmos}`);
console.log(`           ${acc.evm}`);

const balance = await balanceUqor(acc.cosmos);
console.log(`balance:   ${balance} uqor (${Number(balance) / 1e6} QOR)`);
if (balance === 0n) {
  console.error("Balance is 0. Fund the helper from the faucet (dashboard.qorechain.io), then run again.");
  process.exit(1);
}

const tx = makeTxClient(acc);
const txHashes: Record<string, string> = {};

// 3. Register the ML-DSA-87 key (does nothing if this exact key is already registered).
const reg = await ensurePqcRegistered(tx, { pqcKeypair: acc.pqc, rest, fee: FEE });
if (reg.alreadyRegistered) {
  console.log(`PQC key:   already registered (key matches: ${reg.keyVerified ?? "n/a"})`);
} else {
  console.log(`PQC key:   registered, tx ${reg.txHash}`);
  txHashes["register ML-DSA-87 key"] = reg.txHash ?? "";
}

// 4. Open an EVM window.
const windowTx = await openWindow(tx, acc);
console.log(`window:    opened, tx ${windowTx}`);
txHashes["open EVM window"] = windowTx;

const w = await fetchEvmWindow({ rest, address: acc.cosmos });
console.log("window status:");
console.log(`  found=${w.found} live=${w.live} nativeOnly=${w.nativeOnly}`);
console.log(`  blocks left=${w.remainingBlocks} (opened ${w.openedHeight}, expires ${w.expiryHeight})`);
console.log(`  txs left=${w.remainingTxs}/${w.maxTxs}  value left=${w.remainingValue} uqor`);

console.log("\ntransactions:");
for (const [what, hash] of Object.entries(txHashes)) console.log(`  ${what}: ${hash}`);
if (!Object.keys(txHashes).length) console.log("  (none sent)");
console.log(`explorer: https://explore.qore.network/address/${acc.cosmos}`);
process.exit(w.live ? 0 : 2);
