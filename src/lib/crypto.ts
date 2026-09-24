import "server-only";
import crypto from "node:crypto";
import { getConfig } from "./config";

// Plaid access tokens are encrypted at rest with AES-256-GCM. The key comes from the app
// config and is never stored in the database or the repo. Where it lives on disk depends on
// how the app runs: the OS keychain for the desktop app and for development on macOS
// (see scripts/run.mjs), or TOKEN_ENCRYPTION_KEY in the environment elsewhere.

function key(): Buffer {
  const hex = getConfig().tokenEncryptionKey;
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(
      "Encryption key not available. Run `npm run setup`, start the app with the npm scripts " +
        "(they load the key), or set TOKEN_ENCRYPTION_KEY to 64 hex characters.",
    );
  }
  return Buffer.from(hex, "hex");
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
