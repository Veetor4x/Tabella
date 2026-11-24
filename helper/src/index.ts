/**
 * Tabella helper service: the HTTP relay and the Postman, in one process.
 *
 *   HELPER_MNEMONIC    testnet-only account that pays gas (required, never logged)
 *   REGISTRY_ADDRESS   deployed TabellaRegistry (required)
 *   see .env.example for the optional limits
 *
 * The Postman's opening key is derived from HELPER_MNEMONIC (no extra secret).
 */
import { serve } from "@hono/node-server";
import { registryAbi } from "./abi.js";
import { createRealChain } from "./chain.js";
import { loadConfig } from "./config.js";
import { createEscalation } from "./escalation.js";
import { createNotifier } from "./notify/providers.js";
import { createMemoryStore, createPgStore } from "./notify/store.js";
import { createPostman } from "./postman.js";
import { createReminders } from "./reminders.js";
import { derivePostmanKeys, ensurePostmanKemKey } from "./postmanKeys.js";
import { createApp } from "./relay.js";
import { Mutex } from "./window.js";

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
  if (balance < cfg.minBalanceUqor) console.warn("WARNING: balance is below MIN_BALANCE_UQOR; sending will be refused until it is funded");

  // The helper must hold a registered ML-DSA-87 key to send anything (idempotent).
  const keyTx = await chain.ensurePqcKey();
  if (keyTx) console.log(`PQC key:   registered, tx ${keyTx}`);

  const mutex = new Mutex(); // shared by /relay and the Postman: one nonce counter
  let postman: ReturnType<typeof createPostman> | undefined;
  let messages: (() => { email: boolean; sms: boolean; call: boolean }) | undefined;

  if (cfg.postmanEnabled) {
    const keys = derivePostmanKeys(mnemonic);
    const kemTx = await ensurePostmanKemKey(chain, keys);
    console.log(`Postman:   opening key ${kemTx ? `registered on-chain, tx ${kemTx}` : "already registered on-chain"}`);
    // The ladder for surprise letters: Resend / Twilio (keys from the environment), and a database so nothing is ever sent twice.
    const notifier = createNotifier();
    const dbUrl = process.env.DATABASE_URL?.trim();
    const store = dbUrl ? await createPgStore(dbUrl) : createMemoryStore();
    console.log(`Messages:  email ${notifier.channels.email ? `on (${notifier.emailProvider === "brevo" ? "Brevo" : "Resend"})` : "off"}, SMS ${notifier.channels.sms ? "on" : "off (email only for now)"}, calls ${notifier.channels.call ? "on" : "off"}; steps remembered in ${dbUrl ? "the database" : "memory (a restart forgets: set DATABASE_URL)"}`);
    const escalation = createEscalation({ notifier, store, appUrl: cfg.appUrl });
    for (const id of cfg.finishedLetters) await escalation.markFinished(id); // old test letters: done, kept quiet
    messages = () => notifier.channels;
    const reminders = createReminders({ notifier, store, appUrl: cfg.appUrl });
    postman = createPostman({ chain, cfg, keys, mutex, escalation, reminders });
  } else {
    console.log("Postman:   disabled (POSTMAN_ENABLED=false)");
  }

  const app = createApp({ chain, cfg, mutex, postmanInfo: postman?.info, reportOpened: postman?.reportOpened, deliveryOf: postman?.deliveryOf, messages });
  serve({ fetch: app.fetch, port: cfg.port }, (info) => console.log(`listening: http://localhost:${info.port}  (POST /relay, GET /health)`));
  if (postman) {
    // Catch-up first: after a sleep (free Render plan) this publishes anything that became overdue, right away.
    const r = await postman.start();
    console.log(
      `Postman:   startup catch-up done: looked at ${r.scanned} letters, published ${r.published.length}, ` +
        `${r.waiting.length} waiting, ${r.cannotOpen.length} can't-open, ${r.errors} errors`,
    );
    console.log(`Postman:   then looking for released letters every ${cfg.postmanIntervalMs / 1000} s`);
  }
}

main().catch((err) => {
  // name + message only: nothing secret is ever part of these
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : "startup failed");
  process.exit(1);
});
