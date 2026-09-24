# Plan: Desktop App (open source, bring your own Plaid keys)

**Goal:** someone downloads an installer, opens the app, pastes in their own Plaid keys, and
connects their banks. No Node, no terminal. Their data never leaves their computer except
through the app's own calls to Plaid.

## 1. Electron or Tauri

**Decision: Electron.** The app needs Node.js to run: its Next.js server, the SQLite library
(`better-sqlite3`, which includes compiled native code) and the Plaid SDK. Electron ships with
Node built in, so today's code runs almost unchanged. Tauri produces much smaller downloads, but
it doesn't include Node, so a separate Node program would have to be bundled alongside it.

```
Electron app
 ├─ Main process
 │   ├─ picks a random free port and a random token for each launch
 │   ├─ starts the Next.js server (self-contained production build) on 127.0.0.1:<port>
 │   └─ opens a locked-down window pointing at it
 ├─ Next.js server (today's app: pages, server actions, sync, Plaid)
 └─ Data folder: the operating system's per-user app-data folder, holding budget.db
```

## 2. Code changes

| Area | Today | Desktop version |
|---|---|---|
| Data location | `./data/budget.db` | The per-user app-data folder from Electron, passed in as a setting |
| Plaid keys | `.env.local` | Entered in an in-app **Settings** screen, stored encrypted with Electron's `safeStorage` |
| Encryption key | macOS Keychain via the `security` command | `safeStorage`, which uses Keychain on macOS, DPAPI on Windows and libsecret on Linux |
| Local-only protection | Rejects hostnames other than localhost | Keep that, **plus** a per-launch token: the window gets it as a cookie and the server rejects requests without it, so other programs and websites on the machine can't reach the server |
| Scripts (`setup`, `reset-data`, `key:to-keychain`) | Terminal commands | Settings screen: keys, switch Sandbox/Production, reset data, export a backup |
| Links | Open in the browser | External links open in the system browser; the app window never loads other websites |

Pages, budgeting logic, categorization and Plaid sync don't change. Development still uses
`npm run dev`, with a desktop-app dev mode that points the window at the dev server.

**Locking down Electron:** `contextIsolation`, `sandbox` and `nodeIntegration: false`, so web pages
in the window can't reach Node; allow only the app's own address and the Plaid/bank pop-ups;
allow only one copy of the app to run at a time.

## 3. First-run setup flow

1. **Welcome:** a plain explanation that the app runs locally and needs a free Plaid account.
2. **Plaid keys:** step-by-step instructions (sign up → Developers → Keys), paste client ID and
   secret, choose Sandbox or Production. The app tests the keys immediately.
3. **Try Sandbox first:** connect a fake bank using `user_good` so people see the app working
   before dealing with Plaid's Production approval.
4. **Going live:** a checklist covering requesting products, OAuth registration for some banks,
   and resetting the Sandbox data.

Each user needs their own Plaid Production approval. The app can guide them but can't do it for
them. This is the main reason to add SimpleFIN later as an alternative way to connect banks.

## 4. Distribution

- **Builds:** `electron-builder` produces a macOS `.dmg` (Apple Silicon and Intel), a Windows `.exe`
  installer and a Linux AppImage.
- **Automated builds:** GitHub Actions builds all three on a version tag and publishes them to GitHub Releases.
- **Code signing:** without it, macOS refuses to open the app and Windows shows warnings.
  - macOS: Apple Developer Program (about $99/year), including notarization.
  - Windows: a code-signing certificate, or a cheaper option such as Azure Trusted Signing.
- **Auto-update:** `electron-updater` checks GitHub Releases. Requires signing on macOS.

## 5. Phases

| Phase | What | Done when |
|---|---|---|
| **0. Risk tests** | Run the Next.js server inside Electron with SQLite rebuilt for Electron. **Test Plaid Link inside the Electron window, including OAuth pop-ups for a real bank.** Test `safeStorage`. | A real OAuth bank connects inside the desktop window |
| **1. Make it portable** | Data folder as a setting; swappable storage for keys (env vars in development, `safeStorage` in the app); remove the macOS-only code | `npm run dev` still works, with no `.env.local` or Keychain dependency in the core code |
| **2. Desktop shell** | Main process, random port and token, window lockdown, single running copy, menus, clean shutdown | The app launches from a packaged build |
| **3. In-app setup and settings** | The setup flow above; Settings (keys, environment, reset, export backup) | A non-developer can go from install to Sandbox data without a terminal |
| **4. Packaging and releases** | electron-builder, signing, notarization, GitHub Actions, auto-update | A tagged release produces signed installers |
| **5. Open-source launch** | Make the repo public: license, SECURITY.md, Plaid setup guide with screenshots, issue templates, and a commit email that doesn't reveal a personal address | Public repo with release downloads |
| **Later** | SimpleFIN as a second way to connect banks; CSV import; restoring a backup onto a new machine | |

**Biggest risk:** Plaid Link's OAuth pop-ups inside Electron. Some banks open their own login in a
pop-up, and Electron has to allow it and pass the result back correctly. If that doesn't work
cleanly, the fallback is Plaid's Hosted Link, which opens in the user's regular browser and returns
to the app.

**Design issue for later:** stored bank connections are encrypted with a key tied to one computer.
A backup restored on a new machine would keep history, budgets and rules, but banks would need
reconnecting, and reconnecting creates new account IDs. Restore would have to match old and new
accounts by institution and the last 4 digits of the account number, so history doesn't split.

