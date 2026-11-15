# AI usage log

For the Best AI-Native Build award. Tool: Claude Code. Format: what the AI generated, and what I changed or decided.

## 2026-11-15
- **Generated:** `docs/BRIEF.md` saved from my project brief; scaffolded `contracts/` (foundry) and `app/` (viem-wagmi) with `create-qorechain-dapp`; `.gitignore` additions; `.env.example`; `spike/` placeholder.
- **I decided:** the project scope, architecture, build order and security rules (all in the brief); allowlisted `binaries.soliditylang.org` and `github.com` for the build environment.
- **Notes:** the first `forge build` was blocked by the network allowlist until I changed it. After that, `forge build` and `forge test` (3 template tests) pass, and `npm run build` passes in `app/`. Forge came from the `@foundry-rs/forge` npm package (not installed on PATH by default here).
