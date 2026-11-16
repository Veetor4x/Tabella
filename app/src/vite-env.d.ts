/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The Tabella helper (Postman + relay). Defaults to the Render deployment. */
  readonly VITE_HELPER_URL?: string;
  /** TabellaRegistry address. Defaults to the current testnet deployment. */
  readonly VITE_REGISTRY_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
