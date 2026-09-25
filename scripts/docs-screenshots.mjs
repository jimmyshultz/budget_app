// Captures the app screenshots in docs/images/ from the desktop server build, using a throwaway
// data folder, fake Plaid keys and a fake Sandbox connection. It never touches your real data,
// the keychain or Plaid.
//
//   node scripts/build-desktop.mjs          # if the server build is out of date
//   npx electron scripts/docs-screenshots.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { app, BrowserWindow, nativeTheme, session, utilityProcess } from "electron";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "images");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "budget-screenshots-"));
const DATA = path.join(WORK, "data");

process.on("exit", () => fs.rmSync(WORK, { recursive: true, force: true }));
// Chromium's own profile (cookies, caches). Its helper processes write to it until after exit, so
// it lives in one reused temp folder instead of being deleted.
app.setPath("userData", path.join(os.tmpdir(), "budget-docs-screenshots-profile"));
app.dock?.hide();
app.on("window-all-closed", () => {}); // keep running between screenshots
nativeTheme.themeSource = "light";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const waitFor = (child, type) => new Promise((resolve) => child.on("message", (m) => m?.type === type && resolve()));

/** Run the server with the given config values for the duration of `fn(origin)`. */
async function withServer(values, fn) {
  const port = await freePort();
  const appToken = crypto.randomBytes(32).toString("hex");
  const child = utilityProcess.fork(path.join(ROOT, ".next", "standalone", "server.js"), [], {
    stdio: "pipe",
    env: { PATH: process.env.PATH, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
  });
  child.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));
  // Accept (and forget) settings saves, like the desktop app would store them.
  child.on("message", (m) => m?.type === "save-settings" && child.postMessage({ type: "settings-saved", id: m.id }));
  await waitFor(child, "ready");
  child.postMessage({
    type: "config",
    values: { dataDir: DATA, plaidEnv: "sandbox", tokenEncryptionKey: "0".repeat(64), appToken, ...values },
  });
  await waitFor(child, "config-applied");
  await sleep(1500);
  const origin = `http://127.0.0.1:${port}`;
  await session.defaultSession.cookies.set({ url: origin, name: "budget_token", value: appToken, httpOnly: true });
  try {
    await fn(origin);
  } finally {
    child.kill();
    await sleep(500);
  }
}

/**
 * Save a screenshot of `route`. `clip` is a JS expression for the element to crop to, or
 * { untilText } to keep everything from the top down to the element with that exact text.
 */
async function shot(origin, route, file, { width = 1100, clip, pad = 16, before } = {}) {
  const win = new BrowserWindow({ width, height: 800, show: false, webPreferences: { sandbox: true } });
  await win.loadURL(origin + route);
  if (before) await win.webContents.executeJavaScript(before);
  await sleep(600);
  const height = await win.webContents.executeJavaScript("document.documentElement.scrollHeight");
  win.setContentSize(width, Math.min(height, 3000));
  await sleep(600);

  let rect;
  if (clip?.untilText) {
    rect = await win.webContents.executeJavaScript(`(() => {
      const el = [...document.querySelectorAll("button, a, span, p, h2, div")]
        .reverse()
        .find((e) => e.textContent.trim() === ${JSON.stringify(clip.untilText)});
      return { x: 0, y: 0, width: ${width}, height: Math.ceil(el.getBoundingClientRect().bottom + ${pad * 2}) };
    })()`);
  } else if (clip) {
    rect = await win.webContents.executeJavaScript(`(() => {
      const r = (${clip}).getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.x - ${pad})),
        y: Math.max(0, Math.floor(r.y - ${pad})),
        width: Math.ceil(r.width + ${pad * 2}),
        height: Math.ceil(r.height + ${pad * 2}),
      };
    })()`);
  }
  const image = await win.webContents.capturePage(rect);
  fs.writeFileSync(path.join(OUT, file), image.toPNG());
  console.log(`wrote docs/images/${file}`, image.getSize());
  win.destroy();
}

function seedSandboxConnection() {
  const db = new Database(path.join(DATA, "budget.db"));
  const now = new Date().toISOString();
  // Marked as just synced, so the app doesn't try to sync it with Plaid.
  db.prepare(
    "insert into plaid_items (id, access_token_enc, institution_id, institution_name, products, last_synced_at) values (?, ?, ?, ?, ?, ?)",
  ).run("item-demo", "not-a-real-token", "ins_109508", "First Platypus Bank", "transactions", now);
  const account = db.prepare(
    "insert into accounts (id, item_id, name, mask, type, subtype, current_balance_cents, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  account.run("acct-checking", "item-demo", "Plaid Checking", "0000", "depository", "checking", 1250_00, now);
  account.run("acct-credit", "item-demo", "Plaid Credit Card", "3333", "credit", "credit card", 410_00, now);
  db.close();
}

app.whenReady().then(async () => {
  let failed = false;
  try {
    fs.mkdirSync(OUT, { recursive: true });

    // First run: no Plaid keys yet.
    await withServer({ plaidClientId: "", plaidSecret: "" }, async (origin) => {
      await shot(origin, "/setup", "setup.png", { width: 760 });
      await shot(origin, "/", "_unused.png"); // opens the database so it can be seeded
      fs.rmSync(path.join(OUT, "_unused.png"));
    });

    seedSandboxConnection();
    await withServer({ plaidClientId: "0123456789abcdef01234567", plaidSecret: "not-a-real-secret" }, async (origin) => {
      // Only the Plaid section: the rest of Settings shows the data folder's path.
      await shot(origin, "/settings", "settings-production.png", {
        width: 900,
        clip: `document.querySelector("section")`,
        before: `document.querySelectorAll('input[name="env"]')[1].click()`,
      });
      await shot(origin, "/accounts", "accounts.png", { width: 1000, clip: { untilText: "Disconnect" }, pad: 20 });
    });
  } catch (err) {
    console.error(err);
    failed = true;
  } finally {
    app.exit(failed ? 1 : 0);
  }
});
