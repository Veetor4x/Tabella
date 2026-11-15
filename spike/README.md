# spike/

Risky-parts test scripts (go/no-go by Nov 17). Kept in the repo and documented in AI_USAGE.md.

Planned checks:
1. Helper account: faucet, ensurePqcRegistered, open EVM window.
2. Deploy a tiny contract that calls pqcVerify with a browser-made ML-DSA-87 signature (expect true).
3. Register a KEM key via QoreX signAndBroadcast, then a QoreSeal seal/open round trip to that address.
