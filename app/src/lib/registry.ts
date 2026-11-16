/**
 * Reads letters from the network (through the same-origin proxy), and says what state each one is in.
 * Reading needs no card and no helper: it is public.
 */
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { REGISTRY, evmRpcUrl } from "./config";

const abi = parseAbi([
  "struct Letter { bytes32 ownerKeyHash; bytes32 guardianKeyHash; address[] heirs; uint64 quietPeriod; uint64 warningPeriod; uint64 lastCheckIn; uint64 nonce; uint8 pausesUsed; bool cancelled; bool released; bytes letterCiphertext; bytes partAEnvelope; bytes partBForPostman; bytes partBForHeirs; }",
  "function letterCount() view returns (uint256)",
  "function status(uint256 letterId) view returns (uint8)",
  "function getLetter(uint256 letterId) view returns (Letter)",
]);

export const MAX_PAUSES = 2;
export type LetterState = "Sealed" | "Warning" | "Opened" | "Cancelled";
const STATES: LetterState[] = ["Sealed", "Warning", "Opened", "Cancelled"];

export interface LetterView {
  id: bigint;
  state: LetterState;
  lastCheckIn: number;
  quiet: number;
  warning: number;
  nonce: number;
  pausesUsed: number;
  hasGuardian: boolean;
  heirs: Hex[];
  ownerKeyHash: Hex;
  guardianKeyHash: Hex;
  /** The network's clock when we looked (seconds), and our own clock then (ms): together they keep counting. */
  chainNow: number;
  fetchedAt: number;
}

const client = () => createPublicClient({ transport: http(evmRpcUrl()) });
const ZERO = `0x${"00".repeat(32)}`;

export async function readLetter(id: bigint): Promise<LetterView> {
  const c = client();
  const [l, st, block] = await Promise.all([
    c.readContract({ address: REGISTRY, abi, functionName: "getLetter", args: [id] }),
    c.readContract({ address: REGISTRY, abi, functionName: "status", args: [id] }),
    c.getBlock({ blockTag: "latest" }),
  ]);
  return {
    id,
    state: STATES[Number(st)] ?? "Sealed",
    lastCheckIn: Number(l.lastCheckIn),
    quiet: Number(l.quietPeriod),
    warning: Number(l.warningPeriod),
    nonce: Number(l.nonce),
    pausesUsed: l.pausesUsed,
    hasGuardian: l.guardianKeyHash !== ZERO,
    heirs: [...l.heirs],
    ownerKeyHash: l.ownerKeyHash,
    guardianKeyHash: l.guardianKeyHash,
    chainNow: Number(block.timestamp),
    fetchedAt: Date.now(),
  };
}

export type Match = Pick<LetterView, "id" | "heirs" | "quiet" | "warning" | "hasGuardian">;

/** Every letter that belongs to this card (found by the card's fingerprint). One read per letter: fine at this size. */
export async function findLetters(fingerprint: Hex): Promise<{ owner: Match[]; guardian: Match[] }> {
  const c = client();
  const count = Number(await c.readContract({ address: REGISTRY, abi, functionName: "letterCount" }));
  const out = { owner: [] as Match[], guardian: [] as Match[] };
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  const want = fingerprint.toLowerCase();
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(ids.slice(i, i + 8).map((id) => c.readContract({ address: REGISTRY, abi, functionName: "getLetter", args: [id] }).then((l) => ({ id, l })).catch(() => null)));
    for (const b of batch) {
      if (!b) continue;
      const m: Match = { id: b.id, heirs: [...b.l.heirs], quiet: Number(b.l.quietPeriod), warning: Number(b.l.warningPeriod), hasGuardian: b.l.guardianKeyHash !== ZERO };
      if (b.l.ownerKeyHash.toLowerCase() === want) out.owner.push(m);
      else if (m.hasGuardian && b.l.guardianKeyHash.toLowerCase() === want) out.guardian.push(m);
    }
  }
  return out;
}
