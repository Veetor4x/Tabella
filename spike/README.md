# spike/

Risky-parts test scripts (go/no-go by Nov 17). Kept in the repo and documented in AI_USAGE.md.

Run from `spike/`: `npm install`, then `npm run 01` (needs `HELPER_MNEMONIC` in the environment; it is never printed).

Checks:
1. Helper account: faucet, ensurePqcRegistered, open EVM window. **Done** - `01-helper-setup.ts`.
2. Deploy a tiny contract that calls pqcVerify with a browser-made ML-DSA-87 signature (expect true). **Done** - `02-pqc-verify.ts` + `contracts/src/spike/PqcProbe.sol` (build first: `cd ../contracts && npx forge build --skip test --skip script`, then `npm run 02`).
3. Register a KEM key via QoreX signAndBroadcast, then a QoreSeal seal/open round trip to that address. **Page built, needs a manual run with QoreX** - `app/src/spike/KemSpike.tsx`, open `/#spike` (see app/README or below).

## Notes from check 1
- The SDK's preset consensus RPC (`rpc-testnet.qore.host`) does not resolve (DNS), so `01-helper-setup.ts` signs offline with `EthNativeSigner` and broadcasts over REST (`/cosmos/tx/v1beta1/txs`). `ensurePqcRegistered` is still the real SDK call; only its transport is swapped.
- Hybrid txs on qorechain-diana need `resolveSignBytesVersion({ chainId, rest })` passed to the signer.
- The helper should reuse this REST transport (Render has no RPC either).

## Notes from check 2
- `pqcVerify` accepts a 2592-byte ML-DSA-87 key and a 4627-byte signature from `@qorechain/pqc` (`mldsa87.sign`, default deterministic), message = raw bytes. Valid -> true, one flipped byte -> false (no revert).
- `act` costs ~232k gas on-chain; deploy ~373k. Both fit easily in the window sized for 3M gas each.
- `common.ts` holds the shared helper account, REST tx client and `ensureWindow` (re-opens a window when `remainingTxs`/value is too low; that branch has not been exercised yet - the existing window was reused).
- `forge build` of the whole project needs `lib/forge-std`, which is not in the checkout, hence `--skip test --skip script`.

## Notes from check 3 (app/src/spike/KemSpike.tsx, route `/#spike`)
- Browsers CANNOT call `api-testnet.qore.host` directly: no `Access-Control-Allow-Origin`, and the OPTIONS preflight returns 501. Verified in Chromium ("Failed to fetch"). The page calls REST through a same-origin path `/lcd-testnet` (vite proxy in dev/preview, `app/vercel.json` rewrite when deployed). `/lcd-mainnet` is the same for mainnet.
- Verified without QoreX (stub wallet): button 1, the CORS check, and that sealing to an address with no registered KEM key fails cleanly ("has not published a KEM key").
- NOT verified: the real QoreX `signAndBroadcast` of `MsgRegisterKEMKey` and the seal/open round trip to a registered address. Run those by hand with the QoreX extension.
