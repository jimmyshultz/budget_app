# Budget App

A self-hosted personal budgeting app in the spirit of Mint. It pulls accounts and transactions
through [Plaid](https://plaid.com), categorizes transactions automatically, and lets you plan a
monthly budget (income and spending) and track it as the month goes.

It runs **only on your own machine**, at `http://127.0.0.1:3000`. Your data lives in a local SQLite
file and leaves the machine only through the app's own API calls to Plaid.

## Features

- **Budget:** expected income and a monthly amount per spending category. A plan summary shows
  expected income − planned spending = left to plan. Progress bars mark how far through the month
  you are and flag categories that are ahead of pace or over budget.
- **Spending:** this month by category plus a 6-month trend, with drill-down into transactions.
- **Transactions:** filter by month, account, category or text; recategorize inline and save the
  change as a rule for future transactions.
- **Rules:** "when the description contains X, use category Y", applied to new and existing transactions.
- **Accounts and net worth:** balances from every connection, plus manual accounts for things an
  aggregator can't reach (home value, a loan, a car).
- **Connection management:** reconnect when a bank asks you to log in again (history is kept), or
  disconnect.

## Requirements

- macOS, Linux or Windows. On macOS the encryption key is kept in the login Keychain; elsewhere it
  goes in `.env.local` (see [Security](#security)).
- Node.js 22 or later
- A Plaid account (free to sign up; Sandbox is free)

## Setup

1. Sign up at https://dashboard.plaid.com and copy your **client ID** and **Sandbox secret** from
   Developers → Keys.
2. Install and initialize:
   ```bash
   npm install
   npm run setup
   ```
   `setup` creates a `.env.local` file and an encryption key (in the Keychain on macOS, in
   `.env.local` elsewhere).
3. Paste your Plaid client ID and secret into `.env.local`.
4. Start the app and open http://127.0.0.1:3000:
   ```bash
   npm run app
   ```
5. On **Accounts**, click **Connect account**. In Sandbox, pick any institution and log in with
   `user_good` / `pass_good`. For a larger, more realistic data set, use `user_transactions_dynamic`
   with any password.

## Using real accounts

1. In the Plaid dashboard, request Production access for the products you need (below). Some
   institutions also require Plaid's OAuth registration, which is approved separately. Check the
   dashboard's OAuth page.
2. Stop the app and clear the Sandbox data (Sandbox connections don't work with Production keys):
   ```bash
   npm run reset-data -- --yes
   ```
3. In `.env.local`, set `PLAID_ENV=production` and replace `PLAID_SECRET` with your Production secret.
4. Run `npm run app` and connect each institution **once**. Each connection typically counts toward
   your Plaid plan's limit. To add accounts from an institution you've already connected, use
   **Reconnect** rather than connecting it again.

Choose the connection type before clicking **Connect account**. Each one requests a different Plaid product:

| Type | Plaid product | Typical accounts |
|---|---|---|
| Bank or credit card | Transactions | Checking, savings, credit cards |
| Investments | Investments | Brokerage, IRA, 401(k) |
| Mortgage / loan | Liabilities | Mortgages, student loans |

If an institution can't be connected, add it on **Accounts** as a manual account and update its balance occasionally.

## How it works

- **Stack:** Next.js (App Router, server actions), SQLite via `better-sqlite3` and Drizzle ORM,
  Plaid Node SDK and Plaid Link, Tailwind CSS. Charts are plain HTML/CSS.
- **Syncing:** there are no webhooks, since the server isn't reachable from the internet. The app
  syncs with Plaid's `/transactions/sync` when you open it, if the last sync is more than 6 hours
  old, or when you press **Sync now**. `npm run sync` does the same from a terminal.
- **Categorization** (`src/lib/categorize.ts`): your rules first, then Plaid's
  `personal_finance_category` mapped to the app's categories. Credit card payments and transfers
  between your own accounts are excluded from spending. Categories you set by hand are never
  overwritten, even when a pending charge posts.
- **Money** is stored as integer cents. Transaction amounts follow Plaid's sign convention:
  positive = money out.
- **Configuration** (`src/lib/config.ts`): the only place the server reads settings. Values come
  from environment variables (`DATA_DIR`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`,
  `TOKEN_ENCRYPTION_KEY`) or from `setConfig()`, which the desktop app will use. The npm scripts
  start everything through `scripts/run.mjs`, which keeps `.next/` private and, on macOS, loads the
  encryption key from the Keychain.
- **Schema changes:** edit `src/db/schema.ts` and run `npm run db:generate`. Migrations in
  `drizzle/` are applied automatically on startup.

## Security

- The server listens on `127.0.0.1` only, and `src/proxy.ts` rejects any request whose `Host`
  isn't localhost (DNS-rebinding protection). Server actions also get Next.js's origin checks.
- Plaid access tokens are encrypted in the database with AES-256-GCM. On macOS the key is kept in
  the login Keychain (service `budget_app`), not in the repo, the database or `.env.local`. On other
  systems it's `TOKEN_ENCRYPTION_KEY` (64 hex characters) in `.env.local`.
- `data/` and `.env.local` are git-ignored and created with owner-only permissions. Turbopack's
  on-disk cache is turned off because it snapshots environment variables (including secrets), and
  `.next/` is kept owner-only.
- Desktop (`BUILD_STANDALONE=1`) builds exclude `data/` and `.env*` from the output.
- Only read-only Plaid products are used. Nothing in the app can move money.
- Recommended: turn on full-disk encryption (FileVault) and use two-factor login on your Plaid dashboard.

## Backups

Your data is `data/budget.db` plus `.env.local`, and the encryption key is in your login Keychain.
An encrypted Time Machine backup covers all three. If the Keychain item is lost, your history,
budgets and rules are kept, but each institution has to be reconnected.

## Installing the desktop app (macOS)

Download the `.dmg` for your Mac from the GitHub Releases page:

- **Apple Silicon** (M1 or later): `Budget-<version>-arm64.dmg`
- **Intel**: `Budget-<version>-x64.dmg`

Open it and drag **Budget** to Applications. The app isn't signed with an Apple Developer ID yet,
so the first time you open it macOS will say it can't verify the developer:

1. Try to open Budget once, then click **Done** (not Move to Trash).
2. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to
   the message about Budget. Confirm with your password or Touch ID.
3. After that it opens normally.

Because the app isn't Developer ID-signed, macOS treats each new version as a different app. After
an update you'll see *"Budget wants to use your confidential information stored in 'Budget Safe
Storage' in your keychain"*. Enter your password and click **Always Allow** (not **Allow**) and it
won't ask again until the next update. The app waits while that prompt is open.

On first launch, Budget walks you through entering your Plaid keys. Its data lives in
`~/Library/Application Support/Budget`; see [Backups](#backups).

## Desktop app development

The app can also run as an Electron desktop app; see `PLAN.md` for the design and status.

```bash
npm run desktop                            # build the server and open the app
npm run desktop -- --import-dev-secrets    # optional: reuse this checkout's Plaid keys and key
npm run desktop:package                    # arm64 + x64 .dmg in dist-desktop/
npm run desktop:package:dir                # just the .app, for quick local testing
```

Releases are built by GitHub Actions (`.github/workflows/release.yml`): bump `version` in
`package.json`, commit, then push a matching tag (`git tag v0.2.0 && git push origin v0.2.0`). The
workflow attaches both installers to a draft release for you to review and publish.

On first launch the app opens a setup page where you enter your Plaid keys; change them later in
**Settings**, which also has **Download a backup**. `BUDGET_USER_DATA=/some/folder npm run desktop`
uses a separate profile (handy for trying the first-run experience).

The desktop app keeps its data and encrypted secrets in the OS per-user app-data folder
(`~/Library/Application Support/Budget` on macOS), separate from this checkout's `data/`.

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Create `.env.local` and the encryption key (safe to re-run) |
| `npm run app` | Build and serve the app on 127.0.0.1:3000 (for everyday use) |
| `npm run dev` | Development server with hot reload |
| `npm run sync` | Sync all connections from the terminal |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:generate` | Generate a migration after editing the schema |
| `npm run db:studio` | Browse the local database |
| `npm run build` / `npm run start` | The two halves of `npm run app` |
| `npm run key:to-keychain` | macOS: move a key stored in `.env.local` (older setups) into the Keychain |
| `npm run reset-data -- --yes` | Delete all local data: connections, transactions, budgets, rules |

## Project layout

```
src/app/            pages (budget, spending, transactions, accounts, rules) and server actions
src/components/     UI components (charts, budget meters, Plaid Link buttons)
src/db/             Drizzle schema and database setup
src/lib/            Plaid client, sync, categorization, queries, encryption
src/proxy.ts        localhost-only request guard
scripts/            dev launcher, setup, sync, key migration, reset and desktop build scripts
electron/           desktop app main process and encrypted secret storage
drizzle/            SQL migrations
```
