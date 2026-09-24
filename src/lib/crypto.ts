import "server-only";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

// Plaid access tokens are encrypted at rest with AES-256-GCM. The key lives in the
// macOS login Keychain (created by `npm run setup`), never in the database or repo.
// TOKEN_ENCRYPTION_KEY in the environment still works as an override.

// Keep in sync with scripts/keychain.mjs.
const KEYCHAIN_SERVICE = "budget_app";
const KEYCHAIN_ACCOUNT = "token-encryption-key";

let cachedKey: Buffer | null = null;

function readKeychain(): string | null {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.TOKEN_ENCRYPTION_KEY || readKeychain();
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(
      "Encryption key not found in the macOS Keychain (service \"budget_app\"). Run `npm run setup`, " +
        "or unlock your login keychain if you're signed in remotely.",
    );
  }
  cachedKey = Buffer.from(hex, "hex");
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, ciphertext] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
