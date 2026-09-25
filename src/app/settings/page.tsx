import { connection } from "next/server";
import { db, schema } from "@/db";
import { PlaidKeysForm } from "@/components/PlaidKeysForm";
import { canSaveSettings, getConfig } from "@/lib/config";

export default async function SettingsPage() {
  await connection();
  const config = getConfig();
  const connections = db.select({ id: schema.plaidItems.id }).from(schema.plaidItems).all().length;

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Section title="Plaid">
        {canSaveSettings() ? (
          <>
            <p className="text-sm text-ink-secondary">
              Connected to Plaid <strong>{config.plaidEnv === "production" ? "Production" : "Sandbox"}</strong>
              {connections > 0 && ` with ${connections} ${connections === 1 ? "connection" : "connections"}`}. Switching
              environment or Plaid account disconnects existing connections.
            </p>
            <PlaidKeysForm
              initialClientId={config.plaidClientId}
              initialEnv={config.plaidEnv}
              hasSecret={Boolean(config.plaidSecret)}
            />
          </>
        ) : (
          <p className="text-sm text-ink-secondary">
            Running from source: Plaid keys and environment come from <code>.env.local</code> (currently{" "}
            <strong>{config.plaidEnv}</strong>). Edit it and restart to change them.
          </p>
        )}
      </Section>

      <Section title="Your data">
        {config.desktop && (
          <p className="text-sm text-ink-secondary">
            Stored in <code className="break-all">{config.dataDir}</code>
          </p>
        )}
        <form method="post" action="/api/backup" className="flex flex-col items-start gap-2">
          <button className="rounded-md border border-grid px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Download a backup
          </button>
          <p className="text-xs text-ink-muted">
            A copy of your database: transactions, budgets, rules and accounts. Keep it somewhere private. Bank
            connections in a backup only work on this computer; elsewhere you&apos;d reconnect them.
          </p>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-b border-grid pb-1 font-medium">{title}</h2>
      {children}
    </section>
  );
}
