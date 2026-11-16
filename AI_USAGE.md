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
