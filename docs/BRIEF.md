# TABELLA — Claude Code Project Brief

## 0. How to work with me
Solo builder (GitHub: Veetor4x), intermediate. Explain briefly, keep code readable, no over-engineering.
Short sessions. HARD STOP: everything working on testnet by Nov 30, 2026. Dec 1–2 = buffer only.
Build one component at a time, run it, test it, then move on. Prefer simple and working over clever.
If something is mocked, say so clearly and list it in README "What's mocked".
Log AI use as we go in AI_USAGE.md (what you generated, what I changed/decided). This is for the Best AI-Native Build award.
All names, examples and copy are global/international. Demo people: Alex (owner), Mia and Leo (loved ones), Sofia (guardian).

## 1. Project
Name: Tabella. Tagline: "Sealed today. Opened when it matters."
One-line pitch: A quantum-safe sealed letter: write words for your loved ones today; it opens only for them, only if you go quiet, and stays sealed even against future quantum computers.
Letters only. No money, tokens, vaults or asset transfers anywhere (keeps us clearly different from Perennial and ZeroHour).
Name story: Roman wills were written on wax tablets (tabellae), sealed, and opened only after death.

## 2. Hackathon rules that affect the build
QoreChain "Build Before Q-Day" Developer Fest. Track: Encrypted Apps ("post-quantum encryption for QoreChain-addressed recipients", ML-KEM-1024 lock to address).
Deadline: 2 Dec 2026, 23:59 UTC (our target: Nov 30).
Must be built during the event (Nov 4 – Dec 2). Official kits/templates allowed if credited in README.
Submission: public GitHub repo, README, featured image, video ≤ 3 min, testnet address(es) used, Apache-2.0 LICENSE, README credits for all libraries/kits/templates.
Network: testnet qorechain-diana only (EVM chain ID 9800). PQC precompiles are active on testnet, NOT on mainnet.
REST: https://api-testnet.qore.host · EVM RPC: https://evm-testnet.qore.host · Explorer: https://explore.qore.network · Faucet: dashboard.qorechain.io
Fest feature tags to hit: QoreSeal + encryption key registry · Solidity PQC signature check · Solidity PQC key status · PQC key registration · Hybrid ML-DSA-87 transactions.

## 3. Verified platform facts (from official npm packages, Nov 15 — re-verify if anything fails)
- `@qorechain/qoreseal` 0.1.0: seal, open, sealKeysFromSeed, generateSealKeys, recipientOf, buildRegisterKemKeyMessage({sender, mlkemPublicKey}) (/qorechain.pqc.v1.MsgRegisterKEMKey); `@qorechain/qoreseal/network`: fetchKemKey, fetchMlkemPublicKey, resolveRecipient({..., mode: "mlkem"}), sealToAddresses. Multi-recipient envelopes. Use mode: "mlkem" (ML-KEM-1024 only, no recipient card needed). Seal/open take chainId + purpose (use purpose "tabella-v1").
- `@qorechain/pqc` 0.2.3: mldsa.keygen(seed?), mldsa.sign(sk, msg) (deterministic default), mldsa.verify, mlkem, shake256.
- `@qorechain/evm` 0.14.0: precompiles.pqcVerify, precompiles.pqcKeyStatus, PRECOMPILE_ADDRESSES, IQORE_PQC_ABI, qorechainTestnet, evmWindowStatus, openEvmWindowMessage, classifyEvmWindowRejection.
  - `pqcVerify(bytes pubkey, bytes signature, bytes message) view returns (bool)` at `0x0000000000000000000000000000000000000A01`
  - `pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey)` at `0x0000000000000000000000000000000000000A02`
