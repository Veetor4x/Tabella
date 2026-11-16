/**
 * TEMPORARY risky-part test #3 (open at /#spike). Delete before shipping.
 *   1. make an opening key (QoreSeal keys from a random seed, seed kept in localStorage)
 *   2. register its ML-KEM-1024 public key with QoreX (MsgRegisterKEMKey via native.signAndBroadcast)
 *   3. seal a test message to that address (mode "mlkem") and open it with the local keys
 * Also checks whether the browser may call api-testnet.qore.host directly (CORS).
 * Everything is logged on the page. The seed is a TESTNET-ONLY throwaway.
 */
import { buildRegisterKemKeyMessage, generateSealKeys, open, sealKeysFromSeed, type SealKeyPair } from "@qorechain/qoreseal";
import { fetchKemKey, sealToAddresses } from "@qorechain/qoreseal/network";
import { useRef, useState } from "react";

const CHAIN_ID = "qorechain-diana";
const PURPOSE = "tabella-v1";
const DIRECT_REST = "https://api-testnet.qore.host";
// Same-origin path forwarded to the REST API (vite.config.ts in dev, vercel.json when deployed).
const PROXY_REST = `${window.location.origin}/lcd-testnet`;
const SEED_KEY = "tabella.spike.seed";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const short = (h: string) => (h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h);
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e));

function loadKeys(): SealKeyPair | undefined {
  try {
    const s = localStorage.getItem(SEED_KEY);
    return s ? sealKeysFromSeed(unb64(s)) : undefined;
  } catch {
    return undefined;
  }
}

export function KemSpike() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const keys = useRef<SealKeyPair | undefined>(loadKeys());
  const address = useRef<string | undefined>(undefined);
  const lines = useRef<string[]>([]);

  const say = (msg: string) => {
    lines.current = [...lines.current, `${new Date().toLocaleTimeString()}  ${msg}`];
    setLog(lines.current);
  };
  const run = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(true);
    say(`--- ${name}`);
    try {
      await fn();
    } catch (e) {
      say(`ERROR: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const checkCors = async () => {
    for (const [label, base] of [["direct (browser -> api-testnet.qore.host)", DIRECT_REST], ["via same-origin proxy", PROXY_REST]] as const) {
      try {
        const r = await fetch(`${base}/cosmos/base/tendermint/v1beta1/node_info`);
        say(`CORS ${label}: HTTP ${r.status} ${r.ok ? "OK, readable" : ""}`);
      } catch (e) {
        say(`CORS ${label}: BLOCKED (${errText(e)})`);
      }
    }
  };

  const makeKey = run("1. Make opening key", async () => {
    const k = generateSealKeys();
    localStorage.setItem(SEED_KEY, b64(k.seed));
    keys.current = k;
    say(`seed saved to localStorage (${k.seed.length} bytes); ML-KEM-1024 public key ${k.mlkemPublicKey.length} bytes`);
    say(`public key starts ${b64(k.mlkemPublicKey).slice(0, 24)}…`);
    await checkCors();
  });

  const register = run("2. Register with QoreX", async () => {
    if (!keys.current) throw new Error("Make an opening key first (button 1).");
    const native = window.qorex?.native;
    if (!native) throw new Error("window.qorex.native not found: open this page in a browser with QoreX installed.");
    say(`QoreX native capabilities: ${native.capabilities.join(", ") || "(none)"}`);
    await native.enable(CHAIN_ID);
    const key = await native.getKey(CHAIN_ID);
    address.current = key.bech32Address;
    say(`connected QoreX address: ${key.bech32Address}`);
    const msg = buildRegisterKemKeyMessage({ sender: key.bech32Address, mlkemPublicKey: keys.current.mlkemPublicKey });
    say(`built ${msg.typeUrl} (${msg.value.length} bytes); asking QoreX to sign + broadcast…`);
    const res = await native.signAndBroadcast({ chainId: CHAIN_ID, messages: [msg], memo: "Tabella spike: register opening key" });
    say(`QoreX result: tx ${res.txHash}  code ${res.code}  height ${res.height ?? "?"}  shield ${res.shield}`);
    say(`explorer: https://explore.qore.network/tx/${res.txHash}`);
    if (res.code !== 0) throw new Error(`transaction failed with code ${res.code}`);
    for (let i = 1; i <= 20; i++) {
      const st = await fetchKemKey({ rest: PROXY_REST, address: key.bech32Address });
      if (st.registered) {
        const same = st.publicKey && b64(st.publicKey) === b64(keys.current.mlkemPublicKey);
        say(`fetchKemKey: registered=true ${st.algorithmName ?? ""} height ${st.registeredHeight ?? "?"}; matches local key: ${same}`);
        return;
      }
      say(`poll ${i}/20: not registered yet…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("key still not registered after 60 s");
  });

  const sealAndOpen = run("3. Seal & open", async () => {
    if (!keys.current) throw new Error("Make an opening key first (button 1).");
    if (!address.current) {
      const native = window.qorex?.native;
      if (!native) throw new Error("Connect QoreX first (button 2).");
      address.current = (await native.getKey(CHAIN_ID)).bech32Address;
    }
    const text = `Hello from Tabella, sealed ${new Date().toISOString()}`;
    say(`sealing to ${address.current} (mode mlkem, purpose ${PURPOSE})`);
    const envelope = await sealToAddresses({
      rest: PROXY_REST,
      chainId: CHAIN_ID,
      purpose: PURPOSE,
      mode: "mlkem",
      plaintext: new TextEncoder().encode(text),
      recipients: [{ address: address.current }],
    });
    say(`envelope ${envelope.length} bytes; first bytes ${b64(envelope).slice(0, 24)}…`);
    const plain = open({ chainId: CHAIN_ID, purpose: PURPOSE, envelope, keys: keys.current });
    const out = new TextDecoder().decode(plain);
    say(`opened: "${out}"`);
    say(out === text ? "RESULT: round trip OK" : "RESULT: MISMATCH");
  });

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Tabella spike #3 (temporary)</h1>
      <p>Opening key → QoreX registration → seal &amp; open. Testnet <code>{CHAIN_ID}</code> only.</p>
      <p>Saved seed: {keys.current ? "yes (in localStorage)" : "none yet"}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={makeKey}>1. Make opening key</button>
        <button disabled={busy} onClick={register}>2. Register with QoreX</button>
        <button disabled={busy} onClick={sealAndOpen}>3. Seal &amp; open</button>
      </div>
      <pre style={{ background: "#111", color: "#d6f5d6", padding: 12, marginTop: 16, whiteSpace: "pre-wrap", wordBreak: "break-all", minHeight: 200 }}>
        {log.length ? log.join("\n") : "Log appears here."}
      </pre>
    </main>
  );
}
