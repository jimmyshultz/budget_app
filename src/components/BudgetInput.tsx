"use client";

import { useState, useTransition } from "react";
import { setBudget } from "@/app/actions";

export function BudgetInput({
  month,
  categoryId,
  categoryName,
  amountCents,
}: {
  month: string;
  categoryId: number;
  categoryName: string;
  amountCents: number | null;
}) {
  const initial = amountCents == null ? "" : String(amountCents / 100);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (value.trim() === initial) return;
    startTransition(async () => {
      const res = await setBudget(month, categoryId, value);
      setError(res.ok ? null : res.error);
    });
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-ink-muted">$</span>
      <input
        inputMode="decimal"
        aria-label={`${categoryName} budget`}
        placeholder="—"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`w-20 rounded border bg-transparent px-1.5 py-0.5 text-right tabular-nums disabled:opacity-50 ${
          error ? "border-status-critical" : "border-grid hover:border-baseline focus:border-viz-accent"
        } focus:outline-none`}
        title={error ?? undefined}
      />
    </div>
  );
}
