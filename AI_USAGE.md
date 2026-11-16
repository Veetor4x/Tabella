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

## 2026-11-16 (UI piece 1 of 4: look and feel + the owner's flow)
- **Generated:** the whole `app/src` interface (paper/wax-red design system, 5 one-per-screen steps with progress dots, the sealing animation and "Sealed." screen), `lib/` (address handling, sealing glue on top of `shared/tabella-crypto.ts`, helper client with friendly errors), 29 tests, and `e2e/owner-flow.cjs` (drives it at iPhone width and seals a real letter).
- **I decided:** demo names (Mia, Leo, Sofia), the step order and copy, 3/6/12 months + a hidden 2-minute demo, paste-an-address for now, "Ready ✓", the Render helper as the relay.
- **Claude chose:** a 14-day countdown after the quiet period; 5 taps on the hourglass (or `?demo`) reveal the demo timer; the guardian card is made at sealing time; cards shown as text codes for now (QR/print comes with the cards piece).
- **Found by looking at screenshots, not by the checks:** tagline crowding the wordmark, a tap-highlight wash on the choice cards, addresses cut off in their field. Found by tests: viem's `getAddress` does not verify a mixed-case checksum (a typo would have passed), now checked.

## 2026-11-16 (UI: the "lively" pass)
- **Generated:** Framer Motion throughout the owner's flow: frosted-glass cards over a drifting warm background, sliding steps (forward and back differ), a gliding progress pill, squishy buttons, tilting choice cards, the people stack, the filling hourglass, the sealing ceremony (fold, envelope, wax drop, stamp, ripple, shake, optional thud), and sparkles on success. `ui/motion.ts` holds every preset.
- **I decided:** the list of effects, glass + warm identity, sound off by default, no wording or sealing-logic changes.
- **Claude chose:** how to keep to "transform and opacity only" (focus glow and selected-card frame are always drawn and fade in; the letter box resizes instantly while a glass plate eases behind it), a test that enforces the rule on presets, inline props and CSS, and the calm reduced-motion version.

## 2026-11-16 (UI: the "mature and premium" redesign)
- **I decided:** replace the playful look with the reference's: pearl background with soft drifting iridescent light, frosted glass, thin line icons, an editorial serif (Instrument Serif) with a clean sans (Inter), wax-red only on the seal and the main button, a matching night mode for the sealed state; no emoji or sparkles; one conversational question per screen; the letter as a map; one soft low tone (off by default).
- **Claude did:** rewrote `app/src/ui`, the steps and `styles.css`: headlines rise word by word through masks, a big 01-05 number that rolls, finished steps shrink into pills ("Letter · 53 words", "2 people"), a blurred empty card that cross-fades into the person's card then "Ready", the map (lines draw by growing, a slow shimmer while sealing), a dark veil into night where people become glowing points around the seal. Added an optional first-name field (used in "Alex, who should read this one day?"). Replaced the thud with a single sine tone. Sealing logic untouched. New tests: no emoji (screens and source), updated no-crypto-words and motion rules; e2e rewritten (also run with reduced motion).
- **How "transform and opacity only" is kept:** lines are thin divs that scale, "sharpening" is a cross-fade of a statically blurred layer, the pill "shrink" is scale + y (an approximation of a true shared-element morph; real morph from the card's exact position is not done).
- **Found by looking, not by checks:** the background streaks were hidden behind the body's own background; the night page showed light below the first screen height; the guardian node was clipped and its label overlapped another.
- **Real letters made by e2e runs:** #11, #12, #13 (reduced motion), #14 on testnet.

## 2026-11-16 (flat background + logo concepts)
- **I decided:** drop the drifting gradients for a flat pearl with a very faint paper grain (deep ink at night, no movement), glass kept but subtler (thin border, soft shadow, light blur); three wordmark concepts for "tabella" (A tablet "ll", B seal bowl "b", C envelope-flap "e"), none applied.
- **Claude did:** CSS/Background change (static SVG-noise grain, no animation), SVG concepts generated by a small script (letters drawn from rectangles and circles, so they are not a font), wordmark on pearl and ink plus an app icon each, in `brand/logo-concepts/` with a comparison sheet.
- **Note:** the inspiration images were not visible to Claude in the message, so the concepts follow the written brief only.

## 2026-11-16 (logo concepts, round 2)
- **I decided:** the first three were not creative enough; six new directions (split tablet, stacked block, keyhole a, two figures, stencil, a wildcard), starting from a real free-licence typeface, shown on ink with app icons, none applied.
- **Claude did:** picked League Spartan ExtraBold (OFL 1.1), converted the glyph outlines to paths with opentype.js and cut them with a script (`brand/logo-concepts-2/generate.cjs`); the wildcard ("sealed, then opened": first a closed with wax, last a open) is Claude's idea.
- **Note:** the inspiration images did not reach Claude again; the concepts follow the written description.
