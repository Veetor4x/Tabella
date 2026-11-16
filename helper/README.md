# Tabella helper

A small Node + [Hono](https://hono.dev) service. Today it is the **relay**: it pays the gas for
`TabellaRegistry` calls so people never need a wallet or gas. The Postman (release helper) will be
added to this same process later.

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

## GET /health

Balance, window status and the helper's public addresses. No secrets: the response is a fixed
whitelist of fields, and a test checks it. Cached for 5 s and rate limited.

## Run

```sh
npm install
HELPER_MNEMONIC=... REGISTRY_ADDRESS=0x... npm start      # or put them in .env
npm test                                                   # 78 tests, mocked chain
npm run typecheck
```

`npm run deploy-and-relay` deploys TabellaRegistry to testnet, starts the real server on localhost,
and relays a `createLetter` and a `checkIn` signed by `shared/tabella-crypto.ts`. It needs
`cd ../contracts && forge build` first.

## Files

```
src/index.ts      start the server
src/relay.ts      Hono app: /relay, /health, rate limits, CORS
src/validate.ts   strict input validation (zod) + calldata encoding
src/chain.ts      everything that touches QoreChain, behind a small interface (tests mock it)
src/window.ts     reuse / reopen the EVM window; one-at-a-time queue
src/ratelimit.ts  per-IP limiter and trusted-proxy IP rule
src/abi.ts        the four relayed functions and the contract's errors
src/config.ts     environment -> settings (no secrets in it)
```
