<p align="left"><img src="app/public/seal.png" alt="" width="44" height="44" align="absmiddle"> <span style="font-size:34px"><b>Tabella</b></span></p>

**Sealed today. Opened when it matters.**

Tabella is a quantum-safe sealed letter for the people you love. You write it today; it opens only for them, and only if you go quiet for a long time or on a date you choose. It stays sealed even against future quantum computers.

Built for the QoreChain **Build Before Q-Day** Developer Fest, track **Encrypted Apps**.

- **Live app:** https://tabella-veetor4x.vercel.app
- **Helper (relayer + Postman):** https://tabella-helper-oecu.onrender.com/health
- **Demo video:** [link]
- **Network:** QoreChain testnet `qorechain-diana` (EVM chain ID 9800)

> The name comes from the Roman *tabellae*: wax tablets on which wills were written, sealed by witnesses, and opened only after death.

---

## The problem

People leave things unsaid, and locked away. When someone dies or can no longer speak, their family often doesn't know what they wanted, where things are, or what they never got to say. In crypto it's worse: if nobody knows where the wallet is, it can be lost for good.

A letter meant to be read in 20 years also has to survive 20 years of progress. Data recorded today can be stored and broken later by quantum computers ("harvest now, decrypt later"). A letter that sits on a public network for decades needs protection built for that.

## The solution

Tabella lets anyone, with no crypto knowledge, write a letter, choose who can read it, and seal it.

1. **Write** a letter: words for them, and where things are.
2. **Choose who opens it**, either as a surprise or by inviting them.
3. **Add a guardian** (optional): someone who can say "They're okay" if you're just ill or away.
4. **Choose when it opens**: *if I go quiet* for 3, 6 or 12 months, or *on a date* (a birthday, a wedding).
5. **Seal it.** The letter is locked on your phone before it leaves.
6. **Tap "I'm still here"** every so often. The timer resets.
7. **If you go quiet**, Tabella releases it and finds them, and only they can open it.

No crypto words anywhere in the app: people see "sealed", "your opening card", "I'm still here".

## Two ways to send

