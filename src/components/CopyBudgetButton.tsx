"use client";

import { useState, useTransition } from "react";
import { copyPreviousBudgets } from "@/app/actions";

export function CopyBudgetButton({ month }: { month: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-ink-muted">{message}</span>}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await copyPreviousBudgets(month);
            setMessage(res.ok ? `Copied ${res.data} ${res.data === 1 ? "category" : "categories"}.` : res.error);
          })
        }
        className="rounded-md border border-grid px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
      >
        Copy last month&apos;s budget
      </button>
    </div>
  );
}
