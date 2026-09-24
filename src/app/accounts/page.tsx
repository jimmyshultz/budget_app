import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Account } from "@/db/schema";
import { ConnectButton } from "@/components/ConnectButton";
import { DisconnectButton } from "@/components/DisconnectButton";
import { ReconnectButton } from "@/components/ReconnectButton";
import { AddManualAccount, ManualBalance } from "@/components/ManualAccounts";
import { ACCOUNT_SECTIONS, isLiability } from "@/lib/accounts";
import { getConfig } from "@/lib/config";
import { formatCents } from "@/lib/format";

// Plaid errors that a fresh login through Link (update mode) resolves.
const LOGIN_ERRORS = [
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "ITEM_LOCKED",
  "INVALID_UPDATED_USERNAME",
  "USER_SETUP_REQUIRED",
  "ACCESS_NOT_GRANTED",
  "INSUFFICIENT_CREDENTIALS",
];

function needsLogin(error: string | null): boolean {
  return error != null && LOGIN_ERRORS.some((code) => error.startsWith(code));
}

export default async function AccountsPage() {
  await connection();
  // The desktop app runs Plaid in the system browser: banks block logins in embedded browsers.
  const hosted = getConfig().desktop;
  const items = db.select().from(schema.plaidItems).all();
  const accounts = db
    .select()
    .from(schema.accounts)
    .orderBy(asc(schema.accounts.type), asc(schema.accounts.name))
    .all()
    .filter((a) => !a.hidden);
  const institutionByItem = new Map(items.map((i) => [i.id, i.institutionName]));

  // Credit and loan balances are stored as positive amounts owed.
  const netWorth = accounts.reduce((sum, a) => {
    const bal = a.currentBalanceCents ?? 0;
    return sum + (isLiability(a.type) ? -bal : bal);
  }, 0);


  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">Net worth</p>
          <p className="text-3xl font-semibold tabular-nums">{formatCents(netWorth)}</p>
        </div>
        <ConnectButton hosted={hosted} />
      </section>

      {items.length > 0 && (
        <section>
          <h2 className="mb-2 border-b border-grid pb-1 font-medium">Connections</h2>
          <ul className="divide-y divide-grid">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p>{i.institutionName ?? "Unknown institution"}</p>
                  <p className="text-xs text-ink-muted">
                    {i.products} ·{" "}
                    {i.lastSyncedAt ? `synced ${new Date(i.lastSyncedAt).toLocaleString()}` : "never synced"}
                  </p>
                  {i.lastError && (
                    <p className="mt-1 text-xs text-status-critical">
                      {needsLogin(i.lastError)
                        ? `${i.institutionName ?? "This bank"} needs you to log in again. Click Reconnect; your history is kept.`
                        : i.lastError}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <ReconnectButton
                    itemId={i.id}
                    institution={i.institutionName ?? "this bank"}
                    needsLogin={needsLogin(i.lastError)}
                    hosted={hosted}
                  />
                  <DisconnectButton itemId={i.id} institution={i.institutionName ?? "this connection"} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accounts.length === 0 && <p className="text-neutral-500">No accounts yet. Connect one to get started.</p>}

      <AddManualAccount />

      {ACCOUNT_SECTIONS.map((section) => {
        const rows = accounts.filter((a) => a.type === section.type);
        if (rows.length === 0) return null;
        const total = rows.reduce((s, a) => s + (a.currentBalanceCents ?? 0), 0);
        return (
          <section key={section.type}>
            <div className="mb-2 flex items-baseline justify-between border-b border-neutral-200 pb-1 dark:border-neutral-800">
              <h2 className="font-medium">{section.label}</h2>
              <span className="tabular-nums text-neutral-500">
                {section.isLiability && total > 0 ? "−" : ""}
                {formatCents(total)}
              </span>
            </div>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {rows.map((a) => (
                <AccountRow key={a.id} account={a} institution={institutionByItem.get(a.itemId ?? "")} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AccountRow({ account: a, institution }: { account: Account; institution?: string | null }) {
  const manual = a.itemId == null;
  return (
    <li className="flex items-center justify-between py-2">
      <div>
        <p>
          {a.name}
          {a.mask && <span className="text-neutral-400"> ••{a.mask}</span>}
        </p>
        <p className="text-xs text-neutral-500">
          {manual ? "Entered manually" : [institution, a.subtype].filter(Boolean).join(" · ")}
        </p>
      </div>
      {manual ? (
        <ManualBalance
          key={`${a.currentBalanceCents}`}
          accountId={a.id}
          name={a.name}
          balanceCents={a.currentBalanceCents}
          updatedAt={a.updatedAt}
        />
      ) : (
        <div className="text-right">
          <p className="tabular-nums">{formatCents(a.currentBalanceCents)}</p>
          {a.type === "credit" && a.creditLimitCents != null && (
            <p className="text-xs text-neutral-500">limit {formatCents(a.creditLimitCents)}</p>
          )}
        </div>
      )}
    </li>
  );
}
