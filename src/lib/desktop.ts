import "server-only";
import { setConfig, type AppConfig } from "./config";
import { runShutdownHooks } from "./shutdown";

// Bridge to the Electron main process when the server runs as an Electron utility process.
// The main process keeps secrets in the OS keychain (safeStorage) and sends them here over
// Electron's private parent port, never through environment variables.
//
// Messages from main:   { type: "config", values }  → applied with setConfig()
//                       { type: "shutdown" }        → close the database and exit
// Messages to main:     { type: "ready" }, { type: "config-applied" }

type ParentPort = {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
};

type Message = { type: "config"; values: Partial<AppConfig> } | { type: "shutdown" };

const CONFIG_TIMEOUT_MS = 15_000;

/**
 * Wait for the desktop app to send configuration. Called from instrumentation's register(),
 * which Next.js awaits before handling any request, so nothing runs unconfigured.
 */
export function connectDesktopBridge(): Promise<void> {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (!port) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Desktop app never sent configuration")), CONFIG_TIMEOUT_MS);

    port.on("message", ({ data }) => {
      const message = data as Message;
      if (message.type === "config") {
        setConfig({ ...message.values, desktop: true });
        clearTimeout(timer);
        port.postMessage({ type: "config-applied" });
        resolve();
      } else if (message.type === "shutdown") {
        // Closes SQLite cleanly (checkpoints the WAL into the main database file).
        runShutdownHooks();
        process.exit(0);
      }
    });

    port.postMessage({ type: "ready" });
  });
}
