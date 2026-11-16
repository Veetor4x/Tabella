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
import { createHash } from "node:crypto";
import {
  EthNativeSigner,
  TxClient,
  deriveUnifiedAccount,
  ensurePqcRegistered,
  fetchEvmWindow,
  getNetwork,
  openEvmWindowMsg,
  resolveSignBytesVersion,
} from "@qorechain/sdk";
import { evmWindowCost } from "@qorechain/evm";

const net = getNetwork("testnet");
const rest = (process.env.QORE_REST_URL?.trim() || net.endpoints.rest).replace(/\/+$/, "");

const mnemonic = process.env.HELPER_MNEMONIC?.trim();
if (!mnemonic) {
  console.error("HELPER_MNEMONIC is not set. Put it in your environment / .env (testnet-only account).");
  process.exit(1);
}

// Everything below prints addresses, balances and tx hashes only.
const acc = await deriveUnifiedAccount(mnemonic, 0);
console.log(`network:   ${net.chainId}`);
console.log(`helper:    ${acc.cosmos}`);
console.log(`           ${acc.evm}`);

async function balanceUqor(): Promise<bigint> {
  const res = await fetch(`${rest}/cosmos/bank/v1beta1/balances/${acc.cosmos}/by_denom?denom=uqor`);
  if (res.status === 404) return 0n;
  if (!res.ok) throw new Error(`balance query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { balance?: { amount?: string } };
  return BigInt(body.balance?.amount ?? "0");
}

const balance = await balanceUqor();
console.log(`balance:   ${balance} uqor (${Number(balance) / 1e6} QOR)`);
if (balance === 0n) {
  console.error("Balance is 0. Fund the helper from the faucet (dashboard.qorechain.io), then run again.");
  process.exit(1);
}

// The SDK's preset consensus-RPC host (rpc-testnet.qore.host) does not resolve, so we
// broadcast over REST instead: sign offline, POST the bytes, poll for the result.
// This is a minimal stand-in for the part of cosmjs's SigningStargateClient that TxClient uses.
async function accountSequence(): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${acc.cosmos}`);
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { account?: Record<string, any> };
  const a = body.account?.base_account ?? body.account ?? {};
  return { accountNumber: BigInt(a.account_number ?? "0"), sequence: BigInt(a.sequence ?? "0") };
}

const restSigningClient = {
  async simulate(): Promise<number> {
    throw new Error("simulate is not available over REST here; pass an explicit fee");
  },
  async signAndBroadcast(_addr: string, messages: any[], fee: any, memo?: string) {
    // Only the bare key registration may be signed classically; everything else is hybrid.
    const isRegistration = messages.length === 1 && /MsgRegisterPQCKey/.test(messages[0].typeUrl);
    const signer = new EthNativeSigner(acc, { signMode: isRegistration ? "classical" : "hybrid", rest });
    const { accountNumber, sequence } = await accountSequence();
    // qorechain-diana switches hybrid sign-bytes from v1 to v2 at its own height; ask the network.
    const signBytesVersion = isRegistration ? undefined : await resolveSignBytesVersion({ chainId: net.chainId, rest });
    const signed = signer.sign({ chainId: net.chainId, accountNumber, sequence, fee, memo, messages, signBytesVersion });
    const hash = createHash("sha256").update(signed.txRawBytes).digest("hex").toUpperCase();
    const post = await fetch(`${rest}/cosmos/tx/v1beta1/txs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx_bytes: Buffer.from(signed.txRawBytes).toString("base64"), mode: "BROADCAST_MODE_SYNC" }),
    });
    const sync = (await post.json()) as { tx_response?: { code?: number; raw_log?: string } };
    if (!post.ok || (sync.tx_response?.code ?? 0) !== 0) {
      throw new Error(`broadcast rejected (HTTP ${post.status}, code ${sync.tx_response?.code}): ${sync.tx_response?.raw_log}`);
    }
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${hash}`);
      if (!r.ok) continue;
      const t = ((await r.json()) as any).tx_response;
      return {
        code: Number(t.code ?? 0),
        transactionHash: hash,
        height: Number(t.height),
        gasUsed: BigInt(t.gas_used ?? 0),
        gasWanted: BigInt(t.gas_wanted ?? 0),
        rawLog: t.raw_log,
        events: [],
        msgResponses: [],
        txIndex: 0,
      };
    }
    throw new Error(`tx ${hash} was accepted but not seen in a block after 60 s`);
  },
  async signAndBroadcastSync(): Promise<string> {
    throw new Error("not used");
  },
};
const tx = new TxClient({ signingClient: restSigningClient as any, senderAddress: acc.cosmos });
// Native-lane fee: hybrid txs are large, so the gas limit is generous (same as the template's window.ts).
const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

const txHashes: Record<string, string> = {};
{
  // 3. Register the ML-DSA-87 key (does nothing if this exact key is already registered).
  const reg = await ensurePqcRegistered(tx, { pqcKeypair: acc.pqc, rest, fee: FEE });
  if (reg.alreadyRegistered) {
    console.log(`PQC key:   already registered (key matches: ${reg.keyVerified ?? "n/a"})`);
  } else {
    console.log(`PQC key:   registered, tx ${reg.txHash}`);
    txHashes["register ML-DSA-87 key"] = reg.txHash ?? "";
  }

  // 4. Open an EVM window: 600 blocks, 5 txs, sized for 3M gas at a 250 gwei fee cap.
  const maxTxs = 5n;
  const maxValue = evmWindowCost({ gas: 3_000_000n, maxFeePerGas: 250_000_000_000n }) * maxTxs;
  const msg = openEvmWindowMsg({ sender: acc.cosmos, blocks: 600n, maxTxs, maxValue });
  const res = await tx.signAndBroadcast([msg], FEE);
  console.log(`window:    opened, tx ${res.transactionHash} (height ${res.height ?? "?"}, code ${res.code})`);
  txHashes["open EVM window"] = res.transactionHash;
}

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
