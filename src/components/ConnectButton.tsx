"use client";

import { useEffect, useState, useTransition } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createLinkToken, exchangePublicToken, type ConnectKind } from "@/app/actions";

const LABELS: Record<ConnectKind, string> = {
  banking: "Bank or credit card",
  investments: "Investments",
  loan: "Mortgage / loan",
};

export function ConnectButton() {
  const [kind, setKind] = useState<ConnectKind>("banking");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      setLinkToken(null);
      if (!publicToken) {
        setMessage("Plaid Link finished without returning a token. Try connecting again.");
        return;
      }
      setMessage("Connected. Pulling accounts and transactions…");
      startTransition(async () => {
        const res = await exchangePublicToken(publicToken, kind, {
          id: metadata.institution?.institution_id ?? null,
          name: metadata.institution?.name ?? null,
        });
        if (!res.ok) setMessage(`Error: ${res.error}`);
        else if (res.data.error) setMessage(`Connected, but sync failed: ${res.data.error}`);
        else
          setMessage(
            `Connected ${res.data.institution ?? "account"}: ${res.data.added} transactions imported.` +
              (res.data.added === 0 && kind === "banking"
                ? " Plaid may still be loading history; press Sync in a minute."
                : ""),
          );
      });
    },
    onExit: (err) => {
      setLinkToken(null);
      if (err) setMessage(`Link closed: ${err.error_message}`);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const start = () => {
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
          onClick={start}
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Working…" : "Connect account"}
        </button>
      </div>
      {message && <p className="text-sm text-neutral-500">{message}</p>}
    </div>
  );
}
