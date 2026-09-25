import "server-only";

// Single source of runtime configuration for the server. Core code reads settings only
// from here, never from process.env or an OS keychain directly.
//
// Sources, in order:
//   1. Values set with setConfig(): the desktop app passes secrets it keeps in the OS
//      keychain (via Electron safeStorage) this way; see src/lib/desktop.ts.
//   2. Environment variables: DATA_DIR, PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV,
//      TOKEN_ENCRYPTION_KEY. In development, scripts/run.mjs sets DATA_DIR to ./data and fills
//      TOKEN_ENCRYPTION_KEY from the macOS Keychain; Next.js loads the rest from .env.local.
//
// There's deliberately no default data folder in here: a literal path would make Next.js's
// file tracer copy the local database into desktop builds.

export type PlaidEnv = "sandbox" | "production";

export type AppConfig = {
  /** Folder holding budget.db; empty if not configured. */
  dataDir: string;
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: PlaidEnv;
  /** 64 hex characters (AES-256 key) for encrypting Plaid access tokens, or null if not set. */
  tokenEncryptionKey: string | null;
  /** Running inside the desktop app (bank logins go through Hosted Link in the system browser). */
  desktop: boolean;
  /** Per-launch secret the desktop window presents as a cookie; null disables the check. */
  appToken: string | null;
};

// Kept on globalThis so every module copy (Next.js can load a module more than once) sees it.
const store = globalThis as unknown as { __budgetConfigOverrides?: Partial<AppConfig> };

function fromEnv(): AppConfig {
  const env = process.env.PLAID_ENV === "production" ? "production" : "sandbox";
  return {
    dataDir: process.env.DATA_DIR ?? "",
    plaidClientId: process.env.PLAID_CLIENT_ID ?? "",
    plaidSecret: process.env.PLAID_SECRET ?? "",
    plaidEnv: env,
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || null,
    desktop: false,
    appToken: null,
  };
}

export function getConfig(): AppConfig {
  return { ...fromEnv(), ...store.__budgetConfigOverrides };
}

/** Override settings at runtime (used by the desktop app). */
export function setConfig(values: Partial<AppConfig>) {
  store.__budgetConfigOverrides = { ...store.__budgetConfigOverrides, ...values };
}

/** Settings a user can change from the app (Settings / first-run setup). */
export type EditableSettings = Pick<AppConfig, "plaidClientId" | "plaidSecret" | "plaidEnv">;

type Persister = (values: EditableSettings) => Promise<void>;
const persistStore = globalThis as unknown as { __budgetSettingsPersister?: Persister };

/** Registered by the desktop app, which stores settings in the OS keychain. */
export function setSettingsPersister(persister: Persister) {
  persistStore.__budgetSettingsPersister = persister;
}

/** False when running from source: settings come from .env.local and can't be saved in-app. */
export function canSaveSettings(): boolean {
  return Boolean(persistStore.__budgetSettingsPersister);
}

/** Persist settings (desktop: OS keychain), then apply them to the running server. */
export async function saveSettings(values: EditableSettings) {
  const persister = persistStore.__budgetSettingsPersister;
  if (!persister) throw new Error("Settings can't be saved here. Edit .env.local instead.");
  await persister(values);
  setConfig(values);
}
