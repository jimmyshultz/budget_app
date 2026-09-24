// Deletes the local database (all connections, transactions, budgets and rules).
// Use when switching PLAID_ENV between sandbox and production.
import fs from "node:fs";
import path from "node:path";

if (!process.argv.includes("--yes")) {
  console.log("This deletes data/budget.db: every connection, transaction, budget and rule.");
  console.log("Stop the dev server first, then run: npm run reset-data -- --yes");
  process.exit(1);
}
const dir = path.join(process.cwd(), "data");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("budget.db")) : [];
for (const f of files) fs.rmSync(path.join(dir, f));
console.log(files.length ? `Deleted ${files.join(", ")}. It will be recreated on next start.` : "No database found.");
