import type { Hex } from "viem";

/** The helper pays for the network fees, so people never need a wallet or any coins. */
export const HELPER_URL = (import.meta.env.VITE_HELPER_URL?.trim() || "https://tabella-helper-oecu.onrender.com").replace(/\/+$/, "");

/** The TabellaRegistry on qorechain-diana (the helper is its Postman). */
export const REGISTRY = (import.meta.env.VITE_REGISTRY_ADDRESS?.trim() || "0xC0808aF18e2283dFE4d026315a462349561fFd1c") as Hex;

export const EXPLORER = "https://explore.qore.network";

// The public REST and EVM endpoints send no CORS headers, so the browser calls them through
// same-origin paths that the dev server (vite.config.ts) and Vercel (vercel.json) forward.
// Functions, not constants, so nothing touches `window` at import time.
export const restUrl = () => `${window.location.origin}/lcd-testnet`;
export const evmRpcUrl = () => `${window.location.origin}/evm-testnet`;
