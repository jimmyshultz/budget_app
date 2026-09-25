"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettingsAction, testPlaidKeys } from "@/app/actions";

const input = "w-full rounded-md border border-grid bg-transparent px-2.5 py-1.5 text-sm focus:border-viz-accent focus:outline-none";

type Status = { tone: "good" | "bad" | "neutral"; text: string } | null;

/**
 * Plaid client ID, secret and environment, with Test and Save. The saved secret is never sent
 * to the page: leave the field blank to keep it.
 */
export function PlaidKeysForm({
  initialClientId,
  initialEnv,
  hasSecret,
  afterSave,
}: {
  initialClientId: string;
  initialEnv: "sandbox" | "production";
  hasSecret: boolean;
  /** Where to go after saving (first-run setup); stays on the page if omitted. */
  afterSave?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [secret, setSecret] = useState("");
  const [env, setEnv] = useState(initialEnv);
  const [status, setStatus] = useState<Status>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const values = { clientId, secret, env };

  const test = () =>
    startTransition(async () => {
      setStatus({ tone: "neutral", text: "Checking with Plaid…" });
      const res = await testPlaidKeys(values);
      setStatus(res.ok ? { tone: "good", text: "Plaid accepted these keys." } : { tone: "bad", text: res.error });
    });

  const save = () =>
    startTransition(async () => {
      setStatus({ tone: "neutral", text: "Checking with Plaid and saving…" });
      const res = await saveSettingsAction({ ...values, confirmDisconnect: confirmed });
      if (res.ok) {
        setSecret("");
        setConfirmCount(null);
        setConfirmed(false);
        setStatus({ tone: "good", text: "Saved." });
        if (afterSave) router.push(afterSave);
        else router.refresh();
        return;
      }
      if ("confirmDisconnect" in res) setConfirmCount(res.confirmDisconnect);
      setStatus({ tone: "bad", text: res.error });
    });

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Client ID</span>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={`${input} font-mono`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Secret</span>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={hasSecret ? "Saved. Leave blank to keep it" : ""}
          autoComplete="off"
          spellCheck={false}
          className={`${input} font-mono`}
        />
        <span className="text-xs text-ink-muted">Use the secret that matches the environment below.</span>
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Environment</legend>
        {(
          [
            ["sandbox", "Sandbox", "fake test banks, free"],
            ["production", "Production", "your real accounts; needs Plaid's approval"],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="env"
              checked={env === value}
              onChange={() => {
                setEnv(value);
                setConfirmCount(null);
                setConfirmed(false);
              }}
            />
            {label}
            <span className="text-ink-muted">({hint})</span>
          </label>
        ))}
      </fieldset>

      {confirmCount != null && (
        <label className="flex items-start gap-2 rounded-md border border-status-critical/50 p-3 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span>
            Disconnect my {confirmCount} {confirmCount === 1 ? "connection" : "connections"} and delete their accounts
            and transactions. Budgets, rules and manual accounts are kept. I&apos;ll reconnect my banks afterward.
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || (confirmCount != null && !confirmed)}
          className="rounded-md bg-viz-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={test}
          disabled={pending}
          className="rounded-md border border-grid px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
        >
          Test keys
        </button>
      </div>
      {status && (
        <p
          role="status"
          className={`text-sm ${status.tone === "bad" ? "text-status-critical" : status.tone === "good" ? "text-foreground" : "text-ink-secondary"}`}
        >
          {status.tone === "good" && "✓ "}
          {status.text}
        </p>
      )}
    </form>
  );
}
