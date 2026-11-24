# Tabella helper

A small Node + [Hono](https://hono.dev) service with two jobs in one process:

- the **relay** pays the gas for `TabellaRegistry` calls, so people never need a wallet or gas;
- the **Postman** (release helper) hands Part B to the heirs once a letter is Released.

## What it is allowed to do

`POST /relay` accepts exactly four contract calls: `createLetter`, `checkIn`, `guardianPause`,
`cancel`. Anything else (including `publishPartB` and `setPostman`) is refused with 403.

`POST /fund` gives a brand-new address a tiny amount of **test** coins so it can register its opening card (this is what
the loved one's `/join` page uses; the browser then registers the key itself, no wallet). Body: `{ "address": "qor1…" }`.

- one-time per address: remembered in memory, and also refused when the account already holds anything (so a restart
  cannot be used to ask twice);
- a fixed amount chosen by the helper (`FUND_AMOUNT_UQOR`, default 400000 uqor = 0.4 QOR, two registrations and a bit
  more); the caller cannot ask for more;
- strict limits: 3 per IP per hour (`FUND_PER_IP_PER_HOUR`) and 40 per hour for everyone (`FUND_GLOBAL_PER_HOUR`);
- the helper's own reserve (`MIN_BALANCE_UQOR`) is never used;
- testnet only: it is off unless `QORE_REST_URL` is a testnet endpoint, and can be switched off with `FUND_ENABLED=false`;
- answers: `200 { ok, txHash, amountUqor }`, `400 invalid_address`, `409 already_funded`, `429 rate_limited`,
  `503 fund_unavailable`, `403 fund_disabled`.

## Surprise letters: the escalation ladder

A "Keep it a surprise" letter carries, next to Part B, a **contact package** sealed to the Postman's key (emails, phone
numbers, first names, the opening card's fingerprint). Only the Postman can read it. After the Postman publishes Part B it
runs this ladder for the letter (real timings; in demo mode, 2 / 4 / 2 minutes):

1. at once: an email to the recipient ("<Owner> left you a letter. It's been kept safe until now." and a link to `/open?letter=<id>`);
2. no open after 3 days: a reminder email;
3. no open after 7 days: backup 1, by email ("<Owner> left a letter for <Name> and asked you to help them receive it."), then backup 2 and 3, two days apart.

**Email only for now.** Text messages and phone calls are written and tested but sit behind a provider switch: they exist only while the Twilio variables below are set (an SMS with each email, and a call with the reminder). Turn them on later by adding the keys, with no code change. Phone numbers are optional in the app ("Text and call reminders coming soon."). Addresses on reserved domains (example.com and friends) are never sent to.

It stops as soon as the letter is opened: the browser reports it with `POST /opened { letterId, pubkey, sig }`, a signature from
the unlocked card that the Postman checks against the card fingerprint in the package. Every step is **claimed in the store
before it is sent** (so a second pass, a second process or a restart never sends it twice) and given back if the send fails
(so the next pass retries). Logs say "letter #N: step r:call sent" and never contain an address, a number, a name or a link.

### Variables to add on Render (names only; you add the values)

| Variable | What it is |
|---|---|
| `BREVO_API_KEY` | Brevo API key (email, no domain needed). When set, Brevo sends the email; otherwise Resend does. |
| `EMAIL_FROM` | with Brevo: the sender address you verified in Brevo (the name shown is "Tabella"). |
| `RESEND_API_KEY` | Resend API key (email), used when there is no `BREVO_API_KEY`. |
| `RESEND_FROM` | the sender, like `Tabella <letters@your-verified-domain>` (Resend's `onboarding@resend.dev` only reaches your own address). **Needed now.** |
| `TWILIO_ACCOUNT_SID` | later: Twilio account SID (SMS and calls) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM` | the Twilio number that sends SMS (E.164, like `+15550100123`) |
| `TWILIO_VOICE_FROM` | optional: the number that places calls (defaults to `TWILIO_FROM`) |
| `DATABASE_URL` | Postgres connection string, so "already sent" survives restarts (Render's free Postgres works). Without it the steps are remembered in memory only: a restart forgets them |
| `LADDER_FINISHED_LETTERS` | optional: letter numbers whose ladder is finished for good (old test letters), e.g. `1,2,3,4,5,6,7,8`: at startup each gets a "finished" record in the database, so nothing is ever retried for it |
| `APP_URL` | optional: the web app's address for the links (default `https://tabella-veetor4x.vercel.app`) |

A channel without its variables is off. With no email key at all the ladder waits (nothing is lost, and its clock starts when the first email can go out); `GET /health` shows `messages: { email, sms, call }` so you can check what is on, never the keys.

The relay is **not trusted**. Every action carries the owner's or guardian's ML-DSA-87 signature,
which `TabellaRegistry` verifies on-chain (`pqcVerify`). The helper can submit or withhold a call,
but it cannot forge or change one.

### Request

```jsonc
// createLetter
{ "fn": "createLetter",
  "args": { "heirs": ["0x..", "0x.."], "guardianKeyHash": "0x<32 bytes>", "quietPeriod": 120,
            "warningPeriod": 60, "letterCiphertext": "0x..", "partAEnvelope": "0x..", "partBForPostman": "0x.." },
  "pubkey": "0x<2592 bytes>", "sig": "0x<4627 bytes>" }

// checkIn | guardianPause | cancel
{ "fn": "checkIn", "args": { "letterId": "7" }, "pubkey": "0x..", "sig": "0x.." }
```

### Responses

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ ok: true, fn, txHash, gasUsed, blockNumber }` | relayed |
| 400 | `{ ok: false, error: "invalid_request", details: [{path, message}] }` | bad input (never echoes values) |
| 403 | `{ error: "function_not_allowed" }` | not one of the four calls |
| 413 | `{ error: "body_too_large" }` | |
| 422 | `{ error: "would_revert", reason: "InvalidSignature" }` | simulated first; **nothing was sent, no gas spent** |
| 422 | `{ error: "too_expensive" }` | needs more gas than `MAX_TX_GAS` |
| 429 | `{ error: "rate_limited", retryAfterSec }` | per-IP and global limits |
| 502 | `{ error: "reverted_onchain", txHash }` | state changed between simulation and inclusion |
| 503 | `relayer_out_of_funds`, `window_unavailable`, `gas_price_too_high`, `chain_unavailable` | helper-side problem |

## The Postman

Every 20 seconds (`POSTMAN_INTERVAL_SECONDS`) it looks for letters whose status is **Released** and that have
**no Part B yet**, and for each one:

1. opens `partBForPostman` with its own opening key,
2. reads every heir's registered ML-KEM key from the on-chain registry,
3. seals Part B to those keys (QoreSeal, `mlkem` mode),
4. calls `publishPartB` through the same simulate-first pipeline as `/relay`.

**Its key.** The opening key is derived from `HELPER_MNEMONIC` with QoreSeal's `sealSeedFromMnemonic` (fixed,
non-secret passphrase `tabella-postman-v1`, index 0), so there is no new secret. On startup the helper registers
the matching public key on-chain with `MsgRegisterKEMKey` (native tx signed by the helper). It never overwrites a
*different* registered key. The public key is in `GET /health` under `postman.mlkemPublicKey`, which is what the app
seals Part B to.

**Retries are safe** (Part B can never be published twice):

1. the contract allows `publishPartB` once, only after Released, only from the Postman address;
2. every call is simulated first, so a repeat is refused for free (`AlreadyPublished`);
3. the on-chain `released` flag is read each tick, so a publish that succeeded while we saw an error (timeout) is
   noticed and not repeated;
4. a failed attempt backs off 30 s, 60 s, ... up to 5 min before the next one;
5. ticks never overlap, and sending shares `/relay`'s queue (one nonce counter).

**Part B it cannot open.** If a letter's `partBForPostman` is not sealed to the Postman's key (for example a letter
made against a different helper) or is corrupt, that can never become openable. The letter is marked
*can't-open*: one log line, then it is skipped for the life of the process, with no RPC calls, no gas and no
repeated logging. `/health` shows the count as `postman.cannotOpen`. A restart looks (and logs) once more.

**Heirs without a key.** Publishing is one-shot, so it waits until *every* heir has a registered opening key. If
one is still missing after `POSTMAN_HEIR_KEY_GRACE_MINUTES` (30), it seals to the heirs that have one and logs a
warning. With no keys at all it keeps waiting.

**Startup catch-up.** `start()` runs one full pass immediately and returns its report (logged as
`startup catch-up done: looked at N letters, published M, ...`), then ticks every 20 s. This is what makes a helper
that wakes from sleep publish overdue Part B within seconds.

**Honest limits.** The Postman can *delay* a release (liveness) but cannot read a letter: it only ever holds
Part B, never Part A. It cannot fake a check-in or a pause, because those need the owner's or guardian's
ML-DSA-87 signature, verified on-chain. It also sees *that* a letter was released and who its heirs are (public
on-chain anyway). Roadmap: Part B held by guardians / threshold. Logs contain letter ids, counts and tx hashes
only, never Part B, keys or envelopes.

## Order of operations (nothing costs gas until the last step)

rate limit -> body size -> validate -> funds check -> **simulate** -> fee check -> **window** -> send

Requests are processed one at a time, because the EVM nonce and the native sequence number are one counter.

## EVM window

Every EVM tx from the helper needs a live "EVM authorisation window". The relay opens one big
window and **reuses** it; it opens a new one only when the current window is low (<= 10 txs,
<= 1,200 blocks (~30 min), or too little value for 10 worst-case txs left), or the chain says there is none.
Opening is never triggered by a request that would revert.

Defaults are sized for a demo day: **17,280 blocks (the chain maximum, ~6.9 h at 1.44 s/block) and 200 txs**,
with a value budget of 200 x (12M gas x 250 gwei) = 600 QOR. The value budget is a cap, not a deposit: the window
charges `gasLimit x maxFee` per tx against it, while the account only pays what is actually used (measured on testnet).

## Environment variables

Names only, see `../.env.example`. Never commit real values.

| Variable | Default | |
|---|---|---|
| `HELPER_MNEMONIC` | required | testnet-only account that pays gas. Read once, never logged or returned |
| `REGISTRY_ADDRESS` | required | deployed TabellaRegistry |
| `PORT` | 8787 | |
| `QORE_REST_URL`, `QORE_EVM_RPC_URL` | public testnet | |
| `RATE_LIMIT_PER_MIN` / `GLOBAL_RATE_LIMIT_PER_MIN` | 10 / 120 | `/relay` per IP / everyone |
| `TRUSTED_PROXY_HOPS` | 0 | set to **1 on Render**: the client IP is then the last `X-Forwarded-For` entry, which a caller cannot spoof |
| `CORS_ORIGINS` | `*` | comma-separated origins; set to the app's URL in production |
| `MAX_BODY_BYTES` | 131072 | |
| `MAX_TX_GAS`, `MAX_FEE_GWEI` | 12000000, 250 | per-tx ceilings the window is sized for |
| `MIN_BALANCE_UQOR` | 2000000 | stop relaying below 2 QOR |
| `WINDOW_BLOCKS`, `WINDOW_MAX_TXS`, `WINDOW_MAX_UQOR` | 17280, 200, derived | clamped to the chain maximums |
| `WINDOW_LOW_TXS`, `WINDOW_LOW_BLOCKS` | 10, 1200 | when to reopen |
| `POSTMAN_ENABLED` | true | `false` runs the relay only |
| `POSTMAN_INTERVAL_SECONDS` | 20 | how often to look at every letter (the slow pass) |
| `FAST_INTERVAL_SECONDS` | 15 | how often to look at letters in their final 5 minutes (and at test-timed ladders still sending), so the first email goes out within seconds of the release |
| `POSTMAN_HEIR_KEY_GRACE_MINUTES` | 30 | see "Heirs without a key" |

## GET /health

Balance, window status, the helper's public addresses and the Postman's status and **public** opening key
(`postman.mlkemPublicKey`, `lastTickAt`, `lettersWatched`, `published`, `lastError`). No secrets: the response is a
fixed whitelist of fields, and tests check it. Cached for 5 s and rate limited.

## Run

```sh
npm install
HELPER_MNEMONIC=... REGISTRY_ADDRESS=0x... npm start      # or put them in .env
npm test                                                   # 109 tests, mocked chain
npm run typecheck
```

`npm run e2e` runs the whole life of a letter on testnet with real heir accounts and the Postman (about 6 minutes,
needs `HELPER_MNEMONIC`; see `scripts/e2e-postman.ts`).

`npm run deploy-and-relay` deploys TabellaRegistry to testnet, starts the real server on localhost,
and relays a `createLetter` and a `checkIn` signed by `shared/tabella-crypto.ts`. It needs
`cd ../contracts && forge build` first.

## Deploy on Render (free plan)

`../render.yaml` is a Blueprint for one web service on Render's **free** plan. It builds from the repo root because
`helper/` imports `../shared/`:

```
build:   npm ci --prefix shared && npm ci --prefix helper
start:   npm start --prefix helper
health:  /health          TRUSTED_PROXY_HOPS=1   NODE_VERSION=22
```

> **Free plan: a release can be delayed until the helper wakes.** A free instance spins down after about 15 minutes
> without inbound traffic and wakes (roughly a minute) on the next request. The Postman runs inside this process,
> so while the helper sleeps **nothing is published**: a letter that becomes Released during the sleep waits until
> something wakes it (a visit to the app that calls the helper, or any request to `/health`). The moment it
> starts, the Postman runs one **full catch-up pass** over every letter *before* its first 20-second wait, so any
> overdue Part B is published within seconds of waking (tested). Nothing is lost or published twice. For
> releases on time, use the `starter` plan (always-on): change `plan` in `render.yaml`.
> Letters opened by heirs are never affected: Part B stays on-chain once published.

1. New -> Blueprint -> connect `Veetor4x/Tabella`, pick the branch -> review -> Apply.
2. Type the one secret when prompted: **`HELPER_MNEMONIC`** (the testnet-only helper account). Until it is set the
   service fails fast with `HELPER_MNEMONIC is not set` and the deploy shows as failed; setting it redeploys.
3. Check `https://<service>.onrender.com/health`: `ok: true`, a live `window`, and `postman.mlkemPublicKey`.

Everything else in the Blueprint is public (the registry address, CORS origins). The build and start commands were
tested from a fresh clone with `NODE_ENV=production` (dev dependencies skipped).

## Files

```
src/index.ts      start the server
src/relay.ts      Hono app: /relay, /health, rate limits, CORS
src/submit.ts     simulate -> fee -> window -> send; used by /relay and the Postman
src/postman.ts    the release loop
src/postmanKeys.ts  Postman opening key from HELPER_MNEMONIC; on-chain registration
src/validate.ts   strict input validation (zod) + calldata encoding
src/chain.ts      everything that touches QoreChain, behind a small interface (tests mock it)
src/window.ts     reuse / reopen the EVM window; one-at-a-time queue
src/ratelimit.ts  per-IP limiter and trusted-proxy IP rule
src/abi.ts        the four relayed functions (relayAbi) and, separately, the Postman's (postmanAbi)
src/config.ts     environment -> settings (no secrets in it)
```

## Last testnet E2E (`npm run e2e`)

Registry `0xbBC6d3eEE6f8472482d5a8860F4e2d65f4867aD0` on qorechain-diana. Letter #2 (2 heirs, guardian, quiet 120 s,
warning 60 s): one check-in, then silence. Released at chain time 1794815644; the Postman's `publishPartB` landed
in block 10182920 at 1794815657, **13 s after release** (the loop runs every 20 s, so it is 0-20 s plus ~2 blocks).
Both heirs opened the letter; the Postman could not re-open what it published; a second `publishPartB` was refused
(`AlreadyPublished`). On letter #3 two guardian pauses worked and the third was refused with `PauseLimitReached`
(no gas spent). `publishPartB` for a 2-heir letter used 2,457,301 gas; `createLetter` 4,171,860.
