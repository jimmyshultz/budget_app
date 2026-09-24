"use client";

import { useEffect, useState, useTransition } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createReconnectLinkToken, finishReconnect } from "@/app/actions";

/** Opens Plaid Link as soon as it's mounted. Mounted only after a click, so each row doesn't load Link. */
function PlaidOpener({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: () => void;
  onExit: (message: string | null) => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: () => onSuccess(),
    onExit: (err) => onExit(err ? err.display_message || err.error_message : null),
  });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}

export function ReconnectButton({
  itemId,
  institution,
  needsLogin,
}: {
  itemId: string;
  institution: string;
  needsLogin: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await createReconnectLinkToken(itemId);
      if (res.ok) setToken(res.data);
      else setMessage(res.error);
    });
  };

  const done = () => {
    setToken(null);
    setMessage(`Reconnected ${institution}. Syncing…`);
    startTransition(async () => {
      const res = await finishReconnect(itemId);
      if (!res.ok) setMessage(res.error);
      else if (res.data.error) setMessage(`Reconnected, but sync failed: ${res.data.error}`);
      else setMessage(`Reconnected · ${res.data.added} new transactions`);
    });
  };

  return (
    <span className="flex items-center gap-2">
      {message && <span className="text-xs text-ink-muted">{message}</span>}
      {token && (
        <PlaidOpener
          token={token}
          onSuccess={done}
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
        {pending ? "Working…" : "Reconnect"}
      </button>
    </span>
  );
}
