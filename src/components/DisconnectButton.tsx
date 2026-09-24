"use client";

import { useState, useTransition } from "react";
import { disconnectItem } from "@/app/actions";

export function DisconnectButton({ itemId, institution }: { itemId: string; institution: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-status-critical">{error}</span>}
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm(`Disconnect ${institution}? This deletes its accounts and transactions from this app.`)) return;
          startTransition(async () => {
            const res = await disconnectItem(itemId);
            setError(res.ok ? null : res.error);
          });
        }}
        className="text-sm text-ink-muted hover:text-status-critical disabled:opacity-50"
      >
        {pending ? "Disconnecting…" : "Disconnect"}
      </button>
    </span>
  );
}
