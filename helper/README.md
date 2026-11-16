# Tabella helper

A small Node + [Hono](https://hono.dev) service with two jobs in one process:

- the **relay** pays the gas for `TabellaRegistry` calls, so people never need a wallet or gas;
- the **Postman** (release helper) hands Part B to the heirs once a letter is Released.

## What it is allowed to do

`POST /relay` accepts exactly four contract calls: `createLetter`, `checkIn`, `guardianPause`,
`cancel`. Anything else (including `publishPartB` and `setPostman`) is refused with 403.

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

**Heirs without a key.** Publishing is one-shot, so it waits until *every* heir has a registered opening key. If
one is still missing after `POSTMAN_HEIR_KEY_GRACE_MINUTES` (30), it seals to the heirs that have one and logs a
warning. With no keys at all it keeps waiting.

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
| `POSTMAN_INTERVAL_SECONDS` | 20 | how often to look for released letters |
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
