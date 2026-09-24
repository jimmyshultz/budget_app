// Secrets for the desktop app, encrypted with Electron safeStorage (macOS Keychain, Windows
// DPAPI, Linux libsecret) and stored in <userData>/secrets.json. Only the encrypted blobs are on
// disk; decryption needs the OS user's keychain.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

/** @typedef {{ plaidClientId?: string, plaidSecret?: string, plaidEnv?: "sandbox" | "production", tokenEncryptionKey?: string }} Secrets */

const file = () => path.join(app.getPath("userData"), "secrets.json");

/** @returns {Secrets} */
export function loadSecrets() {
  if (!fs.existsSync(file())) return {};
  const stored = JSON.parse(fs.readFileSync(file(), "utf8"));
  return Object.fromEntries(
    Object.entries(stored).map(([name, blob]) => [name, safeStorage.decryptString(Buffer.from(blob, "base64"))]),
  );
}

/** @param {Secrets} secrets */
export function saveSecrets(secrets) {
  const stored = Object.fromEntries(
    Object.entries(secrets)
      .filter(([, value]) => value)
      .map(([name, value]) => [name, safeStorage.encryptString(value).toString("base64")]),
  );
  fs.mkdirSync(path.dirname(file()), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file(), JSON.stringify(stored, null, 2), { mode: 0o600 });
}

/** Load secrets, creating the token encryption key on first run. */
export function loadOrInitSecrets() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("The system keychain is not available, so secrets can't be stored safely.");
  }
  const secrets = loadSecrets();
  if (!secrets.tokenEncryptionKey) {
    secrets.tokenEncryptionKey = crypto.randomBytes(32).toString("hex");
    saveSecrets(secrets);
  }
  return secrets;
}
