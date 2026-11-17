import type { Hex } from "viem";

/** The helper pays for the network fees, so people never need a wallet or any coins. */
export const HELPER_URL = (import.meta.env.VITE_HELPER_URL?.trim() || "https://tabella-helper-oecu.onrender.com").replace(/\/+$/, "");

/** The TabellaRegistry on qorechain-diana (the helper is its Postman). */
export const REGISTRY = (import.meta.env.VITE_REGISTRY_ADDRESS?.trim() || "0xbBC6d3eEE6f8472482d5a8860F4e2d65f4867aD0") as Hex;

export const EXPLORER = "https://explore.qore.network";

// The public REST and EVM endpoints send no CORS headers, so the browser calls them through
// same-origin paths that the dev server (vite.config.ts) and Vercel (vercel.json) forward.
// Functions, not constants, so nothing touches `window` at import time.
export const restUrl = () => `${window.location.origin}/lcd-testnet`;
export const evmRpcUrl = () => `${window.location.origin}/evm-testnet`;

/** The address printed on every card, under the QR code: one door for every kind of card. */
export const APP_HOST = "tabella-veetor4x.vercel.app";
export const CARD_URL = `https://${APP_HOST}/card`;
