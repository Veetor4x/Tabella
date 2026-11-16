# Tabella app

React + Vite, mobile first. Built from QoreChain's `viem-wagmi` template (see the root README for credits).

## What is here (UI piece 1 of 4)

The owner's flow, one step per screen: 💌 Write → 👨‍👩‍👧 Who should open it? → 🛡️ A guardian → ⏳ When should it open? → 🔏 Seal it.
Sealing really creates the letter on testnet: the letter is locked in the browser with `../shared/tabella-crypto.ts`, and the
helper (Render) pays the network fee and sends it. Nothing readable leaves the device. `/#spike` keeps the developer test page.

- Hidden 2-minute demo timer: add `?demo` to the address, or tap the hourglass five times.
- Words like "key", "wallet" or "signature" never appear on screen; a test checks every screen.

## Run

```sh
npm install
npm run dev          # http://localhost:5173 (the dev server forwards /lcd-testnet and /evm-testnet; browsers cannot call those APIs directly)
npm test             # 29 tests: addresses, timing, the request against the helper's own validator, no technical words
npm run build
```

`VITE_HELPER_URL` and `VITE_REGISTRY_ADDRESS` are optional (defaults point at the live helper and registry).
`e2e/owner-flow.cjs` drives the whole flow at iPhone width against the real helper (needs Playwright; it seals a real demo letter).

## Deploying

Vercel, Root Directory `app`. `vercel.json` forwards the REST and EVM paths. The build needs the repo's `shared/` folder next to `app/`
(Vercel: "Include source files outside of the Root Directory" on); `vite.config.ts` resolves its packages from `app/node_modules`.
