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
