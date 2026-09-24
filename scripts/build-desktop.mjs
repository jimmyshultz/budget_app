// Builds the Next.js standalone server for the desktop app into .next/standalone and checks
// that no local data or secrets ended up in it (it gets copied into the installer).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(".next", "standalone");

fs.rmSync(OUT, { recursive: true, force: true });
execFileSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: { ...process.env, BUILD_STANDALONE: "1" },
  shell: process.platform === "win32",
});

// The standalone server doesn't include static assets; copy them next to it.
fs.cpSync(path.join(".next", "static"), path.join(OUT, ".next", "static"), { recursive: true });
if (fs.existsSync("public")) fs.cpSync("public", path.join(OUT, "public"), { recursive: true });

// Never ship a database, env file or data folder.
const FORBIDDEN = [/\.db(-wal|-shm)?$/, /^\.env/, /^data$/];
const offenders = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const topLevel = path.dirname(full) === OUT;
    if (FORBIDDEN.some((re) => re.test(entry.name)) && (entry.name !== "data" || topLevel)) offenders.push(full);
    else if (entry.isDirectory()) walk(full);
  }
})(OUT);
if (offenders.length) {
  console.error("Refusing to package: local data or secrets found in the build:\n  " + offenders.join("\n  "));
  process.exit(1);
}
console.log(`Desktop server built in ${OUT} (no data or env files).`);