## 6. Open decisions

1. **Platforms for version 1:** macOS only first, or all three from the start?
2. **Code signing:** pay for the Apple Developer Program (about $99/year)? Without it, macOS users
   have to right-click → Open, plus a security prompt, to launch the app.
3. **License:** MIT or AGPL?
4. **SimpleFIN:** in version 1, or later?

## Phase 0 results

_In progress._

## Phase 1 results (make it portable)

Done. The server reads all settings from `src/lib/config.ts`: environment variables by default,
with `setConfig()` for the desktop app to supply secrets from `safeStorage`. No core code touches
`process.env` or the macOS Keychain.

- `DATA_DIR`, Plaid keys/environment and the token key all come from config. The Plaid client is
  built lazily and rebuilt if the keys or environment change (needed for in-app settings in Phase 3).
- `scripts/run.mjs` starts every npm script: keeps `.next/` private (cross-platform, replacing
  `mkdir -p && chmod`) and, on macOS, loads the key from the Keychain into the environment.
  `setup` writes the key to `.env.local` on non-macOS systems.
- **Found:** Turbopack's on-disk cache snapshots environment variables, so secrets were being written
  to `.next/cache`. Turned off (`turbopackFileSystemCacheForDev/ForBuild: false`); verified 0 files in
  `.next/` contain the key, Plaid secret or client ID after dev, normal and standalone builds.
- Standalone output is opt-in (`BUILD_STANDALONE=1`) because `next start` doesn't support it.
- Verified: `npm run dev`, `npm run app`, `npm run sync` and in-app Sync all work; a missing key
  gives a clear error.

Not carried over from the spike yet: the Electron shell (Phase 2) and Hosted Link Connect/Reconnect
(Phases 2–3).

## Phase 2 results (desktop shell)

Done. `npm run desktop` runs the app in Electron from a dev checkout; `npm run desktop:package`
builds an unsigned `dist-desktop/mac-arm64/Budget.app`, which launches and works.

**How it fits together**
- `electron/main.mjs` starts the standalone server as an Electron utility process on
  `127.0.0.1:<random port>`, then opens one locked-down window.
- **Secrets** (Plaid keys, token encryption key) are stored in `<userData>/secrets.json`, encrypted
  with `safeStorage` (`electron/secrets.mjs`). The main process sends them to the server over the
  private parent port; `src/instrumentation.ts` → `src/lib/desktop.ts` waits for them and applies
  them with `setConfig()` before the server handles any request. The server's environment holds no
  secrets (verified).
- **Launch token:** a random token per launch, set as an HTTP-only, SameSite=Strict cookie for the
  app's origin. `src/proxy.ts` rejects any request without it (verified 403 for missing/wrong token,
  including server-action POSTs).
- **Window:** `contextIsolation`, `sandbox`, no `nodeIntegration`, no webviews, all permission
  requests denied, strict CSP (same-origin only; `'unsafe-inline'` for Next.js inline scripts and
  styles), never navigates off the app's origin; `https:` links and Plaid Hosted Link open in the
  default browser.
- **Hosted Link** for Connect and Reconnect in the desktop app (`hosted` prop from
  `getConfig().desktop`). New connections' public tokens are read from `/link/token/get` on the
  server, so they never reach the window. In-page Link is still used in the browser.
- **One running copy** (a second launch exits and focuses the first), app menu (DevTools only when
  unpackaged), and **clean shutdown**: on quit the server runs its shutdown hooks (SQLite close,
  WAL checkpointed; verified no `-wal`/`-shm` left) before exiting.
- `--import-dev-secrets` (unpackaged only) copies `.env.local`'s Plaid keys and the Keychain key
  into `safeStorage`, so the desktop app can open data from a dev checkout.

**Packaging**
- `electron-builder`: `app.asar` holds only `electron/` and `package.json`. The server and its
  trimmed `node_modules` are copied to `Resources/server` by `scripts/after-pack.cjs`
  (`extraResources` always drops `node_modules`, and SQLite's native file can't load from asar).
- `scripts/build-desktop.mjs` builds the standalone server and **fails the build if any `.db`,
  `.env*` or `data/` is in the output**. Verified the packaged app has no database, env file,
  `secrets.json` or secret values.
- Unsigned, arm64 only, default icon. About 340 MB (mostly the Electron framework).

**Found along the way**
- The build tracer copied the local database into the build twice: once via a literal default
  `path.join(cwd, "data")` in config, and once via `path.join(DATA_DIR, "budget.db")`, which it turns
  into a `*/budget.db` wildcard. `outputFileTracingExcludes` doesn't apply to instrumentation or proxy
  traces. Fixes: config has no default data path (the dev launcher sets `DATA_DIR=./data`), and the
  desktop bridge runs registered shutdown hooks instead of importing the database module.
- The database now opens on first query, not at import, so `next build` no longer opens or migrates
  the real database.

**Left for later phases**
- Phase 3: in-app setup and Settings to replace `--import-dev-secrets` (a fresh install has no
  Plaid keys yet); optional `completion_redirect_uri` to bring the app forward after Hosted Link.
- Phase 4: signing and notarization, icons, x64 and universal builds, Windows and Linux, trimming
  unused server dependencies (e.g. `sharp`), release automation.
