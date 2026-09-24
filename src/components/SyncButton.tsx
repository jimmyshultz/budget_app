"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { syncIfStale, syncNow } from "@/app/actions";
import type { SyncResult } from "@/lib/sync";

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function summarize(results: SyncResult[]): string | null {
  const errors = results.filter((r) => r.error);
  if (errors.length) return errors.map((e) => `${e.institution ?? e.itemId}: ${e.error}`).join("; ");
  return null;
}

/** Manual sync button; also syncs on first load if the data is more than 6 hours old. */
export function SyncButton({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    startTransition(async () => {
      const results = await syncIfStale();
      if (results) setMessage(summarize(results));
    });
  }, []);

  const sync = () =>
    startTransition(async () => {
      const results = await syncNow();
      const added = results.reduce((n, r) => n + r.added, 0);
      setMessage(summarize(results) ?? `${added} new transactions`);
    });

  return (
    <div className="flex items-center gap-3 text-sm">
      {/* Relative time can differ by a minute between server and browser render. */}
      <span className="text-ink-muted" suppressHydrationWarning>
        {pending ? "Syncing…" : message ?? (lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : null)}
      </span>
      <button
        onClick={sync}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        Sync now
      </button>
    </div>
  );
}
