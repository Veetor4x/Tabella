/**
 * The loved one's side, all in the browser: make an opening card, get a tiny amount of test coins from the helper
 * for the network fee, and register the opening key on the network herself (no wallet needed).
 *
 * One card (32 random bytes) is the whole identity: her account is derived from it, and so are her opening keys,
 * so the same card brings everything back on a new phone. Nothing is sent anywhere except the public address
 * (to the helper, for the fee) and the public opening key (to the network).
 */
import { buildRegisterKemKeyMessage } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { EthNativeSigner, TxClient, deriveUnifiedAccount, ensurePqcRegistered, getNetwork, qorechainRegistry, resolveSignBytesVersion, type UnifiedAccount } from "@qorechain/sdk";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { qorexNative } from "./qorex";
import { cardDecode, cardEncode, newSeed, sealKeysFromCardSeed, type SealKeyPair } from "../../../shared/tabella-crypto";
import { HELPER_URL, restUrl } from "./config";
import { HelperError, warmUp } from "./helper";

export const NATIVE_FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

export type JoinProgress = "waking" | "funding" | "waiting" | "registering" | "finishing" | "done";

const enc = new TextEncoder();

/** Her account: derived from her card with its own label, so it is separate from her opening keys. */
export async function accountFromSeed(seed: Uint8Array): Promise<UnifiedAccount> {
  const label = enc.encode("tabella-v1/account");
  const input = new Uint8Array(label.length + seed.length);
  input.set(label);
  input.set(seed, label.length);
  const entropy = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return deriveUnifiedAccount(entropyToMnemonic(entropy, wordlist), 0);
}

export interface Identity {
  card: string;
  keys: SealKeyPair;
  account: UnifiedAccount;
  /** public: safe to share */
  qor: string;
  evm: `0x${string}`;
}

export async function identityFromCard(card: string): Promise<Identity> {
  const seed = cardDecode(card); // a readable error for a typo
  const account = await accountFromSeed(seed);
  return { card: cardEncode(seed), keys: sealKeysFromCardSeed(seed), account, qor: account.cosmos, evm: account.evm as `0x${string}` };
}

export const newCard = (): string => cardEncode(newSeed());