| | **Keep it a surprise** (default) | **Invite them** |
|---|---|---|
| Do they know? | No, not until it opens | Yes |
| Setup | You add their email and a private question only they can answer | They make their own opening card first |
| When it opens | Tabella emails them (then their backups, if they don't respond) | They open it with their card |
| How they unlock it | They answer the question from memory | Their opening card |

Backups (up to 3) get their own private question and can help the recipient receive the letter if they can't be reached.

## How it stays safe

- **Sealed on your device.** The letter is encrypted in the browser (AES-256-GCM) before anything is sent. Tabella never sees the words.
- **Two halves of one key.** The letter's key is split: `K = A ⊕ B`.
  - **Part A** is sealed to each recipient with **ML-KEM-1024** (QoreSeal, locked to their QoreChain address).
  - **Part B** is sealed to the **Postman** (our delivery helper).
  - Recipients hold A from day one but can't open the letter early. The Postman holds only B, so it can never read the letter.
- **Released by the contract, not by us.** `TabellaRegistry` tracks each letter's state with timestamps (Active → Warning → Released). Only after the contract says *Released* does the Postman re-seal Part B to the recipients.
- **Your check-ins are verified on-chain.** Every create, check-in, guardian pause and cancel carries an **ML-DSA-87** signature that the contract checks with QoreChain's **`pqcVerify`** precompile. The relayer that pays gas cannot fake a check-in.
- **Guardians can pause, not open.** A guardian's pause is also ML-DSA-verified, limited to 2 pauses per letter.

## QoreChain features used

- **QoreSeal + the encryption key registry:** ML-KEM-1024 sealing to recipients' registered keys (`MsgRegisterKEMKey`, `fetchKemKey`, `seal`/`open`).
- **Solidity PQC signature check:** `pqcVerify` precompile (`0x…0A01`) inside `TabellaRegistry`.
- **Solidity PQC key status:** `pqcKeyStatus` precompile (`0x…0A02`).
- **PQC key registration:** ML-DSA-87 and ML-KEM-1024 key registration for the helper, recipients and the Postman.
- **Hybrid ML-DSA-87 transactions** and the **EVM authorisation window**, via `@qorechain/sdk` and `@qorechain/evm`.

## Architecture

```
Browser (Vite + React)                 Helper on Render (Node + Hono)            qorechain-diana
──────────────────────                 ──────────────────────────────            ───────────────
write letter → AES-GCM(K)
K = A ⊕ B
seal A → recipients (ML-KEM-1024)
seal B → Postman   (ML-KEM-1024)
sign action (ML-DSA-87)          ──►   /relay: validate, simulate,        ──►   TabellaRegistry
                                       send (pays gas, EVM window)               ├ pqcVerify    0x0A01
recipient keys registered        ──────────────────────────────────────►        ├ pqcKeyStatus 0x0A02
(no-wallet path, /fund pays fee)                                                 └ events
                                       Postman: watch for Released       ◄──
                                       open B → re-seal to recipients
                                       publishPartB                      ──►
                                       email ladder (Resend) + Postgres
recipient: open A + B → K → letter
```

## Tech stack

- **Contracts:** Solidity, Foundry (from the `create-qorechain-dapp` `foundry` template)
- **App:** Vite, React, TypeScript, Framer Motion (from the `viem-wagmi` template)
- **Crypto:** `@qorechain/qoreseal`, `@qorechain/pqc`, WebCrypto (AES-256-GCM), Argon2id (`hash-wasm`) for answer locks, `jsQR`/`qrcode` for cards
- **Chain:** `@qorechain/sdk`, `@qorechain/evm`, viem
- **Helper:** Node, Hono, zod, Postgres (`pg`, delivery state), Resend (email); Twilio (text and call) is built but switched off
- **Hosting:** Vercel (app), Render (helper + Postgres)
- **Tests:** Vitest and Foundry; end-to-end scripts use Playwright

## Run it locally

See `contracts/README.md`, `app/README.md` and `helper/README.md` for exact commands (the helper's notes, endpoints and environment variables are in `helper/README.md`). In short:

```bash
git clone https://github.com/Veetor4x/Tabella && cd Tabella
git submodule update --init contracts/lib/forge-std

# contracts
cd contracts && forge build && forge test

# app
cd ../shared && npm install
cd ../app && npm install && npm run dev        # also: npm test, npm run build

# helper (needs a testnet-only mnemonic in .env, see .env.example)
cd ../helper && npm install && npm run dev    # also: npm test
```

Never put a real wallet's recovery phrase in `.env`. Use a testnet-only account.

## Testnet addresses

| What | Address |
|---|---|
| TabellaRegistry (current) | `0xbBC6d3eEE6f8472482d5a8860F4e2d65f4867aD0` |
| Helper / relayer / Postman (EVM) | `0xdD6fDb80C583Ee7a28d98EbaeFa1Cf280995f518` |
| Helper (native) | `qor1m4hahqx9s0h852xe36awlgw09qyetagc3ajfgp` |
| PqcProbe (pqcVerify test contract, spike 02, 16 Nov) | `0xa9231db415a62a25d657e8d8011d283f935e0bdf` (see `spike/README.md`) |
| Earlier registry versions | `0x48E4e0B4957d7C8ED6ac3d38cF45A7e5fa03b78D` (first dated version, abandoned), `0xC0808aF18e2283dFE4d026315a462349561fFd1c` (original, no exact-date option). Letter numbers only mean something within one version; the app reads all three. |

Explorer: https://explore.qore.network

## Testing

Counts below are from the current code.

- **Foundry (`cd contracts && forge test`): 84 tests** across 5 suites. `TabellaRegistry` unit and fuzz tests cover creation, check-ins, Warning and Released boundaries, guardian pauses (max 2), cancel, dated letters, `publishPartB` access and once-only, replay protection and wrong-key rejection. Real-size ML-DSA-87 signatures produced by the app's own library are run through the contract.
- **Vitest (`npm test` in each folder):** `shared/` 36 tests (the crypto library: full round trip, A alone, B alone and the wrong recipient all fail; card encoding; surprise locks), `helper/` 163 tests (relay validation, Postman, email ladder and its restarts, funding), `app/` 213 tests (no technical words on screen, motion rules, sky and theme, screens).
- **End to end on testnet** (`app/e2e/*.cjs`, `helper/scripts/e2e-postman.ts`): sealing, check-in, guardian pause, release, Postman delivery, both recipients opening, surprise delivery by email, and dated letters.

## Honest limits

- **Testnet only.** The PQC precompiles Tabella uses are active on `qorechain-diana`, not yet on mainnet.
- **The Postman is trusted for liveness.** It can delay a release, but it can't read a letter or fake a check-in. Roadmap: Part B held by guardians or a threshold so no single party is needed.
- **Fees are paid by the helper.** QoreX can't sign EVM transactions yet, so a relayer sends contract calls. Users never pay gas.
- **QoreX connection.** In QoreX v0.4.2 (during the event) the wallet was not available to websites: `window.qorex` was undefined, and another wallet extension threw "Cannot redefine property: ethereum". So recipients register keys through Tabella's own no-wallet path. The "Use QoreX instead" option appears only if a QoreX provider is really found (`window.qorex.native` or an EIP-6963 announcement from `network.qore.qorex`), so QoreX support switches on automatically when available. That path is untested against a live extension. See `docs/QOREX.md`.
- **Free hosting.** The helper runs on Render's free plan and may sleep; it catches up overdue deliveries within seconds of waking. The free database expires around 17 Dec 2026.
- **Email reaches only the project's own test address.** The sender is Resend's test sender (`onboarding@resend.dev`), which delivers only to the Resend account owner's address, so a loved one at any other address gets nothing today. Real users need a verified sending domain and `RESEND_FROM` set to an address on it. Text and call reminders are built but switched off.
- **Sound is partly missing.** The 17 sound effects exist; the website's own music and six voice lines of the Surprise film were blocked by ElevenLabs being busy on the free plan, so the music button is hidden and those lines are silent until they are made.
- **Surprise letters:** the private answer is the last lock on delivery, so it must be truly private.
- **Losing a card means losing that copy.** Print it or store it safely, like a spare house key.
- **Write where things are, never passwords or recovery phrases.**
- **QoreSeal is v0.1 and pending external review.** Tabella's own code has not been independently audited.

## Reminders for whoever runs this

- **The free Render Postgres `tabella-ladder` expires on 2026-12-17.** It holds the escalation ladder's state (which emails were sent), so the helper does not send twice after a restart. Before that date, create a new database (or move to a paid plan), put its Internal Database URL in the helper's `DATABASE_URL` and redeploy; the old state is not copied over, so letters still waiting would start their ladder again.
- Without `DATABASE_URL` the helper keeps that state in memory only and a restart forgets it (the startup log says so).
- Old test letters can be silenced with the helper's `LADDER_FINISHED_LETTERS` (see `helper/README.md`).

## For wallets

Tabella is designed to plug into wallets, not just to stand alone. Wallet users already hold crypto and often have no plan for what happens if they're gone. Because Tabella handles **letters only, never funds**, it's low-risk for a wallet to add.

The plan is a small **Tabella module**: a ready-made "Leave a letter" screen plus a developer kit, so a wallet can add one button in its settings and its users can write, seal and check in without leaving the wallet.

Integration path: **QoreX first** (same ecosystem, same quantum-safe story), then a **MetaMask Snap**, then Cosmos wallets (Keplr, Leap), then hardware and security-focused wallets.

## Roadmap

- Part B held by guardians or a threshold (no single Postman)
- Tabella module and SDK for wallets, starting with QoreX
- Verified email domain, text and call reminders
- Voice notes and photos (encrypted)
- "Any 2 of 3" recipients
- One card for all of a person's letters
- Mainnet, once the PQC precompiles are live there

## AI usage

Tabella was built with heavy, documented AI assistance. See **[AI_USAGE.md](AI_USAGE.md)** for the workflow, what AI generated and what the human decided.

## Credits

- Project scaffolds from the official QoreChain kit [`create-qorechain-dapp`](https://www.npmjs.com/package/create-qorechain-dapp): the `foundry` template (`contracts/`) and the `viem-wagmi` template (`app/`).
- QoreChain libraries (Apache-2.0, QoreChain Association): `@qorechain/qoreseal`, `@qorechain/pqc`, `@qorechain/sdk`, `@qorechain/evm`, `@qorechain/qorex-rainbowkit`.
- App: React, react-dom, Vite, TypeScript, Framer Motion, viem, wagmi, RainbowKit (`@rainbow-me/rainbowkit`), TanStack Query, `hash-wasm` (Argon2id), `@scure/bip39`, `bech32`, `jsqr`, `qrcode`, Vitest.
- Helper: Hono and `@hono/node-server`, zod, `pg`, `@cosmjs/stargate`, `tsx`, viem, `bech32`, Resend (HTTP API).
- Contracts: Foundry and `forge-std`.
- **Fonts:** Instrument Serif and Inter (SIL Open Font License 1.1), bundled with the app.
- **Voiceover:** ElevenLabs, voice "Autumn Veil", model `eleven_v4` (`app/src/assets/voice/`).
- **Background music:** a calm instrumental piano bed generated with ElevenLabs (`eleven_music_v2`), `app/src/assets/music/bed.mp3`; original generated audio, not a recording of any existing song.
- **Sound effects:** all 17, generated with ElevenLabs (`eleven_text_to_sound_v2`), `app/src/assets/sfx/`. No synthesised sounds are used.
- **Licence note:** these ElevenLabs files were made on a free plan, whose terms require attribution and do not include a commercial licence; re-generate them on a paid plan before any commercial use.
- **Clouds:** rendered from scratch by `tools/make-clouds.py` (procedural noise and shading, no photographs or stock images), pre-rendered to `app/src/assets/sky/*.webp`.
- **Illustrations** in the intro are drawn in code (`app/src/landing/stories.tsx`): original object-only line art.
- **Logo:** a small wax-red seal with a T beside the serif "Tabella" wordmark, also the favicon and app icon (`app/public/seal.svg`, made by `tools/make-seal.py`). Earlier explorations are in `docs/logo/`; none was used.

## Team

Solo builder: **Veetor4x**.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
