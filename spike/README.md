# spike/

Risky-parts test scripts (go/no-go by Nov 17). Kept in the repo and documented in AI_USAGE.md.

Run from `spike/`: `npm install`, then `npm run 01` (needs `HELPER_MNEMONIC` in the environment; it is never printed).

Checks:
1. Helper account: faucet, ensurePqcRegistered, open EVM window. **Done** - `01-helper-setup.ts`.
2. Deploy a tiny contract that calls pqcVerify with a browser-made ML-DSA-87 signature (expect true).
3. Register a KEM key via QoreX signAndBroadcast, then a QoreSeal seal/open round trip to that address.

## Notes from check 1
- The SDK's preset consensus RPC (`rpc-testnet.qore.host`) does not resolve (DNS), so `01-helper-setup.ts` signs offline with `EthNativeSigner` and broadcasts over REST (`/cosmos/tx/v1beta1/txs`). `ensurePqcRegistered` is still the real SDK call; only its transport is swapped.
- Hybrid txs on qorechain-diana need `resolveSignBytesVersion({ chainId, rest })` passed to the signer.
- The helper should reuse this REST transport (Render has no RPC either).
