import { parseAddress as qoreSealParse } from "@qorechain/qoresign";
import { describe, expect, it } from "vitest";
import { parseAddress } from "../src/lib/addr";

// The helper account, in both forms (from the helper's own startup log).
const QOR = "qor1m4hahqx9s0h852xe36awlgw09qyetagc3ajfgp";
const EVM = "0xdD6fDb80C583Ee7a28d98EbaeFa1Cf280995f518";

describe("parseAddress", () => {
  it("turns qor1... into 0x... and back", () => {
    const a = parseAddress(QOR);
    expect(a).toEqual({ ok: true, evm: EVM, qor: QOR });
    const b = parseAddress(EVM);
    expect(b).toEqual({ ok: true, evm: EVM, qor: QOR });
  });

  it("agrees with QoreSeal's own parser", () => {
    for (const input of [QOR, EVM, EVM.toLowerCase(), "0xE6EB9d3CFA9a2b7a57a30f47BE5161c5C21C6Ca3", "qor1um4e6086ng4h54arparmu5tpchppcm9rh730u6"]) {
      const mine = parseAddress(input);
      const theirs = qoreSealParse(input);
      expect(mine.ok).toBe(true);
      if (mine.ok) expect(mine.qor).toBe(theirs.bech32);
    }
  });

  it("accepts all-lowercase hex, trims spaces, and ignores case of qor1", () => {
    expect(parseAddress(`  ${EVM.toLowerCase()}  `)).toMatchObject({ ok: true, qor: QOR });
    expect(parseAddress(QOR.toUpperCase())).toMatchObject({ ok: true, evm: EVM });
  });

  it.each([
    ["empty", ""],
    ["words", "my friend Mia"],
    ["too short hex", "0x1234"],
    ["hex with a wrong letter", "0xzD6fDb80C583Ee7a28d98EbaeFa1Cf280995f518"],
    ["mixed-case hex with a bad checksum", "0xdD6fDb80C583Ee7a28d98EbaeFa1Cf280995f519".replace("dD6f", "Dd6f")],
    ["bech32 with a typo", QOR.slice(0, -1) + (QOR.endsWith("p") ? "q" : "p")],
    ["another network's prefix", "cosmos1m4hahqx9s0h852xe36awlgw09qyetagc3ajfgp"],
    ["qor1 but cut short", QOR.slice(0, 30)],
  ])("rejects %s", (_n, input) => {
    expect(parseAddress(input).ok).toBe(false);
  });
});
