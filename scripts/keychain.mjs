// Reads/writes the token encryption key in the macOS login Keychain (development only;
// the desktop app uses Electron safeStorage). Used by scripts/run.mjs and scripts/setup.mjs.
import { execFileSync } from "node:child_process";

export const SERVICE = "budget_app";
export const ACCOUNT = "token-encryption-key";

export function readKeychainKey() {
  if (process.platform !== "darwin") return null;
  try {
    return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function writeKeychainKey(hex) {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("Key must be 64 hex characters.");
  // `security -i` reads the command from stdin, so the key never appears in the
  // process list the way a command-line argument would.
  execFileSync("security", ["-i"], {
    input: `add-generic-password -U -s ${SERVICE} -a ${ACCOUNT} -l "Budget App token key" -w ${hex}\n`,
    stdio: ["pipe", "ignore", "pipe"],
  });
}
