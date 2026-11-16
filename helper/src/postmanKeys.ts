/**
 * The Postman's opening key (ML-KEM-1024), derived from the helper's existing HELPER_MNEMONIC with
 * QoreSeal's sealSeedFromMnemonic, so there is no new secret to store or lose.
 *
 * The fixed passphrase below is NOT a secret: it only separates this key from any other QoreSeal key
 * someone might derive from the same mnemonic (BIP-39 passphrases work like that). Rotating the key
 * means bumping `index`, which would also mean re-sealing every open letter's Part B, so do not.
 */
import { buildRegisterKemKeyMessage, sealSeedFromMnemonic } from "@qorechain/qoreseal";
import { sealKeysFromCardSeed, type SealKeyPair } from "../../shared/tabella-crypto.ts";
import type { Chain } from "./chain.js";

export const POSTMAN_KEY_PASSPHRASE = "tabella-postman-v1";
export const POSTMAN_KEY_INDEX = 0;

export function derivePostmanKeys(mnemonic: string): SealKeyPair {
  const seed = sealSeedFromMnemonic({ mnemonic, passphrase: POSTMAN_KEY_PASSPHRASE, index: POSTMAN_KEY_INDEX });
  return sealKeysFromCardSeed(seed);
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Make sure the Postman's ML-KEM public key is registered on-chain for the helper's address
 * (native tx signed by the helper). Returns the tx hash if it registered one.
 *
 * It never overwrites a DIFFERENT key: letters may already be sealed to that one.
 */
export async function ensurePostmanKemKey(chain: Chain, keys: SealKeyPair): Promise<string | undefined> {
  const onChain = await chain.kemKey(chain.qorAddress);
  if (onChain) {
    if (sameBytes(onChain, keys.mlkemPublicKey)) return undefined;
    throw new Error("a different ML-KEM key is already registered for the helper address; refusing to overwrite it");
  }
  const msg = buildRegisterKemKeyMessage({ sender: chain.qorAddress, mlkemPublicKey: keys.mlkemPublicKey });
  return chain.broadcastNative([msg]);
}
