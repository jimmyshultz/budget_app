"use client";

import { useEffect, useRef, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { checkHostedSession, type HostedLink } from "@/app/actions";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * In-page Plaid Link (browser mode). Mounted only after a click, so Plaid's script isn't
 * loaded until needed, and never in the desktop app.
 */
export function PlaidOpener({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (message: string | null) => void;
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: (err) => onExit(err ? err.display_message || err.error_message : null),
  });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}

const POLL_MS = 3000;
const MAX_POLLS = (30 * 60 * 1000) / POLL_MS; // give up after 30 minutes

export type HostedOutcome = { state: "success"; linkToken: string } | { state: "error"; message: string } | { state: "cancelled" };

/**
 * Hosted Link (desktop mode): opens Plaid in the system browser and polls until the session
 * finishes. The desktop shell routes the window.open to the default browser.
 */
export function useHostedLink() {
  const [waiting, setWaiting] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => () => void (cancelled.current = true), []);

  const run = async (create: () => Promise<Result<HostedLink>>): Promise<HostedOutcome> => {
    const created = await create();
    if (!created.ok) return { state: "error", message: created.error };
    window.open(created.data.url, "_blank");
    cancelled.current = false;
    setWaiting(true);
    try {
      for (let i = 0; i < MAX_POLLS && !cancelled.current; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled.current) break;
        const status = await checkHostedSession(created.data.linkToken);
        if (!status.ok) return { state: "error", message: status.error };
        if (status.data.state === "success") return { state: "success", linkToken: created.data.linkToken };
        if (status.data.state === "exited") return { state: "error", message: status.data.message };
      }
      return cancelled.current ? { state: "cancelled" } : { state: "error", message: "Timed out waiting for the browser." };
    } finally {
      setWaiting(false);
    }
  };

  const cancel = () => void (cancelled.current = true);
  return { run, waiting, cancel };
}

export function WaitingForBrowser({ onCancel }: { onCancel: () => void }) {
  return (
    <span className="flex items-center gap-2 text-xs text-ink-secondary">
      Finish in your browser…
      <button onClick={onCancel} className="text-ink-muted underline hover:text-foreground">
        Cancel
      </button>
    </span>
  );
}
