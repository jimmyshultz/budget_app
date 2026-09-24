import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { min } from "drizzle-orm";
import { db, schema } from "@/db";
import { SyncButton } from "@/components/SyncButton";
import { getPlaidEnv } from "@/lib/plaid";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget",
  description: "Local personal budgeting",
};

const NAV = [
  { href: "/", label: "Budget" },
  { href: "/spending", label: "Spending" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/rules", label: "Rules" },
];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const plaidEnv = getPlaidEnv();
  // Oldest sync across connections, so the label never overstates freshness.
  const [{ lastSyncedAt }] = db
    .select({ lastSyncedAt: min(schema.plaidItems.lastSyncedAt) })
    .from(schema.plaidItems)
    .all();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-sm text-ink-secondary hover:text-foreground">
                  {n.label}
                </Link>
              ))}
              {plaidEnv !== "production" && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Plaid {plaidEnv}
                </span>
              )}
            </nav>
            <SyncButton lastSyncedAt={lastSyncedAt} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
