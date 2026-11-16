/**
 * Tabella helper service: starts the HTTP server.
 *
 *   HELPER_MNEMONIC    testnet-only account that pays gas (required, never logged)
 *   REGISTRY_ADDRESS   deployed TabellaRegistry (required)
 *   see .env.example for the optional limits
 *
 * The Postman (release helper) will be added to this same process later.
 */
import { serve } from "@hono/node-server";
import { registryAbi } from "./abi.js";
import { createRealChain } from "./chain.js";
import { loadConfig } from "./config.js";
import { createApp } from "./relay.js";

async function main() {
  const cfg = loadConfig();
  const mnemonic = process.env.HELPER_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("HELPER_MNEMONIC is not set (a new testnet-only account, funded from the faucet)");

  const chain = await createRealChain({ mnemonic, restUrl: cfg.restUrl, evmRpcUrl: cfg.evmRpcUrl, abi: registryAbi });

  // Everything printed below is public information.
  console.log(`helper:    ${chain.qorAddress}  ${chain.evmAddress}`);
  console.log(`registry:  ${cfg.registry}`);
  const balance = await chain.balanceUqor();
  console.log(`balance:   ${balance} uqor`);
  if (balance < cfg.minBalanceUqor) console.warn("WARNING: balance is below MIN_BALANCE_UQOR; /relay will refuse requests until it is funded");

  // The helper must hold a registered ML-DSA-87 key to send anything (idempotent).
  const keyTx = await chain.ensurePqcKey();
  if (keyTx) console.log(`PQC key:   registered, tx ${keyTx}`);

  const app = createApp({ chain, cfg });
  serve({ fetch: app.fetch, port: cfg.port }, (info) => console.log(`listening: http://localhost:${info.port}  (POST /relay, GET /health)`));
}

main().catch((err) => {
  // name + message only: nothing secret is ever part of these
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : "startup failed");
  process.exit(1);
});
