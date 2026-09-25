import "server-only";
import { randomUUID } from "node:crypto";
import { setConfig, setSettingsPersister, type AppConfig, type EditableSettings } from "./config";
import { runShutdownHooks } from "./shutdown";

// Bridge to the Electron main process when the server runs as an Electron utility process.
// The main process keeps secrets in the OS keychain (safeStorage) and sends them here over
// Electron's private parent port, never through environment variables.
//
// From main:  { type: "config", values }             → applied with setConfig()
//             { type: "shutdown" }                   → run shutdown hooks (close SQLite) and exit
//             { type: "settings-saved", id, error? } → reply to save-settings
// To main:    { type: "ready" }, { type: "config-applied" }
//             { type: "save-settings", id, values }  → main stores them with safeStorage

type ParentPort = {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
};

type Message =
  | { type: "config"; values: Partial<AppConfig> }
  | { type: "shutdown" }
  | { type: "settings-saved"; id: string; error?: string };

const CONFIG_TIMEOUT_MS = 15_000;
const SAVE_TIMEOUT_MS = 10_000;

/**
 * Wait for the desktop app to send configuration. Called from instrumentation's register(),
 * which Next.js awaits before handling any request, so nothing runs unconfigured.
 */
export function connectDesktopBridge(): Promise<void> {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (!port) return Promise.resolve();

  const pendingSaves = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();

  setSettingsPersister(
    (values: EditableSettings) =>
      new Promise<void>((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          pendingSaves.delete(id);
          reject(new Error("The app didn't confirm saving settings."));
        }, SAVE_TIMEOUT_MS);
        pendingSaves.set(id, {
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        port.postMessage({ type: "save-settings", id, values });
      }),
  );

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Desktop app never sent configuration")), CONFIG_TIMEOUT_MS);

    port.on("message", ({ data }) => {
      const message = data as Message;
      if (message.type === "config") {
        setConfig({ ...message.values, desktop: true });
        clearTimeout(timer);
        port.postMessage({ type: "config-applied" });
        resolve();
      } else if (message.type === "settings-saved") {
        const pending = pendingSaves.get(message.id);
        pendingSaves.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error));
        else pending?.resolve();
      } else if (message.type === "shutdown") {
        // Closes SQLite cleanly (checkpoints the WAL into the main database file).
        runShutdownHooks();
        process.exit(0);
      }
    });

    port.postMessage({ type: "ready" });
  });
}
