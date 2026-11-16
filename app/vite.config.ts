import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

// The public REST and EVM endpoints send no CORS headers, so the browser calls them through same-origin
// paths that the dev (and preview) server forwards: /lcd-testnet -> REST, /evm-testnet -> EVM JSON-RPC.
// Production does the same with the rewrites in vercel.json.
const forward = (target: string, from: RegExp) => ({
  target,
  changeOrigin: true,
  rewrite: (p: string) => p.replace(from, ""),
});
const proxy = {
  "/lcd-testnet": forward("https://api-testnet.qore.host", /^\/lcd-testnet/),
  "/lcd-mainnet": forward("https://api.qore.host", /^\/lcd-mainnet/),
  "/evm-testnet": forward("https://evm-testnet.qore.host", /^\/evm-testnet/),
};

/**
 * ../shared/tabella-crypto.ts is shared with the helper. Its bare imports (viem, @qorechain/...) would normally be
 * looked up from shared/node_modules, which does not exist where only app/ is installed (Vercel). Resolve them
 * from this app's node_modules instead, as if app/src/main.tsx had imported them.
 */
function sharedDependenciesFromApp(): Plugin {
  const sharedDir = fileURLToPath(new URL("../shared/", import.meta.url));
  const anchor = fileURLToPath(new URL("./src/main.tsx", import.meta.url));
  return {
    name: "shared-dependencies-from-app",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !importer.startsWith(sharedDir) || source.startsWith(".") || source.startsWith("/")) return null;
      return this.resolve(source, anchor, { ...options, skipSelf: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), sharedDependenciesFromApp()],
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
  test: { include: ["test/**/*.test.{ts,tsx}"], environment: "node" },
});
