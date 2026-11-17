/**
 * Reads letters from the network (through the same-origin proxy), and says what state each one is in.
 * Reading needs no card and no helper: it is public.
 */
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { REGISTRIES, REGISTRY, evmRpcUrl, versionOf } from "./config";

const abi = parseAbi([
  "struct Letter { bytes32 ownerKeyHash; bytes32 guardianKeyHash; address[] heirs; uint64 quietPeriod; uint64 warningPeriod; uint64 releaseAt; uint64 lastCheckIn; uint64 nonce; uint8 pausesUsed; bool cancelled; bool released; bytes letterCiphertext; bytes partAEnvelope; bytes partBForPostman; bytes partBForHeirs; }",
  "function letterCount() view returns (uint256)",
  "function status(uint256 letterId) view returns (uint8)",
  "function getLetter(uint256 letterId) view returns (Letter)",
]);
/** The first test version, from before dated letters: the same record without a release date. */
const abiV1 = parseAbi([
  "struct Letter { bytes32 ownerKeyHash; bytes32 guardianKeyHash; address[] heirs; uint64 quietPeriod; uint64 warningPeriod; uint64 lastCheckIn; uint64 nonce; uint8 pausesUsed; bool cancelled; bool released; bytes letterCiphertext; bytes partAEnvelope; bytes partBForPostman; bytes partBForHeirs; }",
  "function letterCount() view returns (uint256)",
  "function status(uint256 letterId) view returns (uint8)",
  "function getLetter(uint256 letterId) view returns (Letter)",
]);
const abiFor = (registry: string) => (versionOf(registry)?.dated === false ? (abiV1 as unknown as typeof abi) : abi);

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
  /** a dated letter: the unix time it opens; 0 for an ordinary letter */
  releaseAt: number;
  pausesUsed: number;
  hasGuardian: boolean;
  heirs: Hex[];
  /** the Postman has published the second half (the letter can be opened now) */
  released: boolean;
  ownerKeyHash: Hex;
  guardianKeyHash: Hex;
  /** The network's clock when we looked (seconds), and our own clock then (ms): together they keep counting. */
  chainNow: number;
  fetchedAt: number;
}

const client = () => createPublicClient({ transport: http(evmRpcUrl()) });
const ZERO = `0x${"00".repeat(32)}`;

/** One letter, read on a given registry version (the current one unless said otherwise). */
export async function readLetter(id: bigint, registry: string = REGISTRY): Promise<LetterView> {
  const c = client();
  const a = abiFor(registry);
  const [l, st, block] = await Promise.all([
    c.readContract({ address: registry as Hex, abi: a, functionName: "getLetter", args: [id] }),
    c.readContract({ address: registry as Hex, abi: a, functionName: "status", args: [id] }),
    c.getBlock({ blockTag: "latest" }),
  ]);
  return {
    id,
    state: STATES[Number(st)] ?? "Sealed",
    lastCheckIn: Number(l.lastCheckIn),
    quiet: Number(l.quietPeriod),
    warning: Number(l.warningPeriod),
    nonce: Number(l.nonce),
    releaseAt: Number((l as { releaseAt?: bigint }).releaseAt ?? 0),
    pausesUsed: l.pausesUsed,
    hasGuardian: l.guardianKeyHash !== ZERO,
    heirs: [...l.heirs],
    released: l.released,
    ownerKeyHash: l.ownerKeyHash,
    guardianKeyHash: l.guardianKeyHash,
    chainNow: Number(block.timestamp),
    fetchedAt: Date.now(),
  };
}

export type Match = Pick<LetterView, "id" | "heirs" | "quiet" | "warning" | "hasGuardian"> & { /** the registry version it was found on */ registry: string };

