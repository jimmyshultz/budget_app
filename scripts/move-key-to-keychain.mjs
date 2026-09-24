// One-time migration: moves TOKEN_ENCRYPTION_KEY from .env.local into the macOS Keychain.
// The line is removed from .env.local only after the Keychain copy is read back and matches.
import fs from "node:fs";
import { readKeychainKey, writeKeychainKey } from "./keychain.mjs";

const path = ".env.local";
const text = fs.readFileSync(path, "utf8");
const match = text.match(/^TOKEN_ENCRYPTION_KEY=([0-9a-f]*)\s*$/m);
const existing = readKeychainKey();

if (!match || !match[1]) {
  console.log(existing ? "Key is already in the Keychain; nothing to do." : "No key in .env.local or the Keychain.");
  process.exit(existing ? 0 : 1);
}
const key = match[1];
if (existing && existing !== key) {
  console.error("The Keychain already holds a DIFFERENT key. Not changing anything.");
  process.exit(1);
}

if (!existing) writeKeychainKey(key);
if (readKeychainKey() !== key) {
  console.error("Keychain read-back did not match. .env.local left unchanged.");
  process.exit(1);
}

const updated = text
  .replace(/^# Encrypts Plaid access tokens.*\n/m, "")
  .replace(/^TOKEN_ENCRYPTION_KEY=.*\n?/m, "# Token encryption key: stored in the macOS Keychain (service \"budget_app\").\n");
fs.writeFileSync(path, updated, { mode: 0o600 });
console.log("Moved the encryption key into the macOS Keychain and removed it from .env.local.");
