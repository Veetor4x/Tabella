import type { Hex } from "viem";
import type { Chain, SendResult, WindowStatus } from "../src/chain.js";
import { RevertError } from "../src/chain.js";

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

  /** Every call, in order: "balance", "window", "simulate", "gasPrice", "openWindow", "send". */
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
  private txCounter = 0;

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
    try {
      this.opened.push(p);
      this.window = this.openLeavesWindowDead
        ? { found: true, live: false, remainingBlocks: 0n, remainingTxs: 0n, remainingValue: 0n }
        : { found: true, live: true, remainingBlocks: p.blocks, remainingTxs: p.maxTxs, remainingValue: p.maxValue };
      return `WINDOWTX${this.opened.length}`;
    } finally {
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

  async simulate(tx: { to?: Hex; data: Hex }) {
    await this.enter("simulate");
    try {
      return await this.simulateImpl(tx);
    } finally {
      this.leave();
    }
  }

  async send(tx: { to?: Hex; data: Hex; gas: bigint; maxFeePerGas: bigint }): Promise<SendResult> {
    await this.enter("send");
    try {
      this.sent.push(tx);
      this.window = { ...this.window, remainingTxs: this.window.remainingTxs - 1n };
      this.txCounter++;
      return {
        txHash: `0x${this.txCounter.toString(16).padStart(64, "0")}` as Hex,
        status: this.sendStatus,
        gasUsed: 250_000n,
        blockNumber: 1000n + BigInt(this.txCounter),
      };
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
