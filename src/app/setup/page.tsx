import Link from "next/link";
import { connection } from "next/server";
import { PlaidKeysForm } from "@/components/PlaidKeysForm";
import { canSaveSettings, getConfig } from "@/lib/config";

const PLAID_SIGNUP = "https://dashboard.plaid.com/signup";
const PLAID_KEYS = "https://dashboard.plaid.com/developers/keys";

export default async function SetupPage() {
  await connection();
  const config = getConfig();

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Welcome to Budget</h1>
        <p className="text-ink-secondary">
          Budget runs entirely on this computer. Your transactions, budgets and settings are stored here, and the only
          outside service that sees them is Plaid, which connects to your banks. You use your own free Plaid account, so
          nobody else is in the middle.
        </p>
      </section>

      <Step n={1} title="Create a Plaid account">
        <p>
          Sign up at{" "}
          <a href={PLAID_SIGNUP} target="_blank" rel="noreferrer" className="text-viz-accent underline">
            dashboard.plaid.com
          </a>
          . Then open{" "}
          <a href={PLAID_KEYS} target="_blank" rel="noreferrer" className="text-viz-accent underline">
            Developers → Keys
          </a>{" "}
          and copy your <strong>client ID</strong> and your <strong>Sandbox secret</strong>.
        </p>
      </Step>

      <Step n={2} title="Enter your keys">
        {canSaveSettings() ? (
          <>
            <PlaidKeysForm
              initialClientId={config.plaidClientId}
              initialEnv={config.plaidEnv}
              hasSecret={Boolean(config.plaidSecret)}
              afterSave="/accounts"
            />
            <p className="text-sm text-ink-muted">
              Your secret is stored encrypted by your operating system&apos;s keychain and never leaves this computer
              except to talk to Plaid.
            </p>
          </>
        ) : (
          <p>
            You&apos;re running from source, so keys come from <code>.env.local</code>. Add{" "}
            <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> there and restart.
          </p>
        )}
      </Step>

      <Step n={3} title="Try it with a test bank">
        <p>
          On <strong>Accounts</strong>, click <strong>Connect account</strong>. Plaid opens in your browser: pick any
          bank and log in with <code>user_good</code> / <code>pass_good</code>. In Sandbox every bank is fake data.
        </p>
      </Step>

      <details className="rounded-lg border border-grid p-4">
        <summary className="cursor-pointer font-medium">When you&apos;re ready for your real accounts</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-secondary">
          <li>
            In the Plaid dashboard, request Production access for <strong>Transactions</strong> (banks and cards),{" "}
            <strong>Investments</strong> and <strong>Liabilities</strong> (loans) as needed.
          </li>
          <li>Some large banks also need Plaid&apos;s OAuth registration, approved separately on the dashboard.</li>
          <li>
            In <strong>Settings</strong>, switch to Production and enter your Production secret. Sandbox connections
            are removed; budgets, rules and manual accounts are kept.
          </li>
          <li>Connect each bank once. To add accounts from a bank later, use Reconnect.</li>
        </ol>
      </details>

      <p className="text-sm">
        <Link href="/" className="text-ink-secondary underline hover:text-foreground">
          Skip for now
        </Link>
        <span className="text-ink-muted"> (you can still use manual accounts and budgets)</span>
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-viz-accent text-sm font-semibold text-white">
        {n}
      </span>
      <div className="flex flex-1 flex-col gap-2">
        <h2 className="font-medium">{title}</h2>
        {children}
      </div>
    </section>
  );
}
