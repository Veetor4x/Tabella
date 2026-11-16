/**
 * Builds shared/test-vectors/lib-signatures.json: REAL ML-DSA-87 signatures made by
 * tabella-crypto.ts over the messages the contract produced (contract-vectors.json).
 * ML-DSA signing here is deterministic, so the file is reproducible. The Foundry test
 * LibSignature.t.sol feeds these through TabellaRegistry.
 *
 * The seed below is a public TEST seed. Never use it for anything real.
 */
import { hexToBytes, toHex, type Hex } from "viem";
import { keyHash, signAction, signingKeysFromSeed } from "../tabella-crypto";

export const FIXTURE_OWNER_SEED = new Uint8Array(32).fill(7);

export interface ContractVectors {
  chainId: number;
  registry: Hex;
  create: Record<string, unknown> & { payloadHash: Hex };
  emptyPayloadHash: Hex;
  keyHash: { pubkey: Hex; hash: Hex };
  cases: { name: string; letterId: string; action: string; nonce: string; payloadHash: Hex; message: Hex }[];
}

export function buildSignatureFixture(vectors: ContractVectors): string {
  const byName = (n: string) => {
    const c = vectors.cases.find((x) => x.name === n);
    if (!c) throw new Error(`vector "${n}" missing`);
    return c;
  };
  const keys = signingKeysFromSeed(FIXTURE_OWNER_SEED);
  const create = byName("create");
  const checkin = byName("checkin");
  const sig = (m: Hex) => toHex(signAction(FIXTURE_OWNER_SEED, hexToBytes(m)));
  return (
    JSON.stringify(
      {
        note: "Public TEST seed. Real ML-DSA-87 signatures over the messages in contract-vectors.json.",
        ownerSeed: toHex(FIXTURE_OWNER_SEED),
        ownerPubkey: toHex(keys.publicKey),
        ownerKeyHash: keyHash(keys.publicKey),
        createMessage: create.message,
        createSig: sig(create.message),
        checkinMessage: checkin.message,
        checkinSig: sig(checkin.message),
      },
      null,
      2,
    ) + "\n"
  );
}
