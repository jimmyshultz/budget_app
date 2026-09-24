import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { DEFAULT_CATEGORIES } from "@/lib/categorize";
import { getConfig } from "@/lib/config";

const DATA_DIR = getConfig().dataDir;
const DB_PATH = path.join(DATA_DIR, "budget.db");

function open() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const sqlite = new Database(DB_PATH);
  fs.chmodSync(DB_PATH, 0o600);
  sqlite.pragma("journal_mode = WAL");
  // The background sync job and the web app can write at the same time; wait instead of failing.
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  seedCategories(db);
  return db;
}

function seedCategories(db: ReturnType<typeof drizzle<typeof schema>>) {
  const existing = db.select({ id: schema.categories.id }).from(schema.categories).limit(1).all();
  if (existing.length > 0) return;
  db.insert(schema.categories)
    .values(
      DEFAULT_CATEGORIES.map((c, i) => ({
        name: c.name,
        groupName: c.group,
        color: c.color,
        isIncome: c.isIncome ?? false,
        isTransfer: c.isTransfer ?? false,
        sortOrder: i,
      })),
    )
    .run();
}

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof open> };
export const db = globalForDb.db ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

export { schema };
