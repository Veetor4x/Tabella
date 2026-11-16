/**
 * Everything that touches QoreChain, behind one small interface so tests can swap in a mock.
 *
 * Two lanes, as the brief explains:
 *   - native lane (REST): ensure an ML-DSA-87 key is registered, open the EVM window, register a KEM key.
 *     Signed offline with the SDK's EthNativeSigner and broadcast over REST, because the SDK's
 *     preset consensus-RPC host does not resolve (found in spike 01).
 *   - EVM lane (JSON-RPC): simulate, read and send the TabellaRegistry transactions.
 */
import { createHash } from "node:crypto";
import { classifyEvmWindowRejection, evmWindowCost, qorechainTestnet } from "@qorechain/evm";
import {
  EthNativeSigner,
  TxClient,
  deriveUnifiedAccount,
  ensurePqcRegistered,
  fetchEvmWindow,
  fetchKemKey,
  getNetwork,
  openEvmWindowMsg,
  qorechainRegistry,
  resolveSignBytesVersion,
  type UnifiedAccount,
} from "@qorechain/sdk";
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  defineChain,
  http,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ------------------------------------------------------------------ interface

export interface WindowStatus {
  found: boolean;
  live: boolean;
  remainingBlocks: bigint;
  remainingTxs: bigint;
  /** uqor */
  remainingValue: bigint;
}

export interface SendResult {
  txHash: Hex;
  status: "success" | "reverted";
  gasUsed: bigint;
  blockNumber: bigint;
  /** set when the tx was a deployment */
  contractAddress?: Hex;
}

/** A protobuf `Any` as QoreSeal's message builders return it. */
export interface EncodedMessage {
  typeUrl: string;
  value: Uint8Array;
}

/** The call would revert (or is otherwise refused by the chain). `reason` is safe to show a user. */
export class RevertError extends Error {
  /**
   * "revert": the contract (or chain) refuses this call.
   * "window": refused only because the helper's EVM window is missing or used up.
   */
  constructor(
    readonly reason: string,
    readonly kind: "revert" | "window" = "revert",
  ) {
    super(`would revert: ${reason}`);
    this.name = "RevertError";
  }
}

export interface Chain {
  /** The helper's addresses: public, safe to show. */
  readonly qorAddress: string;
  readonly evmAddress: Hex;
  balanceUqor(): Promise<bigint>;
  windowStatus(): Promise<WindowStatus>;
  /** Open (or replace) the EVM window. Returns the native tx hash. */
  openWindow(p: { blocks: bigint; maxTxs: bigint; maxValue: bigint }): Promise<string>;
  /** Current gas price in wei. */
  gasPrice(): Promise<bigint>;
  /** Dry-run from the helper's address. Returns the gas it needs; throws RevertError if it would revert. */
  simulate(tx: { to?: Hex; data: Hex }): Promise<bigint>;
  /** Sign with the helper's key, broadcast, wait for the receipt. `to` omitted = contract deployment. */
  send(tx: { to?: Hex; data: Hex; gas: bigint; maxFeePerGas: bigint }): Promise<SendResult>;
  /** Read-only contract call (eth_call). Returns the raw return data. */
  call(tx: { to: Hex; data: Hex }): Promise<Hex>;
  /** The ML-KEM-1024 key an address registered on-chain (`qor1...` or `0x...`), or undefined if none. */
  kemKey(address: string): Promise<Uint8Array | undefined>;
  /** Native-lane messages signed by the helper (hybrid). Pre-encoded `Any`s are accepted. Returns the tx hash. */
  broadcastNative(messages: EncodedMessage[]): Promise<string>;
}

// -------------------------------------------------------------- native lane

export const NATIVE_FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

export interface NativeLane {
  /** For SDK helpers such as ensurePqcRegistered. */
  tx: TxClient;
  /**
   * Sign (hybrid, unless it is the bare key registration) and broadcast; waits for the block.
   * A message may be a plain SDK message object, or a pre-encoded `Any` from QoreSeal.
   */
  broadcast(messages: { typeUrl: string; value: unknown }[], fee?: typeof NATIVE_FEE): Promise<string>;
}

