/**
 * Shared helpers for the spike scripts: the helper account, a REST-only native tx client
 * (the SDK's preset consensus RPC host does not resolve), and "make sure a window is open".
 * Prints addresses / hashes only, never the mnemonic or private key.
 */
import { createHash } from "node:crypto";
import {
  EthNativeSigner,
  TxClient,
  deriveUnifiedAccount,
  fetchEvmWindow,
  getNetwork,
  openEvmWindowMsg,
  resolveSignBytesVersion,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { evmWindowCost } from "@qorechain/evm";

export const net = getNetwork("testnet");
export const rest = (process.env.QORE_REST_URL?.trim() || net.endpoints.rest).replace(/\/+$/, "");
export const evmRpc = (process.env.QORE_EVM_RPC_URL?.trim() || "https://evm-testnet.qore.host").replace(/\/+$/, "");

/** Native-lane fee: hybrid txs are large, so the gas limit is generous (same as the template's window.ts). */
export const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

export async function loadHelper(): Promise<UnifiedAccount> {
  const mnemonic = process.env.HELPER_MNEMONIC?.trim();
  if (!mnemonic) {
    console.error("HELPER_MNEMONIC is not set. Put it in your environment / .env (testnet-only account).");
    process.exit(1);
  }
  return deriveUnifiedAccount(mnemonic, 0);
}

export async function balanceUqor(address: string): Promise<bigint> {
  const res = await fetch(`${rest}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=uqor`);
  if (res.status === 404) return 0n;
  if (!res.ok) throw new Error(`balance query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { balance?: { amount?: string } };
  return BigInt(body.balance?.amount ?? "0");
}

/**
 * A TxClient that signs offline and broadcasts over REST: a minimal stand-in for the part of
 * cosmjs's SigningStargateClient that TxClient uses. Always pass an explicit fee (no simulate).
 */
export function makeTxClient(acc: UnifiedAccount): TxClient {
  async function accountSequence() {
    const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${acc.cosmos}`);
    if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
    const body = (await res.json()) as { account?: Record<string, any> };
    const a = body.account?.base_account ?? body.account ?? {};
    return { accountNumber: BigInt(a.account_number ?? "0"), sequence: BigInt(a.sequence ?? "0") };
  }

  const signingClient = {
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
  return new TxClient({ signingClient: signingClient as any, senderAddress: acc.cosmos });
}

/** Open an EVM window: 600 blocks, `maxTxs` txs, sized for 3M gas at a 250 gwei fee cap. Returns the tx hash. */
export async function openWindow(tx: TxClient, acc: UnifiedAccount, maxTxs = 5n): Promise<string> {
  const maxValue = evmWindowCost({ gas: 3_000_000n, maxFeePerGas: 250_000_000_000n }) * maxTxs;
  const msg = openEvmWindowMsg({ sender: acc.cosmos, blocks: 600n, maxTxs, maxValue });
  const res = await tx.signAndBroadcast([msg], FEE);
  return res.transactionHash;
}

/** Make sure the window can admit `txsNeeded` more EVM txs of up to 3M gas; open a new one if not. */
export async function ensureWindow(tx: TxClient, acc: UnifiedAccount, txsNeeded: bigint): Promise<string | undefined> {
  const w = await fetchEvmWindow({ rest, address: acc.cosmos });
  const perTx = evmWindowCost({ gas: 3_000_000n, maxFeePerGas: 250_000_000_000n });
  if (w.found && w.live && w.remainingTxs >= txsNeeded && w.remainingValue >= perTx * txsNeeded) {
    console.log(`window:    live (${w.remainingTxs} txs, ${w.remainingBlocks} blocks left), reusing`);
    return undefined;
  }
  const hash = await openWindow(tx, acc, 5n);
  console.log(`window:    (re)opened, tx ${hash}`);
  return hash;
}
