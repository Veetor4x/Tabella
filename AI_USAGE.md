# AI usage log

For the Best AI-Native Build award. Tool: Claude Code. Format: what the AI generated, and what I changed or decided.

## 2026-11-15
- **Generated:** `docs/BRIEF.md` saved from my project brief; scaffolded `contracts/` (foundry) and `app/` (viem-wagmi) with `create-qorechain-dapp`; `.gitignore` additions; `.env.example`; `spike/` placeholder.
- **I decided:** the project scope, architecture, build order and security rules (all in the brief); allowlisted `binaries.soliditylang.org` and `github.com` for the build environment.
- **Notes:** the first `forge build` was blocked by the network allowlist until I changed it. After that, `forge build` and `forge test` (3 template tests) pass, and `npm run build` passes in `app/`. Forge came from the `@foundry-rs/forge` npm package (not installed on PATH by default here).

## 2026-11-16
- **Generated:** `spike/01-helper-setup.ts` (helper account: addresses, balance, ML-DSA-87 registration via `ensurePqcRegistered`, EVM window open + status) and `spike/package.json`.
- **I decided:** scope = risky-part test #1 only; helper mnemonic comes from the environment and is never printed.
- **Notes:** the SDK's preset RPC host doesn't resolve, so Claude switched the broadcast to REST with offline signing; hybrid signing also needed `resolveSignBytesVersion`.
- **Generated (test #2):** `contracts/src/spike/PqcProbe.sol`, `spike/02-pqc-verify.ts`, and `spike/common.ts` (shared REST tx client + window helper, refactored out of 01).
- **I decided:** keep the probe tiny (check/act/keyStatus only); test with a tampered signature to prove false-not-revert.
- **Generated (test #3):** `app/src/spike/KemSpike.tsx` (temporary `/#spike` page), hash route in `main.tsx`, `app/vercel.json` REST rewrites.
- **I decided:** treat the QoreX registration as a manual check; CORS answer drives the need for a REST proxy in production.

## 2026-11-16 (build step 2)
- **Generated:** `contracts/src/TabellaRegistry.sol` (section 6 of the brief), `contracts/test/TabellaRegistry.t.sol` (54 tests incl. 1 fuzz), `contracts/test/mocks/MockPqc.sol`; installed forge-std as a submodule; turned on `via_ir` (createLetter has 9 params).
- **I decided:** the brief's contract design (key hashes, signed message, 2-pause cap, timestamps only). Claude chose: string action names in the signed message, `letterId = letterCount + 1` starting at 1, create signs nonce 0, `heirKeyReady` returns `(registered, algorithmId)`.
- **Notes:** the mock "verifies" with sig == keccak256(pubkey ++ message); real ML-DSA-87 verification was proven on testnet in spike 02.

## 2026-11-16 (build step 3, part 1)
- **Generated:** `shared/tabella-crypto.ts` (brief section 7) + 28 Vitest tests; `contracts/test/{Fixtures,ExportVectors,LibSignature}.t.sol`; `shared/scripts/` fixture generator; vector files in `shared/test-vectors/`; updated the environment setup script (forge-std via `git submodule update --init`).
- **I decided:** the library's shape (functions, 12-byte nonce + tag layout, A xor B split) and the test list from the brief.
- **Claude chose:** card code = `tbl1_` + base64url(32-byte seed + 4-byte checksum) so typos are caught; `sealPartB` also accepts an array (Postman re-seals B to the heirs); 32-byte seeds only (both ML-DSA-87 and QoreSeal need exactly 32).
- **Checked:** deliberately changed the domain string in TS and then in Solidity; both are caught by the cross-checked vectors.

## 2026-11-16 (build step 3, part 2: helper relay)
- **Generated:** `helper/` (Hono relay + /health, strict zod validation, per-IP and global rate limits, simulate-first, automatic EVM window reuse/reopen, one-at-a-time queue), 78 Vitest tests against a mocked chain, and `scripts/deploy-and-relay.ts` (real testnet run).
- **I decided:** only four calls relayed; refuse anything that would revert; bigger demo-day window; no Postman yet.
- **Claude chose:** the `{fn, args, pubkey, sig}` request shape; trusted-proxy-hops rule for X-Forwarded-For (rightmost entry); 25% gas headroom, fee = min(2 x gas price, 250 gwei); small module split instead of the single relay.ts/chain.ts in the brief's tree.
- **Learned from the real run:** createLetter costs ~4.2M gas (envelopes are stored on-chain), so the per-tx cap default went from 6M to 12M; the EVM window charges gasLimit x maxFee against its value budget but the account is only charged actual use.

## 2026-11-16 (build step 3, part 3: the Postman)
- **Generated:** `helper/src/postman.ts` (release loop), `postmanKeys.ts` (opening key from HELPER_MNEMONIC + on-chain registration), `submit.ts` (the simulate-first pipeline, extracted so /relay and the Postman share it), a native-lane client reusable for any account, 31 new tests, and `scripts/e2e-postman.ts` (real heirs, guardian pauses, release, both heirs open the letter).
- **I decided:** the Postman key comes from HELPER_MNEMONIC (no new secret), a 20 s loop, safe retries, never publish twice.
- **Claude chose:** a fixed non-secret BIP-39 passphrase for key separation; layered "never twice" (contract + simulate-first + reading the on-chain flag + backoff + no overlapping ticks); waiting for all heirs' keys with a 30-minute grace before sealing to a subset; `postmanAbi` kept separate from `registryAbi` so /relay can never encode publishPartB.
- **Result:** E2E passed on testnet; Released -> Part B published in 13 s. Found along the way: letter #1 (made by the earlier deploy script) is sealed to a throwaway Postman key, so the Postman now marks such letters can't-open, logs once and stops (checked on the live registry: 1 log line, 0 txs over 6 ticks). A hybrid-signed `MsgRegisterKEMKey` is accepted by the chain for ordinary accounts, which settles the open question from the QoreX test: the registry path itself works.

## 2026-11-16 (Render: free plan)
- **I decided:** free Render plan instead of Starter; a sleeping helper may delay a release, and that is documented.
- **Claude did:** made `postman.start()` an awaited, reported catch-up pass (one full tick before the first 20 s wait), 7 tests (checked by breaking it: all 7 fail), logged at startup; README + render.yaml notes on the free-plan sleep.
