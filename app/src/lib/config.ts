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

/**
 * Every TabellaRegistry we have deployed on the test network, newest first. A letter lives on the version it was sealed on (and its
 * number only means something there), so My letters looks each saved letter up on its own version. Keep this list: never remove an address.
 */
export interface RegistryVersion {
  address: Hex;
  name: string;
  /** false: sealed before dated letters existed (the letter record has no release date) */
  dated: boolean;
}
export const PAST_REGISTRIES: RegistryVersion[] = [
  { address: "0x48E4e0B4957d7C8ED6ac3d38cF45A7e5fa03b78D", name: "an older test version", dated: true },
  { address: "0xC0808aF18e2283dFE4d026315a462349561fFd1c", name: "an older test version", dated: false },
];
export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const REGISTRIES: RegistryVersion[] = [{ address: REGISTRY, name: "the current version", dated: true }, ...PAST_REGISTRIES.filter((v) => !sameAddress(v.address, REGISTRY))];
export const versionOf = (address?: string) => REGISTRIES.find((v) => sameAddress(v.address, address));
export const isCurrentRegistry = (address?: string) => sameAddress(address, REGISTRY);
