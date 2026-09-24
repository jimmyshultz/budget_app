import "server-only";
import path from "node:path";

// Single source of runtime configuration for the server. Core code reads settings only
// from here, never from process.env or an OS keychain directly.
//
// Sources, in order:
//   1. Values set with setConfig(): the desktop app will pass secrets it keeps in the
//      OS keychain (via Electron safeStorage) this way.
//   2. Environment variables: DATA_DIR, PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV,
//      TOKEN_ENCRYPTION_KEY. In development, scripts/run.mjs fills TOKEN_ENCRYPTION_KEY
//      from the macOS Keychain and Next.js loads the rest from .env.local.

export type PlaidEnv = "sandbox" | "production";

export type AppConfig = {
  /** Folder holding budget.db. */
  dataDir: string;
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: PlaidEnv;
  /** 64 hex characters (AES-256 key) for encrypting Plaid access tokens, or null if not set. */
  tokenEncryptionKey: string | null;
};

// Kept on globalThis so every module copy (Next.js can load a module more than once) sees it.
const store = globalThis as unknown as { __budgetConfigOverrides?: Partial<AppConfig> };

function fromEnv(): AppConfig {
  const env = process.env.PLAID_ENV === "production" ? "production" : "sandbox";
  return {
    dataDir: process.env.DATA_DIR || path.join(process.cwd(), "data"),
    plaidClientId: process.env.PLAID_CLIENT_ID ?? "",
    plaidSecret: process.env.PLAID_SECRET ?? "",
    plaidEnv: env,
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || null,
  };
}

export function getConfig(): AppConfig {
  return { ...fromEnv(), ...store.__budgetConfigOverrides };
}

/** Override settings at runtime (used by the desktop app). */
export function setConfig(values: Partial<AppConfig>) {
  store.__budgetConfigOverrides = { ...store.__budgetConfigOverrides, ...values };
}
