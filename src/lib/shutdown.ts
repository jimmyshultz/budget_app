import "server-only";

// Cleanup steps to run before the desktop app stops the server. Modules register their own
// (the database does when it opens), so the desktop bridge doesn't import them. That keeps
// the database module out of instrumentation's build trace, which would otherwise copy the
// local database into desktop builds.

const store = globalThis as unknown as { __budgetShutdownHooks?: Set<() => void> };

export function onShutdown(hook: () => void) {
  (store.__budgetShutdownHooks ??= new Set()).add(hook);
}

export function runShutdownHooks() {
  for (const hook of store.__budgetShutdownHooks ?? []) {
    try {
      hook();
    } catch (err) {
      console.error("Shutdown step failed:", err);
    }
  }
}
