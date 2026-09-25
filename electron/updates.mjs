// "Update available" check: asks GitHub for the latest published release and, if it's newer,
// offers to open its download page. Nothing is downloaded or installed automatically (that needs
// a signed app); the user downloads the new .dmg and drags it into Applications.
//
// The only request is an anonymous GET to api.github.com. It can be turned off from the app menu.

const TIMEOUT_MS = 10_000;

/** "1.2.3" or "v1.2.3" → [1, 2, 3]; null if it isn't a plain release version. */
export function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  return match ? match.slice(1).map(Number) : null;
}

/** True if `latest` is a higher release version than `current`. */
export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** "github:owner/repo", "https://github.com/owner/repo(.git)" or {url} → "owner/repo". */
export function repoSlug(repository) {
  const value = typeof repository === "object" ? repository?.url : repository;
  const match = /^(?:github:|(?:git\+)?https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(value ?? "");
  return match ? match[1] : null;
}

/**
 * The latest published release (drafts and pre-releases excluded), or null if there's none.
 * The download page URL is rebuilt from the repo and tag rather than taken from the response.
 */
export async function fetchLatestRelease(slug, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.github.com/repos/${slug}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Budget-update-check" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const { tag_name: tag } = await res.json();
  if (!parseVersion(tag)) return null;
  return {
    version: tag.replace(/^v/, ""),
    url: `https://github.com/${slug}/releases/tag/${encodeURIComponent(tag)}`,
  };
}

/**
 * Check once and tell the user if there's something to do.
 * `manual` (from the menu) also reports "up to date" and errors, and ignores a skipped version.
 */
export async function checkForUpdates({ slug, currentVersion, prefs, ui, manual = false, fetchImpl }) {
  let latest;
  try {
    latest = await fetchLatestRelease(slug, fetchImpl);
  } catch (err) {
    if (manual) await ui.showError(String(err?.message ?? err));
    return "error";
  }

  if (!latest || !isNewer(latest.version, currentVersion)) {
    if (manual) await ui.showUpToDate(currentVersion);
    return "up-to-date";
  }
  if (!manual && prefs.get().skippedVersion === latest.version) return "skipped";

  const choice = await ui.showUpdateAvailable(latest.version, currentVersion);
  if (choice === "download") await ui.openExternal(latest.url);
  if (choice === "skip") prefs.set({ skippedVersion: latest.version });
  return choice;
}