/**
 * A native-lane client for any account: offline signing + REST broadcast. A minimal stand-in for the part of
 * cosmjs's SigningStargateClient that the SDK's TxClient uses. Used for the helper and for the E2E heirs.
 */
export function createNativeLane(acc: UnifiedAccount, rest: string): NativeLane {
  const net = getNetwork("testnet");
  const registry = qorechainRegistry();

  async function accountSequence() {
    const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${acc.cosmos}`);
    if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
    const body = (await res.json()) as { account?: Record<string, any> };
    const a = body.account?.base_account ?? body.account ?? {};
    return { accountNumber: BigInt(a.account_number ?? "0"), sequence: BigInt(a.sequence ?? "0") };
  }

  /** A pre-encoded Any (raw bytes) becomes the object the SDK's registry encodes. */
  const toEncodeObject = (m: { typeUrl: string; value: unknown }) =>
    m.value instanceof Uint8Array ? { typeUrl: m.typeUrl, value: registry.decode({ typeUrl: m.typeUrl, value: m.value }) } : m;

  const signingClient = {
    async simulate(): Promise<number> {
      throw new Error("simulate is not available over REST here; pass an explicit fee");
    },
    async signAndBroadcast(_addr: string, messages: any[], fee: any, memo?: string) {
      // Only the bare key registration may be signed classically; everything else is hybrid.
      const isRegistration = messages.length === 1 && /MsgRegisterPQCKey/.test(messages[0].typeUrl);
      const signer = new EthNativeSigner(acc, { signMode: isRegistration ? "classical" : "hybrid", rest });
      const { accountNumber, sequence } = await accountSequence();
      const signBytesVersion = isRegistration ? undefined : await resolveSignBytesVersion({ chainId: net.chainId, rest });
      const signed = signer.sign({
        chainId: net.chainId,
        accountNumber,
        sequence,
        fee,
        memo,
        messages: messages.map(toEncodeObject),
        signBytesVersion,
      });
      const hash = createHash("sha256").update(signed.txRawBytes).digest("hex").toUpperCase();
      const post = await fetch(`${rest}/cosmos/tx/v1beta1/txs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx_bytes: Buffer.from(signed.txRawBytes).toString("base64"), mode: "BROADCAST_MODE_SYNC" }),
      });
      const sync = (await post.json()) as { tx_response?: { code?: number; raw_log?: string } };
      if (!post.ok || (sync.tx_response?.code ?? 0) !== 0) {
        throw new Error(`native broadcast rejected (HTTP ${post.status}, code ${sync.tx_response?.code}): ${sync.tx_response?.raw_log}`);
      }
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${hash}`);
        if (!r.ok) continue;
        const t = ((await r.json()) as any).tx_response;
        if (Number(t.code ?? 0) !== 0) throw new Error(`native tx ${hash} failed (code ${t.code}): ${t.raw_log}`);
        return {
          code: 0,
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
      throw new Error(`native tx ${hash} was accepted but not seen in a block after 60 s`);
    },
    async signAndBroadcastSync(): Promise<string> {
      throw new Error("not used");
    },
  };
  const tx = new TxClient({ signingClient: signingClient as any, senderAddress: acc.cosmos });

  return {
    tx,
    async broadcast(messages, fee = NATIVE_FEE) {
      const res = await tx.signAndBroadcast(messages as any, fee);
      return res.transactionHash;
    },
  };
}

// --------------------------------------------------------------------- real

export interface RealChain extends Chain {
  /** Register the helper's ML-DSA-87 key if it is not registered yet. Returns the tx hash when it sent one. */
  ensurePqcKey(): Promise<string | undefined>;
}

export interface RealChainOptions {
  /** The helper's BIP-39 mnemonic. Used to derive keys; never stored on this object or logged. */
  mnemonic: string;
  restUrl: string;
  evmRpcUrl: string;
  /** Used to turn revert data into names (InvalidSignature, ...). */
  abi: Abi;
}

export async function createRealChain(opts: RealChainOptions): Promise<RealChain> {
  const { restUrl: rest, evmRpcUrl: evmRpc } = opts;
  const acc: UnifiedAccount = await deriveUnifiedAccount(opts.mnemonic, 0);
  const lane = createNativeLane(acc, rest);

  // ---- EVM lane (viem)
  const chain = defineChain({ ...qorechainTestnet, rpcUrls: { default: { http: [evmRpc] } } });
  const publicClient = createPublicClient({ chain, transport: http(evmRpc) });
  const evmAccount = privateKeyToAccount(acc.privateKey as Hex);
  const wallet = createWalletClient({ account: evmAccount, chain, transport: http(evmRpc) });

  /** Turn a viem error into a RevertError with a readable reason. */
  function toRevert(err: unknown): RevertError | undefined {
    let data: Hex | undefined;
    let message = "";
    let e: any = err;
    for (let i = 0; e && i < 8; i++) {
      if (typeof e.data === "string" && /^0x[0-9a-fA-F]{8,}/.test(e.data)) data = e.data;
      if (typeof e.data?.data === "string" && /^0x[0-9a-fA-F]{8,}/.test(e.data.data)) data = e.data.data;
      if (typeof e.shortMessage === "string") message = e.shortMessage;
      e = e.cause;
    }
    if (data) {
      try {
        return new RevertError(decodeErrorResult({ abi: opts.abi, data }).errorName);
      } catch {
        /* unknown selector: fall through to the message */
      }
    }
    if (/revert|execution/i.test(message)) return new RevertError(message.replace(/\s+/g, " ").slice(0, 160));
    return undefined;
  }

  return {
    qorAddress: acc.cosmos,
    evmAddress: evmAccount.address,

    async balanceUqor() {
      const res = await fetch(`${rest}/cosmos/bank/v1beta1/balances/${acc.cosmos}/by_denom?denom=uqor`);
      if (res.status === 404) return 0n;
      if (!res.ok) throw new Error(`balance query failed: HTTP ${res.status}`);
      const body = (await res.json()) as { balance?: { amount?: string } };
      return BigInt(body.balance?.amount ?? "0");
    },

    async windowStatus() {
      const w = await fetchEvmWindow({ rest, address: acc.cosmos });
      return {
        found: w.found,
        live: w.live,
        remainingBlocks: w.remainingBlocks,
        remainingTxs: w.remainingTxs,
        remainingValue: w.remainingValue,
      };
    },

    async openWindow({ blocks, maxTxs, maxValue }) {
      return lane.broadcast([openEvmWindowMsg({ sender: acc.cosmos, blocks, maxTxs, maxValue })]);
    },

    async gasPrice() {
      return publicClient.getGasPrice();
    },

    async simulate({ to, data }) {
      try {
        return await publicClient.estimateGas({ account: evmAccount.address, to, data });
      } catch (err) {
        const windowIssue = classifyEvmWindowRejection(err);
        if (windowIssue === "no-window" || windowIssue === "exhausted") {
          throw new RevertError(`evm window: ${windowIssue}`, "window");
        }
        const revert = toRevert(err);
        if (revert) throw revert;
        throw err;
      }
    },

    async send({ to, data, gas, maxFeePerGas }) {
      const txHash = await wallet.sendTransaction({ to, data, gas, maxFeePerGas, maxPriorityFeePerGas: 0n });
      const r = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
      return {
        txHash,
        status: r.status,
        gasUsed: r.gasUsed,
        blockNumber: r.blockNumber,
        contractAddress: r.contractAddress ?? undefined,
      };
    },

    async call({ to, data }) {
      const r = await publicClient.call({ to, data });
      return (r.data ?? "0x") as Hex;
    },

    async kemKey(address) {
      const r = await fetchKemKey({ rest, address });
      return r.found && r.key ? r.key.publicKey : undefined;
    },

    async broadcastNative(messages) {
      return lane.broadcast(messages);
    },

    async ensurePqcKey() {
      const res = await ensurePqcRegistered(lane.tx, { pqcKeypair: acc.pqc, rest, fee: NATIVE_FEE });
      return res.alreadyRegistered ? undefined : res.txHash;
    },
  };
}

/** Worst-case cost (uqor) the window must cover for one tx. Re-exported so callers size windows the same way. */
export const worstCaseTxCost = (gas: bigint, maxFeePerGas: bigint): bigint => evmWindowCost({ gas, maxFeePerGas });
