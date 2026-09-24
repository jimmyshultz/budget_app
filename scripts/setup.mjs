// Creates .env.local with Plaid placeholders and a token encryption key.
// On macOS the key goes in the Keychain; elsewhere it goes in .env.local.
// Safe to re-run: it never overwrites an existing file or key.
import crypto from "node:crypto";
import fs from "node:fs";
import { readKeychainKey, writeKeychainKey } from "./keychain.mjs";

const newKey = () => crypto.randomBytes(32).toString("hex");
const useKeychain = process.platform === "darwin";

if (useKeychain) {
  if (readKeychainKey()) {
    console.log("Encryption key already in the Keychain; leaving it alone.");
  } else {
    writeKeychainKey(newKey());
    console.log('Created an encryption key in the macOS Keychain (service "budget_app").');
  }
}

const path = ".env.local";
if (fs.existsSync(path)) {
  console.log(`${path} already exists; leaving it alone.`);
  process.exit(0);
}

const keyLine = useKeychain
  ? '# Token encryption key: stored in the macOS Keychain (service "budget_app").'
  : `# Encrypts Plaid access tokens in the database. If you lose it, reconnect your accounts.\nTOKEN_ENCRYPTION_KEY=${newKey()}`;

const contents = `# Plaid keys: https://dashboard.plaid.com/developers/keys
PLAID_CLIENT_ID=
PLAID_SECRET=
# sandbox (fake test data) or production (your real accounts). Use the secret that matches.
PLAID_ENV=sandbox

${keyLine}
`;
fs.writeFileSync(path, contents, { mode: 0o600 });
console.log(`Wrote ${path}. Add your Plaid client ID and secret, then run: npm run app`);
