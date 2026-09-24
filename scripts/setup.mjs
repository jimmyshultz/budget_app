// Creates .env.local with Plaid placeholders, and a fresh encryption key in the
// macOS Keychain. Safe to re-run: it never overwrites an existing file or key.
import crypto from "node:crypto";
import fs from "node:fs";
import { readKeychainKey, writeKeychainKey } from "./keychain.mjs";

if (readKeychainKey()) {
  console.log("Encryption key already in the Keychain; leaving it alone.");
} else {
  writeKeychainKey(crypto.randomBytes(32).toString("hex"));
  console.log("Created an encryption key in the macOS Keychain (service \"budget_app\").");
}

const path = ".env.local";
if (fs.existsSync(path)) {
  console.log(`${path} already exists; leaving it alone.`);
  process.exit(0);
}

const contents = `# Plaid keys: https://dashboard.plaid.com/developers/keys
PLAID_CLIENT_ID=
PLAID_SECRET=
# sandbox (fake test data) or production (your real accounts). Use the secret that matches.
PLAID_ENV=sandbox

# Token encryption key: stored in the macOS Keychain (service "budget_app").
`;
fs.writeFileSync(path, contents, { mode: 0o600 });
console.log(`Wrote ${path}. Add your Plaid client ID and secret, then run: npm run app`);
