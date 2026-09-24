import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { DEFAULT_CATEGORIES } from "@/lib/categorize";
import { getConfig } from "@/lib/config";
import { onShutdown } from "@/lib/shutdown";

type Db = ReturnType<typeof drizzle<typeof schema>>;

function open(): Db {
  const dataDir = getConfig().dataDir;
  if (!dataDir) {
    throw new Error("No data folder configured. Start the app with the npm scripts, or set DATA_DIR.");
  }
  const dbPath = path.join(dataDir, "budget.db");
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const sqlite = new Database(dbPath);
  fs.chmodSync(dbPath, 0o600);
  sqlite.pragma("journal_mode = WAL");
  // The terminal sync and the app can write at the same time; wait instead of failing.
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  seedCategories(db);
  return db;
}

function seedCategories(db: Db) {
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

// One connection per process, kept on globalThis so dev hot reloads reuse it.
const store = globalThis as unknown as { __budgetDb?: Db };

function getDb(): Db {
  if (!store.__budgetDb) {
    store.__budgetDb = open();
    onShutdown(closeDb);
  }
  return store.__budgetDb;
}

/**
 * The database, opened on first use rather than at import. `next build` imports every page,
 * and the desktop app only sends the data folder once the server has started, so opening
 * eagerly would touch (or fail to find) the database at the wrong time.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Close the connection (checkpoints the WAL). Runs when the desktop app quits. */
function closeDb() {
  store.__budgetDb?.$client.close();
  store.__budgetDb = undefined;
}

export { schema };
