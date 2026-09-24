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

- macOS (the encryption key is stored in the login Keychain; see [Security](#security))
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
   `setup` creates an encryption key in your Keychain and a `.env.local` file.
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
- **Schema changes:** edit `src/db/schema.ts` and run `npm run db:generate`. Migrations in
  `drizzle/` are applied automatically on startup.

## Security

- The server listens on `127.0.0.1` only, and `src/proxy.ts` rejects any request whose `Host`
  isn't localhost (DNS-rebinding protection). Server actions also get Next.js's origin checks.
- Plaid access tokens are encrypted in the database with AES-256-GCM. The key is kept in the macOS
  login Keychain (service `budget_app`), not in the repo, the database or `.env.local`. Setting
  `TOKEN_ENCRYPTION_KEY` (64 hex characters) in the environment overrides the Keychain, e.g. on
  another OS.
- `data/` and `.env.local` are git-ignored and created with owner-only permissions. `.next/` is also
  kept owner-only, because Next.js's build tool (Turbopack) caches environment values there.
- Only read-only Plaid products are used. Nothing in the app can move money.
- Recommended: turn on full-disk encryption (FileVault) and use two-factor login on your Plaid dashboard.

## Backups

Your data is `data/budget.db` plus `.env.local`, and the encryption key is in your login Keychain.
An encrypted Time Machine backup covers all three. If the Keychain item is lost, your history,
budgets and rules are kept, but each institution has to be reconnected.

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Create the Keychain key and `.env.local` (safe to re-run) |
| `npm run app` | Build and serve the app on 127.0.0.1:3000 (for everyday use) |
| `npm run dev` | Development server with hot reload |
| `npm run sync` | Sync all connections from the terminal |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:generate` | Generate a migration after editing the schema |
| `npm run db:studio` | Browse the local database |
| `npm run key:to-keychain` | Move a key stored in `.env.local` (older setups) into the Keychain |
| `npm run reset-data -- --yes` | Delete all local data: connections, transactions, budgets, rules |

## Project layout

```
src/app/            pages (budget, spending, transactions, accounts, rules) and server actions
src/components/     UI components (charts, budget meters, Plaid Link buttons)
src/db/             Drizzle schema and database setup
src/lib/            Plaid client, sync, categorization, queries, encryption
src/proxy.ts        localhost-only request guard
scripts/            setup, sync, key migration and reset scripts
drizzle/            SQL migrations
```