- `@qorechain/sdk` 0.14.0: deriveEvmAccount(mnemonic), signAndBroadcastHybrid, ensurePqcRegistered, openEvmWindowMsg, fetchEvmWindow.
- Every EVM tx needs the sender to have a registered ML-DSA-87 key AND an open EVM authorisation window (opened by a hybrid-signed native-lane message).
- QoreX wallet today: EVM signing (eth_sendTransaction, personal_sign) and signArbitrary are NOT supported. Native `window.qorex.native.signAndBroadcast({chainId, messages})` IS supported. No accountsChanged events (use `qorexWallet({ pollAccountsOnFocus: true })`).
- Templates: `npx create-qorechain-dapp <name> --template foundry` and `--template viem-wagmi`.

## 4. Architecture
```
Browser app (Vite+React+wagmi)            Helper service (Node+Hono, Render)       qorechain-diana
───────────────────────────────           ──────────────────────────────────       ───────────────
Owner writes letter → AES-256-GCM(K)
K = A XOR B
seal A → all heirs (one QoreSeal envelope)
seal B → Postman's ML-KEM key
ML-DSA-87 sign(action) with owner key ──► POST /relay {fn, args, pubkey, sig} ──►  TabellaRegistry
                                           (testnet account: registered ML-DSA       ├ pqcVerify  0x0A01
                                            key + open EVM window, pays gas)         ├ pqcKeyStatus 0x0A02
Heir/guardian: connect QoreX once ───── native signAndBroadcast(MsgRegisterKEMKey) ─► KEM key registry
                                           Postman loop: status == Released?   ◄──  events
                                           → open B, seal B → heirs,
                                             publishPartB(letterId, envelope)  ──►
Heir: open A + open B → K → letter  ◄──── read from chain
```
Helper service = relayer (sends all contract txs, users never pay gas) + the Postman (release helper).
The Postman can delay a release but cannot read a letter (only has B) and cannot fake a check-in (needs owner's ML-DSA signature, verified on-chain). Say this honestly in README. Roadmap: Part B held by guardians/threshold.

## 5. Keys & cards (people never see the word "key")
| Person | What the app creates (in browser) | Printable card (QR = 32/64-byte seed, base64url) |
|---|---|---|
| Owner (Alex) | ML-DSA-87 keypair from seed | "Your I'm-still-here card" |
| Heir (Mia, Leo) | ML-KEM-1024 seal keys from seed (sealKeysFromSeed); public key registered on-chain via QoreX | "Your opening card" |
| Guardian (Sofia) | ML-DSA-87 keypair from seed | "Your guardian card" |

- Seeds kept in localStorage AND exported as a printable card (QR + short text code) + download.
- Mandatory gentle step after creating any card: "Keep this safe, like a spare house key." with checkbox "I've saved or printed it" before continuing.
- "Restore from card" screen: scan QR / paste code → same keys back on a new device.
- Owner safety rule: losing the owner's device must NEVER release the letter early. Owner restores from the I'm-still-here card and checks in; guardian can pause; there is always a Warning period before release.

## 6. Contract: TabellaRegistry.sol (Solidity, Foundry)

State per letter:
- ownerKeyHash (keccak256 of owner ML-DSA pubkey), guardianKeyHash (0 if none), heirs (QoreChain 0x addresses), quietPeriod, warningPeriod (seconds), lastCheckIn (timestamp), pausesUsed (max 2), nonce, cancelled, released
- letterCiphertext (bytes, AES-GCM, short text letters only), partAEnvelope (bytes), partBForPostman (bytes), partBForHeirs (bytes, set on release)

Functions (all owner/guardian actions carry pubkey + sig; contract checks keccak256(pubkey) == storedHash then pqcVerify(pubkey, sig, message)):
- `createLetter(heirs, guardianKeyHash, quietPeriod, warningPeriod, letterCiphertext, partAEnvelope, partBForPostman, ownerPubkey, sig)`
- `checkIn(letterId, ownerPubkey, sig)` → lastCheckIn = block.timestamp, works in Active AND Warning
- `guardianPause(letterId, guardianPubkey, sig)` → resets clock; only before Released; max 2 pauses per letter
- `cancel(letterId, ownerPubkey, sig)` → before Released only
- `status(letterId)` view → Active / Warning / Released / Cancelled, timestamps only, never block numbers:
  - Active: now < lastCheckIn + quietPeriod
  - Warning: now < lastCheckIn + quietPeriod + warningPeriod
  - Released otherwise
- `publishPartB(letterId, envelope)` → only postman address, only when status == Released, only once
- `heirKeyReady(address)` view → wraps pqcKeyStatus (show "quantum-safe ✓" badge)

Events: Created, CheckedIn, Paused, Cancelled, PartBPublished

Signed message (prevents replay): `abi.encode("TABELLA_V1", block.chainid, address(this), letterId, action, nonce, keccak256(payload))`; nonce++ after each action.

Security basics: access control on publishPartB/setPostman (owner-of-contract), input validation (heirs 1–3, periods > 0, size caps on bytes), checks-effects-interactions, no ETH handling at all. Store key hashes, not 2.5 KB pubkeys. Demo letter uses quietPeriod = 120 s, warningPeriod = 60 s.

Tests: precompiles don't exist in local Foundry → deploy a mock at 0x0A01/0x0A02 with vm.etch (mock calls a real ML-DSA verify is not possible in EVM, so mock returns true only for a fixture signature). Test: create, check-in resets, Warning, guardian pause + max-2 cap, cancel, release by time warp (vm.warp), publishPartB access + once-only, replay rejected, wrong key rejected. Then one real pqcVerify call on testnet in the risky-parts test.

## 7. Shared crypto lib (shared/tabella-crypto.ts, used by app + helper)
- makeContentKey(), encryptLetter(K, text) / decryptLetter (AES-256-GCM, WebCrypto)
- splitKey(K) → {A, B} (B random 32 bytes, A = K XOR B), joinKey(A, B)
- sealPartA(A, heirMlkemPubkeys), sealPartB(B, postmanPubkey), openPart(envelope, sealKeys) (QoreSeal, mode: "mlkem", purpose "tabella-v1", chainId "qorechain-diana")
- actionMessage(...), signAction(seed, message) (ML-DSA-87 via @qorechain/pqc)
- cardEncode(seed) / cardDecode(code)
- Unit tests (Vitest): full round trip; heir with only A fails; Postman with only B fails; wrong heir fails.

## 8. MVP features

**MUST (demo-critical)**
- Owner writes and seals a letter to 1–2 heirs (Part A to heirs, Part B to Postman), wax-seal animation.
- Cards: owner I'm-still-here card, heir opening card, guardian card; printable with QR; "spare house key" step; restore from card.
- "I'm still here" check-in (pqcVerify on-chain).
- Guardian "They're okay" pause: 1 guardian, 1 button (pqcVerify, max 2 pauses).
- Timestamp release Active → Warning → Released (2-min demo timer) + countdown ring.
- Postman publishes Part B; heir opens: seal-crack animation, letter appears. Before release: "Still sealed 💛".
- Heir registers opening key via QoreX (MsgRegisterKEMKey via signAndBroadcast) + pqcKeyStatus/registry "ready" badge.

**NICE (only if MUST is done)**
Cancel during Warning in UI (contract function is MUST, UI is NICE) · reminder emails · Handles (@ada) · large-text mode toggle · invite-by-link polish

**CUT**
Voice notes/photos · editing a sealed letter · "any 2 of 3" · auto check-in from chain activity · mainnet · anything involving money

## 9. UI & wording rules
One step per screen, progress dots, big buttons, mobile first, warm paper background, wax-red accent, calm serif headings.
Never show: ML-KEM, ML-DSA, ciphertext, key, gas, wallet jargon. Say: "sealed", "only they can open it", "opening card", "I'm-still-here card", "the Postman".
Flow: 💌 Write → 👨‍👩‍👧 Who should open it? → 🛡️ A guardian → ⏳ When should it open? → 🔏 Seal it → 🙋 I'm still here.
Copy:
- "Write something they'll want to read one day."
- "Sealed. Only Mia and Leo can open this, even with future super-computers."
- "Hi! Tap to let us know you're okay 💛"
- "Your letter is still safely sealed."
- "Keep this safe, like a spare house key."

Motion: envelope folds, wax seal stamps, countdown ring, seal cracks open. Respect prefers-reduced-motion. Screen-reader labels, high contrast.

## 10. File structure
```
tabella/
├─ contracts/            # from create-qorechain-dapp --template foundry
│  ├─ src/TabellaRegistry.sol
│  ├─ test/TabellaRegistry.t.sol  (+ test/mocks/MockPqc.sol)
│  └─ script/Deploy.s.sol
├─ shared/tabella-crypto.ts (+ tabella-crypto.test.ts)
├─ helper/               # Node + Hono: relay + Postman
│  └─ src/{index.ts, relay.ts, postman.ts, chain.ts}
├─ app/                  # from --template viem-wagmi
│  └─ src/{pages/, components/, lib/}
├─ spike/                # risky-parts test scripts (keep, document in AI_USAGE.md)
├─ README.md  AI_USAGE.md  LICENSE (Apache-2.0)  .env.example
```

## 11. Environment variables (names only — never commit real values; .env in .gitignore)
- QORE_CHAIN_ID=qorechain-diana, QORE_REST_URL, QORE_EVM_RPC_URL
- HELPER_MNEMONIC (new testnet-only account, faucet-funded; never a real wallet)
- POSTMAN_SEAL_SEED (Postman's ML-KEM seed)
- REGISTRY_ADDRESS, POSTMAN_ADDRESS
- VITE_HELPER_URL, VITE_REGISTRY_ADDRESS, VITE_POSTMAN_MLKEM_PUBKEY, VITE_WALLETCONNECT_PROJECT_ID (if RainbowKit needs it)

## 12. Security rules
Testnet and test wallets only. Never ask me for, print, or log private keys, seed phrases or mnemonics. I will put them in .env myself.
Demo letters use fake data. In-app tip: "Write where things are, not passwords or recovery phrases."
Relay endpoint: validate inputs, size limits, simple rate limit; relayer only calls TabellaRegistry functions.
README "Honest limits": Postman is trusted for liveness only; QoreSeal is v0.1 pending external review; losing a card = losing access; QoreX EVM signing not yet available, hence the relayer.

## 13. Build order
- **Nov 15–16 — Risky-parts test (go/no-go by Nov 17):** scaffold both templates; helper account → faucet → ensurePqcRegistered → open EVM window; deploy tiny contract calling pqcVerify with a browser-made ML-DSA-87 signature → expect true; register a KEM key via QoreX signAndBroadcast and do a QoreSeal seal/open round trip to that address. If EVM path fails → tell me immediately (fallback: CosmWasm via QoreX native).
- **Nov 18–20** — TabellaRegistry + Foundry tests.
- **Nov 21–23** — shared/tabella-crypto.ts + Vitest; helper /relay.
- **Nov 24–25** — Postman loop; first full testnet end-to-end (script, no UI).
- **Nov 26–28** — UI flow, cards with QR, animations, mobile.
- **Nov 29** — README, AI_USAGE.md, LICENSE, credits, deploy (Vercel app, Render helper).
- **Nov 30** — demo video + submit.

## 14. "Done" criteria for the demo
- [ ] Alex seals a letter to Mia & Leo with Sofia as guardian; tx visible on explorer with contract address.
- [ ] Mia's account shows "ready / quantum-safe ✓" after registering her opening key through QoreX.
- [ ] Mia tries to open early → "Still sealed 💛" (she has A but not B).
- [ ] Alex checks in → timer resets (pqcVerify succeeded on-chain).
- [ ] Sofia taps "They're okay" → timer resets; third pause is refused.
- [ ] Alex "loses his phone": restores from I'm-still-here card on another browser and checks in.
- [ ] No check-in → Warning → Released after demo timer; Postman publishes Part B automatically.
- [ ] Mia opens: seal cracks, letter appears.
- [ ] Foundry + Vitest tests pass; README, AI_USAGE.md, Apache-2.0 LICENSE, credits, testnet addresses listed.