// ------------------------------------------------------------------ native lane in the browser

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const hex = (bytes: Uint8Array) => Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sign offline, send through the same-origin REST path, wait for the block. The same lane the helper's tests use. */
function nativeLane(acc: UnifiedAccount, rest: string) {
  const net = getNetwork("testnet");
  const registry = qorechainRegistry();

  async function accountSequence() {
    const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${acc.cosmos}`);
    if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
    const body = (await res.json()) as { account?: Record<string, any> };
    const a = body.account?.base_account ?? body.account ?? {};
    return { accountNumber: BigInt(a.account_number ?? "0"), sequence: BigInt(a.sequence ?? "0") };
  }
  const toEncodeObject = (m: { typeUrl: string; value: unknown }) => (m.value instanceof Uint8Array ? { typeUrl: m.typeUrl, value: registry.decode({ typeUrl: m.typeUrl, value: m.value }) } : m);

  const signingClient = {
    async simulate(): Promise<number> {
      throw new Error("not available here");
    },
    async signAndBroadcast(_addr: string, messages: any[], fee: any, memo?: string) {
      const isRegistration = messages.length === 1 && /MsgRegisterPQCKey/.test(messages[0].typeUrl);
      const signer = new EthNativeSigner(acc, { signMode: isRegistration ? "classical" : "hybrid", rest });
      const { accountNumber, sequence } = await accountSequence();
      const signBytesVersion = isRegistration ? undefined : await resolveSignBytesVersion({ chainId: net.chainId, rest });
      const signed = signer.sign({ chainId: net.chainId, accountNumber, sequence, fee, memo, messages: messages.map(toEncodeObject), signBytesVersion });
      const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(signed.txRawBytes))));
      const post = await fetch(`${rest}/cosmos/tx/v1beta1/txs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx_bytes: b64(signed.txRawBytes), mode: "BROADCAST_MODE_SYNC" }) });
      const sync = (await post.json()) as { tx_response?: { code?: number; raw_log?: string } };
      if (!post.ok || (sync.tx_response?.code ?? 0) !== 0) throw new Error(`broadcast rejected (code ${sync.tx_response?.code})`);
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const r = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${hash}`);
        if (!r.ok) continue;
        const t = ((await r.json()) as any).tx_response;
        if (Number(t.code ?? 0) !== 0) throw new Error(`transaction failed (code ${t.code})`);
        return { code: 0, transactionHash: hash, height: Number(t.height), gasUsed: BigInt(t.gas_used ?? 0), gasWanted: BigInt(t.gas_wanted ?? 0), rawLog: t.raw_log, events: [], msgResponses: [], txIndex: 0 };
      }
      throw new Error("the transaction was accepted but not seen in a block yet");
    },
    async signAndBroadcastSync(): Promise<string> {
      throw new Error("not used");
    },
  };
  const tx = new TxClient({ signingClient: signingClient as any, senderAddress: acc.cosmos });
  return {
    tx,
    async broadcast(messages: { typeUrl: string; value: unknown }[], fee = NATIVE_FEE) {
      return (await tx.signAndBroadcast(messages as any, fee)).transactionHash;
    },
  };
}

// ------------------------------------------------------------------ the pieces

async function balanceUqor(qor: string): Promise<bigint> {
  const res = await fetch(`${restUrl()}/cosmos/bank/v1beta1/balances/${qor}/by_denom?denom=uqor`);
  if (res.status === 404) return 0n;
  if (!res.ok) throw new Error(`balance query failed: HTTP ${res.status}`);
  return BigInt(((await res.json()) as { balance?: { amount?: string } }).balance?.amount ?? "0");
}

export async function isOpeningKeyRegistered(qor: string, keys?: SealKeyPair): Promise<boolean> {
  const st = await fetchKemKey({ rest: restUrl(), address: qor });
  if (!st.registered || !st.publicKey) return false;
  return keys ? st.publicKey.length === keys.mlkemPublicKey.length && st.publicKey.every((x, i) => x === keys.mlkemPublicKey[i]) : true;
}

/** Ask the helper for the one-time fee money. "already funded" is fine: it means a first try got through. */
export async function askForFee(qor: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${HELPER_URL}/fund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: qor }), signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new HelperError("helper_unreachable");
  }
  let json: { ok?: boolean; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (res.ok && json.ok) return;
  if (json.error === "already_funded") return;
  throw new HelperError(json.error ?? `http_${res.status}`);
}

/**
 * Everything between "Make my opening card" and "Ready": fee money, her account's own key, her opening key on the
 * network. Safe to run again after a failure: each part checks what is already done.
 */
export async function becomeReady(card: string, onProgress: (p: JoinProgress) => void): Promise<Identity> {
  const id = await identityFromCard(card);
  if (await isOpeningKeyRegistered(id.qor, id.keys)) {
    onProgress("done");
    return id;
  }
  onProgress("waking");
  await warmUp().catch(() => {}); // the helper may be asleep
  onProgress("funding");
  if ((await balanceUqor(id.qor)) === 0n) await askForFee(id.qor);
  onProgress("waiting");
  for (let i = 0; i < 40 && (await balanceUqor(id.qor)) === 0n; i++) await sleep(2000);
  if ((await balanceUqor(id.qor)) === 0n) throw new HelperError("fee_not_arrived");
  onProgress("registering");
  const lane = nativeLane(id.account, restUrl());
  await ensurePqcRegistered(lane.tx, { pqcKeypair: id.account.pqc, rest: restUrl(), fee: NATIVE_FEE });
  if (!(await isOpeningKeyRegistered(id.qor))) await lane.broadcast([buildRegisterKemKeyMessage({ sender: id.qor, mlkemPublicKey: id.keys.mlkemPublicKey })]);
  onProgress("finishing");
  for (let i = 0; i < 20 && !(await isOpeningKeyRegistered(id.qor, id.keys)); i++) await sleep(2000);
  if (!(await isOpeningKeyRegistered(id.qor, id.keys))) throw new HelperError("key_not_seen");
  onProgress("done");
  return id;
}

/** The QoreX way: her own wallet signs; the card only holds her opening keys. */
export async function registerWithQoreX(card: string): Promise<{ qor: string }> {
  const native = qorexNative();
  if (!native) throw new HelperError("no_qorex");
  const keys = sealKeysFromCardSeed(cardDecode(card));
  await native.enable("qorechain-diana");
  const key = await native.getKey("qorechain-diana");
  const res = await native.signAndBroadcast({ chainId: "qorechain-diana", messages: [buildRegisterKemKeyMessage({ sender: key.bech32Address, mlkemPublicKey: keys.mlkemPublicKey })], memo: "Tabella: opening card" });
  if (res.code !== 0) throw new HelperError("qorex_failed");
  for (let i = 0; i < 20 && !(await isOpeningKeyRegistered(key.bech32Address, keys)); i++) await sleep(3000);
  if (!(await isOpeningKeyRegistered(key.bech32Address, keys))) throw new HelperError("key_not_seen");
  return { qor: key.bech32Address };
}