/** Every letter that belongs to this card, on every registry version we have deployed (found by the card's fingerprint). */
export async function findLetters(fingerprint: Hex): Promise<{ owner: Match[]; guardian: Match[] }> {
  const c = client();
  const out = { owner: [] as Match[], guardian: [] as Match[] };
  const want = fingerprint.toLowerCase();
  let answered = 0;
  let lastError: unknown;
  for (const v of REGISTRIES) {
    const a = abiFor(v.address);
    let count = 0;
    try {
      count = Number(await c.readContract({ address: v.address, abi: a, functionName: "letterCount" }));
      answered++;
    } catch (e) {
      lastError = e;
      continue; // this version cannot be read right now: the others still can
    }
    const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
    for (let i = 0; i < ids.length; i += 8) {
      const batch = await Promise.all(ids.slice(i, i + 8).map((id) => c.readContract({ address: v.address, abi: a, functionName: "getLetter", args: [id] }).then((l) => ({ id, l })).catch(() => null)));
      for (const b of batch) {
        if (!b) continue;
        const m: Match = { id: b.id, heirs: [...b.l.heirs], quiet: Number(b.l.quietPeriod), warning: Number(b.l.warningPeriod), hasGuardian: b.l.guardianKeyHash !== ZERO, registry: v.address };
        if (b.l.ownerKeyHash.toLowerCase() === want) out.owner.push(m);
        else if (m.hasGuardian && b.l.guardianKeyHash.toLowerCase() === want) out.guardian.push(m);
      }
    }
  }
  if (!answered) throw lastError ?? new Error("The network could not be reached.");
  return out;
}

// ------------------------------------------------------------------ the loved one's side

/** What a loved one can see about a letter: only whether it is sealed, on its way, or ready. Nothing else is shown. */
export type HeirState = "sealed" | "on-its-way" | "ready" | "withdrawn";

export interface HeirLetter {
  id: bigint;
  state: HeirState;
  letterCiphertext: Hex;
  partAEnvelope: Hex;
  partBForHeirs: Hex;
}

/** Sealed (including the warning time) shows nothing more; released but not yet delivered is "on its way"; delivered is "ready". */
export function heirStateOf(status: number, released: boolean, partBLength: number): HeirState {
  if (status === 3) return "withdrawn";
  if (released && partBLength > 2) return "ready";
  if (status === 2) return "on-its-way";
  return "sealed";
}

/** Every letter sealed to this address. One read per letter: fine at this size. */
export async function findLettersForHeir(evm: string): Promise<HeirLetter[]> {
  const c = client();
  const count = Number(await c.readContract({ address: REGISTRY, abi, functionName: "letterCount" }));
  const want = evm.toLowerCase();
  const out: HeirLetter[] = [];
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(
      ids.slice(i, i + 8).map((id) =>
        Promise.all([c.readContract({ address: REGISTRY, abi, functionName: "getLetter", args: [id] }), c.readContract({ address: REGISTRY, abi, functionName: "status", args: [id] })])
          .then(([l, st]) => ({ id, l, st: Number(st) }))
          .catch(() => null),
      ),
    );
    for (const b of batch) {
      if (!b || !b.l.heirs.some((h) => h.toLowerCase() === want)) continue;
      out.push({ id: b.id, state: heirStateOf(b.st, b.l.released, b.l.partBForHeirs.length), letterCiphertext: b.l.letterCiphertext, partAEnvelope: b.l.partAEnvelope, partBForHeirs: b.l.partBForHeirs });
    }
  }
  return out;
}

/** One letter's state again (for the gentle waiting screens). */
export async function readHeirLetter(id: bigint): Promise<HeirLetter> {
  const c = client();
  const [l, st] = await Promise.all([c.readContract({ address: REGISTRY, abi, functionName: "getLetter", args: [id] }), c.readContract({ address: REGISTRY, abi, functionName: "status", args: [id] })]);
  return { id, state: heirStateOf(Number(st), l.released, l.partBForHeirs.length), letterCiphertext: l.letterCiphertext, partAEnvelope: l.partAEnvelope, partBForHeirs: l.partBForHeirs };
}
