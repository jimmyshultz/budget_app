// Development launcher used by the npm scripts: `node scripts/run.mjs <command> [args...]`
//
// - Keeps .next/ private.
// - Points DATA_DIR at ./data unless it's already set.
// - On macOS, loads the token encryption key from the Keychain into TOKEN_ENCRYPTION_KEY,
//   unless it's already set. Elsewhere, set it in .env.local (npm run setup does this).
// The app itself only reads the environment; this is the one place that knows about ./data and
// the Keychain.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readKeychainKey } from "./keychain.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/run.mjs <command> [args...]");
  process.exit(1);
}

fs.mkdirSync(".next", { recursive: true });
if (process.platform !== "win32") fs.chmodSync(".next", 0o700);

const env = { ...process.env };
env.DATA_DIR ||= path.resolve("data");
if (!env.TOKEN_ENCRYPTION_KEY && process.platform === "darwin") {
  const key = readKeychainKey();
  if (key) env.TOKEN_ENCRYPTION_KEY = key;
}

const child = spawn(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
