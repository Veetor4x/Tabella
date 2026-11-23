import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { postmanAbi, STATUS } from "../src/abi.js";
import type { Chain, EncodedMessage, SendResult, WindowStatus } from "../src/chain.js";
import { RevertError } from "../src/chain.js";

export interface MockLetter {
  /** 0 Active, 1 Warning, 2 Released, 3 Cancelled (set by the test, like time passing) */
  status: number;
  released: boolean;
  heirs: Hex[];
  partBForPostman: Hex;
  partBForHeirs: Hex;
  /** seconds; default 120 / 60 / last check-in at 1 (what the older tests expect) */
  quietPeriod?: bigint;
  warningPeriod?: bigint;
  lastCheckIn?: bigint;
  releaseAt?: bigint;
}

/** A scriptable stand-in for QoreChain. `calls` records the order things happened in. */
export class MockChain implements Chain {
  qorAddress = "qor1mockhelperaddress000000000000000000000";
  evmAddress = "0x00000000000000000000000000000000000000aa" as Hex;

  // not part of the Chain interface: proves /health never leaks things that are not whitelisted
  private readonly secretMnemonic = "SECRET-MNEMONIC-WORDS-DO-NOT-LEAK";
  private readonly secretKey = "0xSECRETPRIVATEKEY";

  balance = 100_000_000n; // 100 QOR
  gasPriceWei = 112_500_000_000n;
  window: WindowStatus = { found: true, live: true, remainingBlocks: 15_000n, remainingTxs: 150n, remainingValue: 10n ** 12n };

  /** Every call, in order: "balance", "window", "simulate", "gasPrice", "openWindow", "send", ... */
  calls: string[] = [];
  sent: { to?: Hex; data: Hex; gas: bigint; maxFeePerGas: bigint }[] = [];
  opened: { blocks: bigint; maxTxs: bigint; maxValue: bigint }[] = [];

  simulateImpl: (tx: { to?: Hex; data: Hex }) => Promise<bigint> | bigint = () => 300_000n;
  sendStatus: "success" | "reverted" = "success";
  /** the next openWindow leaves the window unusable (to test the safety net) */
  openLeavesWindowDead = false;
  /** throw a plain error from every chain call (an RPC outage) */
  down = false;
  /** artificial latency so concurrent requests really overlap */
  delayMs = 0;
  private inFlight = 0;
  maxInFlight = 0;
  private sendInFlight = 0;
  /** most sends / window opens that ever overlapped (must stay 1: one nonce counter) */
  maxSendInFlight = 0;
  private txCounter = 0;

  // ---- an in-memory TabellaRegistry, for the Postman
  letters = new Map<bigint, MockLetter>();
  /** registered ML-KEM keys by qor1 address */
  kemKeys = new Map<string, Uint8Array>();
  nativeBroadcasts: EncodedMessage[][] = [];
  /** Part B publications that reached "the chain" */
  published: { id: bigint; envelope: Hex; txHash: Hex }[] = [];
  /** the next N sends throw before reaching the chain (RPC error) */
  failNextSends = 0;
  /** the next N sends reach the chain, then throw (a lost response / timeout) */
  applyThenThrowNextSends = 0;

  private async enter(name: string) {
    if (this.down) throw new Error(`rpc down (${this.secretMnemonic.length} chars of context)`); // message must never reach a client
    this.calls.push(name);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
  }
  private leave() {
    this.inFlight--;
  }

  async balanceUqor() {
    await this.enter("balance");
    try {
      return this.balance;
    } finally {
      this.leave();
    }
  }

  /** balances of other accounts, by qor1 address */
  balances = new Map<string, bigint>();
  async balanceOfUqor(address: string) {
    await this.enter("balanceOf");
    try {
      return this.balances.get(address) ?? 0n;
    } finally {
      this.leave();
    }
  }

  async windowStatus() {
    await this.enter("window");
    try {
      return { ...this.window };
    } finally {
      this.leave();
    }
  }

  async openWindow(p: { blocks: bigint; maxTxs: bigint; maxValue: bigint }) {
    await this.enter("openWindow");
    this.sendInFlight++;
    this.maxSendInFlight = Math.max(this.maxSendInFlight, this.sendInFlight);
    try {
      this.opened.push(p);
      this.window = this.openLeavesWindowDead
        ? { found: true, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n }
        : { found: true, live: true, remainingBlocks: p.blocks, remainingTxs: p.maxTxs, remainingValue: p.maxValue };
      return `WINDOWTX${this.opened.length}`;
    } finally {
      this.sendInFlight--;
      this.leave();
    }
  }

  async gasPrice() {
    await this.enter("gasPrice");
    try {
      return this.gasPriceWei;
    } finally {
      this.leave();
    }
  }

