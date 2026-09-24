"use client";

import { useState, useTransition } from "react";
import { createRule, setTransactionCategory } from "@/app/actions";

type Option = { id: number; name: string; groupName: string };

export function CategoryOptions({ options }: { options: Option[] }) {
  const groups = Map.groupBy(options, (o) => o.groupName);
  return [...groups].map(([group, opts]) => (
    <optgroup key={group} label={group}>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </optgroup>
  ));
}

/**
 * Category dropdown for one transaction. After a change it offers to save a rule
 * so future (and existing) transactions from the same merchant get the same category.
 */
export function CategorySelect({
  transactionId,
  categoryId,
  merchant,
  options,
}: {
  transactionId: string;
  categoryId: number | null;
  merchant: string;
  options: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [offer, setOffer] = useState<{ categoryId: number; pattern: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const categoryName = (id: number) => options.find((o) => o.id === id)?.name ?? "";

  const saveRule = () => {
    if (!offer) return;
    startTransition(async () => {
      const res = await createRule(offer.pattern, offer.categoryId);
      setOffer(null);
      setMessage(res.ok ? `Rule saved · ${res.data} updated` : res.error);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <select
        value={categoryId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value ? Number(e.target.value) : null;
          setMessage(null);
          setOffer(value != null ? { categoryId: value, pattern: merchant } : null);
          startTransition(() => setTransactionCategory(transactionId, value));
        }}
        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-grid disabled:opacity-50"
      >
        <option value="">—</option>
        <CategoryOptions options={options} />
      </select>
      {offer && (
        <div className="flex flex-col gap-1 rounded-md border border-grid p-2 text-xs">
          <span className="text-ink-secondary">Always use {categoryName(offer.categoryId)} when description contains:</span>
          <input
            value={offer.pattern}
            onChange={(e) => setOffer({ ...offer, pattern: e.target.value })}
            className="rounded border border-grid bg-transparent px-1.5 py-0.5"
          />
          <div className="flex gap-2">
            <button onClick={saveRule} disabled={pending} className="rounded bg-viz-accent px-2 py-0.5 font-medium text-white disabled:opacity-50">
              Save rule
            </button>
            <button onClick={() => setOffer(null)} className="px-1 text-ink-muted hover:text-foreground">
              Just this one
            </button>
          </div>
        </div>
      )}
      {message && <span className="text-xs text-ink-muted">{message}</span>}
    </div>
  );
}
