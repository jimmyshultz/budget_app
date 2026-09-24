"use client";

import { useState, useTransition } from "react";
import { createHostedLink, createReconnectLinkToken, finishReconnect } from "@/app/actions";
import { PlaidOpener, useHostedLink, WaitingForBrowser } from "./plaidFlows";

/** `hosted`: run Plaid in the system browser (desktop app) instead of in the page. */
export function ReconnectButton({
  itemId,
  institution,
  needsLogin,
  hosted,
}: {
  itemId: string;
  institution: string;
  needsLogin: boolean;
  hosted: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hostedLink = useHostedLink();

  const finish = async () => {
    setMessage(`Reconnected ${institution}. Syncing…`);
    const res = await finishReconnect(itemId);
    if (!res.ok) setMessage(res.error);
    else if (res.data.error) setMessage(`Reconnected, but sync failed: ${res.data.error}`);
    else setMessage(`Reconnected · ${res.data.added} new transactions`);
  };

  const start = () => {
    setMessage(null);
    startTransition(async () => {
      if (hosted) {
        const outcome = await hostedLink.run(() => createHostedLink({ itemId }));
        if (outcome.state === "error") setMessage(outcome.message);
        else if (outcome.state === "success") await finish();
        return;
      }
      const res = await createReconnectLinkToken(itemId);
      if (res.ok) setToken(res.data);
      else setMessage(res.error);
    });
  };

  return (
    <span className="flex items-center gap-2">
      {message && <span className="text-xs text-ink-muted">{message}</span>}
      {hostedLink.waiting && <WaitingForBrowser onCancel={hostedLink.cancel} />}
      {token && (
        <PlaidOpener
          token={token}
          onSuccess={() => {
            setToken(null);
            startTransition(finish);
          }}
          onExit={(msg) => {
            setToken(null);
            if (msg) setMessage(msg);
          }}
        />
      )}
      <button
        onClick={start}
        disabled={pending || token != null}
        title={`Log into ${institution} again, or add accounts from it`}
        className={
          needsLogin
            ? "rounded-md bg-viz-accent px-2.5 py-1 text-sm font-medium text-white disabled:opacity-50"
            : "text-sm text-ink-muted hover:text-foreground disabled:opacity-50"
        }
      >
        {pending && !hostedLink.waiting ? "Working…" : "Reconnect"}
      </button>
    </span>
  );
}