  private decodePublish(data: Hex): { id: bigint; envelope: Hex } | undefined {
    try {
      const d = decodeFunctionData({ abi: postmanAbi, data });
      if (d.functionName === "publishPartB") {
        const [id, envelope] = d.args as readonly [bigint, Hex];
        return { id, envelope };
      }
    } catch {
      /* not a postman call */
    }
    return undefined;
  }

  async simulate(tx: { to?: Hex; data: Hex }) {
    await this.enter("simulate");
    try {
      const pub = this.decodePublish(tx.data);
      if (pub) {
        const l = this.letters.get(pub.id);
        if (!l) throw new RevertError("UnknownLetter");
        if (l.released) throw new RevertError("AlreadyPublished");
        if (l.status !== STATUS.Released) throw new RevertError("NotReleased");
      }
      return await this.simulateImpl(tx);
    } finally {
      this.leave();
    }
  }

  async send(tx: { to?: Hex; data: Hex; gas: bigint; maxFeePerGas: bigint }): Promise<SendResult> {
    await this.enter("send");
    this.sendInFlight++;
    this.maxSendInFlight = Math.max(this.maxSendInFlight, this.sendInFlight);
    try {
      if (this.failNextSends > 0) {
        this.failNextSends--;
        throw new Error("send failed: rpc error");
      }
      this.sent.push(tx);
      this.window = { ...this.window, remainingTxs: this.window.remainingTxs - 1n };
      this.txCounter++;
      const txHash = `0x${this.txCounter.toString(16).padStart(64, "0")}` as Hex;

      const pub = this.decodePublish(tx.data);
      if (pub && this.sendStatus === "success") {
        const l = this.letters.get(pub.id)!;
        l.released = true;
        l.partBForHeirs = pub.envelope;
        this.published.push({ id: pub.id, envelope: pub.envelope, txHash });
      }
      if (this.applyThenThrowNextSends > 0) {
        this.applyThenThrowNextSends--;
        throw new Error("timed out waiting for receipt");
      }
      return { txHash, status: this.sendStatus, gasUsed: 250_000n, blockNumber: 1000n + BigInt(this.txCounter) };
    } finally {
      this.sendInFlight--;
      this.leave();
    }
  }

  async call({ data }: { to: Hex; data: Hex }): Promise<Hex> {
    await this.enter("call");
    try {
      const d = decodeFunctionData({ abi: postmanAbi, data });
      if (d.functionName === "letterCount") {
        return encodeFunctionResult({ abi: postmanAbi, functionName: "letterCount", result: BigInt(this.letters.size) });
      }
      const id = (d.args as readonly [bigint])[0];
      const l = this.letters.get(id);
      if (!l) throw new Error("UnknownLetter");
      if (d.functionName === "status") {
        return encodeFunctionResult({ abi: postmanAbi, functionName: "status", result: l.status });
      }
      if (d.functionName === "getLetter") {
        return encodeFunctionResult({
          abi: postmanAbi,
          functionName: "getLetter",
          result: {
            ownerKeyHash: `0x${"11".repeat(32)}`,
            guardianKeyHash: `0x${"22".repeat(32)}`,
            heirs: l.heirs,
            quietPeriod: l.quietPeriod ?? 120n,
            warningPeriod: l.warningPeriod ?? 60n,
            releaseAt: l.releaseAt ?? 0n,
            lastCheckIn: l.lastCheckIn ?? 1n,
            nonce: 1n,
            pausesUsed: 0,
            cancelled: l.status === STATUS.Cancelled,
            released: l.released,
            letterCiphertext: "0x01",
            partAEnvelope: "0x02",
            partBForPostman: l.partBForPostman,
            partBForHeirs: l.partBForHeirs,
          },
        });
      }
      throw new Error(`unexpected view call ${d.functionName}`);
    } finally {
      this.leave();
    }
  }

  async kemKey(address: string): Promise<Uint8Array | undefined> {
    await this.enter("kemKey");
    try {
      return this.kemKeys.get(address);
    } finally {
      this.leave();
    }
  }

  async broadcastNative(messages: EncodedMessage[]): Promise<string> {
    await this.enter("broadcastNative");
    try {
      this.nativeBroadcasts.push(messages);
      for (const m of messages) {
        const v = m.value as unknown as { toAddress?: string; amount?: { amount: string }[] };
        if (m.typeUrl === "/cosmos.bank.v1beta1.MsgSend" && v.toAddress) this.balances.set(v.toAddress, (this.balances.get(v.toAddress) ?? 0n) + BigInt(v.amount?.[0]?.amount ?? "0"));
      }
      return `NATIVETX${this.nativeBroadcasts.length}`;
    } finally {
      this.leave();
    }
  }

  /** Helper for tests: make simulation fail like the contract would. */
  revertWith(reason: string) {
    this.simulateImpl = () => {
      throw new RevertError(reason);
    };
  }

  /** The names of calls that spend gas or a native fee. */
  get spending(): string[] {
    return this.calls.filter((c) => c === "send" || c === "openWindow");
  }
}
