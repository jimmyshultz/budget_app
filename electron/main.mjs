// Desktop app: runs the Next.js standalone server in an Electron utility process and shows it
// in a locked-down window. See PLAN.md (Phase 2).
//
//   Main process ──(parent port: config, shutdown)──▶ server (127.0.0.1:<random port>)
//        │                                                  ▲
//        └── window (cookie: per-launch token) ─────────────┘
//
// Secrets never go through environment variables: they're decrypted here with safeStorage and
// sent over the private parent port. The server rejects requests without the launch token.
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseEnv } from "node:util";
import { app, BrowserWindow, dialog, Menu, session, shell, utilityProcess } from "electron";
import { loadOrInitSecrets, saveSecrets } from "./secrets.mjs";

const DEV_ROOT = path.join(import.meta.dirname, "..");
const TOKEN_COOKIE = "budget_token"; // keep in sync with src/proxy.ts
const SHUTDOWN_TIMEOUT_MS = 5000;

/** Next.js inline scripts/styles need 'unsafe-inline'; everything else is same-origin only. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const serverEntry = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "server", "server.js")
    : path.join(DEV_ROOT, ".next", "standalone", "server.js");

let server = null;
let mainWindow = null;
let quitting = false;

// ─── One running copy ────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch(fail);
}

function fail(err) {
  console.error(err);
  dialog.showErrorBox("Budget couldn't start", String(err?.message ?? err));
  quitting = true;
  app.exit(1);
}

// ─── Development: copy Plaid keys and the encryption key from a dev checkout ──
// `npm run desktop -- --import-dev-secrets` (unpackaged only) stores .env.local's Plaid keys and
// the Keychain token key in safeStorage, so the desktop app can open data created by `npm run dev`.
async function importDevSecrets() {
  const env = parseEnv(fs.readFileSync(path.join(DEV_ROOT, ".env.local"), "utf8"));
  const { readKeychainKey } = await import("../scripts/keychain.mjs");
  const key = env.TOKEN_ENCRYPTION_KEY || readKeychainKey();
  const secrets = loadOrInitSecrets();
  saveSecrets({
    ...secrets,
    plaidClientId: env.PLAID_CLIENT_ID,
    plaidSecret: env.PLAID_SECRET,
    plaidEnv: env.PLAID_ENV === "production" ? "production" : "sandbox",
    ...(key ? { tokenEncryptionKey: key } : {}),
  });
  console.log("[desktop] imported Plaid keys and encryption key from the dev checkout");
}

// ─── Server ──────────────────────────────────────────────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForMessage(child, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server didn't send "${type}" in time`)), timeoutMs);
    const onMessage = (message) => {
      if (message?.type !== type) return;
      clearTimeout(timer);
      child.off("message", onMessage);
      resolve();
    };
    child.on("message", onMessage);
  });
}

async function waitForListening(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server didn't start listening in time");
}

/** The parent environment minus anything secret (a dev shell may have these set). */
function inheritedEnv() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(PLAID_|TOKEN_ENCRYPTION_KEY$|DATA_DIR$|APP_TOKEN$)/.test(name)) delete env[name];
  }
  return env;
}

async function startServer({ port, appToken, secrets }) {
  const child = utilityProcess.fork(serverEntry(), [], {
    serviceName: "Budget server",
    stdio: "pipe",
    // Secrets go over the parent port, never the environment.
    env: { ...inheritedEnv(), NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));
  child.on("exit", (code) => {
    server = null;
    if (!quitting) fail(new Error(`The app's server stopped unexpectedly (exit code ${code}).`));
  });

  await waitForMessage(child, "ready", 20000);
  child.postMessage({
    type: "config",
    values: {
      dataDir: path.join(app.getPath("userData"), "data"),
      plaidClientId: secrets.plaidClientId ?? "",
      plaidSecret: secrets.plaidSecret ?? "",
      plaidEnv: secrets.plaidEnv ?? "sandbox",
      tokenEncryptionKey: secrets.tokenEncryptionKey,
      appToken,
    },
  });
  await waitForMessage(child, "config-applied", 10000);
  await waitForListening(port);
  return child;
}

// ─── Window ──────────────────────────────────────────────────────────────────
async function createWindow(origin, appToken) {
  const ses = session.defaultSession;

  // Deny camera, microphone, notifications, geolocation, etc.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  // Strict CSP on the app's own pages.
  ses.webRequest.onHeadersReceived({ urls: [`${origin}/*`] }, (details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
  });

  // The per-launch token, as an HTTP-only cookie that only this origin receives.
  await ses.cookies.set({ url: origin, name: TOKEN_COOKIE, value: appToken, httpOnly: true, sameSite: "strict" });

  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    title: "Budget",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false },
  });
  win.once("ready-to-show", () => win.show());

  // Hosted Link (Plaid in the system browser) and ordinary links open in the default browser;
  // the app never opens windows of its own.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).protocol === "https:") shell.openExternal(url);
    return { action: "deny" };
  });
  // The window never leaves the app's own origin.
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === origin) return;
    event.preventDefault();
    if (new URL(url).protocol === "https:") shell.openExternal(url);
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.on("closed", () => (mainWindow = null));

  await win.loadURL(origin);
  return win;
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
async function start() {
  if (!app.isPackaged && process.argv.includes("--import-dev-secrets")) await importDevSecrets();

  const secrets = loadOrInitSecrets();
  const port = await freePort();
  const appToken = crypto.randomBytes(32).toString("hex");

  buildMenu();
  server = await startServer({ port, appToken, secrets });
  mainWindow = await createWindow(`http://127.0.0.1:${port}`, appToken);
}

// Single-window app: closing the window quits, on every platform.
app.on("window-all-closed", () => app.quit());

// Let the server close SQLite cleanly before exiting.
app.on("before-quit", (event) => {
  if (!server || quitting) return;
  event.preventDefault();
  quitting = true;
  const child = server;
  const forceKill = setTimeout(() => child.kill(), SHUTDOWN_TIMEOUT_MS);
  child.once("exit", () => {
    clearTimeout(forceKill);
    app.quit();
  });
  child.postMessage({ type: "shutdown" });
});
