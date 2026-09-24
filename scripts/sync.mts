// Syncs every connection from the terminal, without the web server: npm run sync
//
// Runs under tsx with the react-server condition so the app's "server-only"
// modules can be imported directly.

process.loadEnvFile(".env.local");

// Imported after the env file is loaded, since these read env vars at import time.
const { syncAll } = await import("../src/lib/sync");

const results = await syncAll();
const stamp = new Date().toLocaleString();
if (results.length === 0) console.log(`[${stamp}] No connections to sync.`);
for (const r of results) {
  const who = r.institution ?? r.itemId;
  console.log(
    r.error
      ? `[${stamp}] ${who}: ERROR ${r.error}`
      : `[${stamp}] ${who}: +${r.added} ~${r.modified} -${r.removed}`,
  );
}
process.exit(results.some((r) => r.error) ? 1 : 0);
