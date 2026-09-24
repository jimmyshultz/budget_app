"use client";

import { useState, useTransition } from "react";
import {
  completeHostedConnect,
  createHostedLink,
  createLinkToken,
  exchangePublicToken,
  type ConnectKind,
} from "@/app/actions";
import type { SyncResult } from "@/lib/sync";
import { PlaidOpener, useHostedLink, WaitingForBrowser } from "./plaidFlows";

const LABELS: Record<ConnectKind, string> = {
  banking: "Bank or credit card",
  investments: "Investments",
  loan: "Mortgage / loan",
};

function describe(result: SyncResult, kind: ConnectKind): string {
  if (result.error) return `Connected, but sync failed: ${result.error}`;
  return (
    `Connected ${result.institution ?? "account"}: ${result.added} transactions imported.` +
    (result.added === 0 && kind === "banking" ? " Plaid may still be loading history; press Sync in a minute." : "")
  );
}

/** `hosted`: run Plaid in the system browser (desktop app) instead of in the page. */
export function ConnectButton({ hosted }: { hosted: boolean }) {
  const [kind, setKind] = useState<ConnectKind>("banking");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hostedLink = useHostedLink();

  const startHosted = () =>
    startTransition(async () => {
      setMessage(null);
      const outcome = await hostedLink.run(() => createHostedLink({ kind }));
      if (outcome.state === "error") return setMessage(`Error: ${outcome.message}`);
      if (outcome.state === "cancelled") return;
      setMessage("Connected. Pulling accounts and transactions…");
      const res = await completeHostedConnect(outcome.linkToken, kind);
      setMessage(res.ok ? res.data.map((r) => describe(r, kind)).join(" ") : `Error: ${res.error}`);
    });

  const startInPage = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await createLinkToken(kind);
      if (res.ok) setLinkToken(res.data);
      else setMessage(`Error: ${res.error}`);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ConnectKind)}
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        >
          {Object.entries(LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={hosted ? startHosted : startInPage}
          disabled={pending || linkToken != null}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending && !hostedLink.waiting ? "Working…" : "Connect account"}
        </button>
      </div>
      {hostedLink.waiting && <WaitingForBrowser onCancel={hostedLink.cancel} />}
      {linkToken && (
        <PlaidOpener
          token={linkToken}
          onSuccess={(publicToken, metadata) => {
            setLinkToken(null);
            if (!publicToken) return setMessage("Plaid Link finished without returning a token. Try connecting again.");
            setMessage("Connected. Pulling accounts and transactions…");
            startTransition(async () => {
              const res = await exchangePublicToken(publicToken, kind, {
                id: metadata.institution?.institution_id ?? null,
                name: metadata.institution?.name ?? null,
              });
              setMessage(res.ok ? describe(res.data, kind) : `Error: ${res.error}`);
            });
          }}
          onExit={(msg) => {
            setLinkToken(null);
            if (msg) setMessage(`Link closed: ${msg}`);
          }}
        />
      )}
      {message && <p className="text-sm text-neutral-500">{message}</p>}
    </div>
  );
}
