import { bech32 } from "bech32";
import { bytesToHex, getAddress, hexToBytes, isAddress, type Hex } from "viem";

const PREFIX = "qor";

export type ParsedAddress = { ok: true; evm: Hex; qor: string } | { ok: false };

/**
 * Accepts a QoreChain address in either form: `qor1...` or `0x...`.
 * A mixed-case `0x` address must have a valid checksum; all-lowercase is fine.
 */
export function parseAddress(input: string): ParsedAddress {
  const s = input.trim();
  try {
    if (/^0x[0-9a-fA-F]{40}$/.test(s)) {
      const hex = s.slice(2);
      const mixedCase = hex !== hex.toLowerCase() && hex !== hex.toUpperCase();
      // A mixed-case address carries a checksum: a typo shows up here. (viem's getAddress would NOT notice.)
      if (mixedCase && !isAddress(s, { strict: true })) return { ok: false };
      const evm = getAddress(s.toLowerCase());
      return { ok: true, evm, qor: bech32.encode(PREFIX, bech32.toWords(hexToBytes(evm))) };
    }
    if (/^qor1[0-9a-z]{30,60}$/i.test(s)) {
      const { prefix, words } = bech32.decode(s.toLowerCase());
      const bytes = Uint8Array.from(bech32.fromWords(words));
      if (prefix !== PREFIX || bytes.length !== 20) return { ok: false };
      return { ok: true, evm: getAddress(bytesToHex(bytes)), qor: s.toLowerCase() };
    }
  } catch {
    /* bad checksum or characters */
  }
  return { ok: false };
}
