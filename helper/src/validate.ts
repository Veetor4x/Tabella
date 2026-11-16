/**
 * Input validation for POST /relay. Strict on purpose: unknown fields, wrong sizes, bad hex and
 * non-allowed functions are all refused here, before any gas or RPC call is spent.
 *
 * Request body:
 *   { "fn": "createLetter", "args": { ... }, "pubkey": "0x..", "sig": "0x.." }
 *   { "fn": "checkIn" | "guardianPause" | "cancel", "args": { "letterId": "7" }, "pubkey": "0x..", "sig": "0x.." }
 * All bytes are 0x-prefixed hex. Numbers may be JSON numbers or decimal strings.
 */
import { encodeFunctionData, isAddress, type Hex } from "viem";
import { z } from "zod";
import { registryAbi, type RelayedFunction } from "./abi.js";

// Mirror TabellaRegistry's own limits (and the ML-DSA-87 sizes).
export const MAX_BLOB_BYTES = 8192;
export const MAX_HEIRS = 3;
export const MAX_PERIOD_SECONDS = 3650n * 86_400n;
export const ML_DSA_87_PUBKEY_BYTES = 2592;
export const ML_DSA_87_SIGNATURE_BYTES = 4627;
const MAX_UINT64 = (1n << 64n) - 1n;

const hexBytes = (min: number, max: number) =>
  z
    .string()
    .regex(/^0x(?:[0-9a-fA-F]{2})*$/, "must be 0x-prefixed hex with an even number of digits")
    .refine((s) => (s.length - 2) / 2 >= min && (s.length - 2) / 2 <= max, `must be ${min === max ? min : `${min}-${max}`} bytes`)
    .transform((s) => s as Hex);

const exactBytes = (n: number) => hexBytes(n, n);

const address = z
  .string()
  .refine((s) => /^0x[0-9a-fA-F]{40}$/.test(s) && isAddress(s, { strict: false }), "must be a 0x address")
  .refine((s) => !/^0x0{40}$/.test(s), "must not be the zero address")
  .transform((s) => s as Hex);

/** A non-negative integer given as a JSON number or a decimal string. */
const uint = (name: string, opts: { min?: bigint; max: bigint }) =>
  z
    .union([z.number().int().nonnegative().safe(), z.string().regex(/^\d{1,20}$/, "must be a whole number")])
    .transform((v) => BigInt(v))
    .refine((v) => v >= (opts.min ?? 0n) && v <= opts.max, `${name} is out of range`);

const blob = hexBytes(1, MAX_BLOB_BYTES);
const pubkey = exactBytes(ML_DSA_87_PUBKEY_BYTES);
const signature = exactBytes(ML_DSA_87_SIGNATURE_BYTES);
const letterId = uint("letterId", { min: 1n, max: MAX_UINT64 });

const createArgs = z
  .object({
    heirs: z.array(address).min(1).max(MAX_HEIRS),
    guardianKeyHash: exactBytes(32),
    quietPeriod: uint("quietPeriod", { min: 1n, max: MAX_PERIOD_SECONDS }),
    warningPeriod: uint("warningPeriod", { min: 1n, max: MAX_PERIOD_SECONDS }),
    letterCiphertext: blob,
    partAEnvelope: blob,
    partBForPostman: blob,
  })
  .strict();

const letterArgs = z.object({ letterId }).strict();

const requestSchema = z.discriminatedUnion("fn", [
  z.object({ fn: z.literal("createLetter"), args: createArgs, pubkey, sig: signature }).strict(),
  z.object({ fn: z.literal("checkIn"), args: letterArgs, pubkey, sig: signature }).strict(),
  z.object({ fn: z.literal("guardianPause"), args: letterArgs, pubkey, sig: signature }).strict(),
  z.object({ fn: z.literal("cancel"), args: letterArgs, pubkey, sig: signature }).strict(),
]);

export type ParsedRelay =
  | { ok: true; fn: RelayedFunction; data: Hex }
  | { ok: false; error: "invalid_request" | "function_not_allowed"; details: { path: string; message: string }[] };

export function parseRelayRequest(body: unknown): ParsedRelay {
  // Say "not allowed" (not just "invalid") for a well-formed request to some other function.
  if (typeof body === "object" && body !== null && "fn" in body) {
    const fn = (body as { fn: unknown }).fn;
    if (typeof fn === "string" && !["createLetter", "checkIn", "guardianPause", "cancel"].includes(fn)) {
      return { ok: false, error: "function_not_allowed", details: [{ path: "fn", message: "only createLetter, checkIn, guardianPause and cancel can be relayed" }] };
    }
  }

  const r = requestSchema.safeParse(body);
  if (!r.success) {
    // Report paths and reasons only: never echo submitted values back.
    const details = r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message }));
    return { ok: false, error: "invalid_request", details };
  }

  const q = r.data;
  const data =
    q.fn === "createLetter"
      ? encodeFunctionData({
          abi: registryAbi,
          functionName: "createLetter",
          args: [
            q.args.heirs,
            q.args.guardianKeyHash,
            q.args.quietPeriod,
            q.args.warningPeriod,
            q.args.letterCiphertext,
            q.args.partAEnvelope,
            q.args.partBForPostman,
            q.pubkey,
            q.sig,
          ],
        })
      : encodeFunctionData({ abi: registryAbi, functionName: q.fn, args: [q.args.letterId, q.pubkey, q.sig] });

  return { ok: true, fn: q.fn, data };
}
