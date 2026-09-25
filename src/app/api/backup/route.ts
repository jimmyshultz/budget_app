import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db } from "@/db";

/**
 * Download a copy of the database. POST from the Settings page only: Sec-Fetch-Site must be
 * same-origin, so another website can't trigger a download (proxy.ts already restricts
 * the host and, in the desktop app, requires the launch token).
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return new Response("Forbidden", { status: 403 });
  }
  // SQLite's online backup gives a consistent snapshot even while the app is writing.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "budget-backup-"));
  const file = path.join(dir, "budget.db");
  try {
    await db.$client.backup(file);
    const data = await fs.readFile(file);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(data, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="budget-backup-${date}.db"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
