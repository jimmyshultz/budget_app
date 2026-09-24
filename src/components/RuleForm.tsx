"use client";

import { useState, useTransition } from "react";
import { createRule, deleteRule } from "@/app/actions";
import { CategoryOptions } from "./CategorySelect";

type Option = { id: number; name: string; groupName: string };

export function RuleForm({ options }: { options: Option[] }) {
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!categoryId) return setMessage("Pick a category.");
        startTransition(async () => {
          const res = await createRule(pattern, Number(categoryId));
          if (res.ok) {
            setPattern("");
            setMessage(`Saved. ${res.data} existing ${res.data === 1 ? "transaction" : "transactions"} updated.`);
          } else setMessage(res.error);
        });
      }}
    >
      <span className="text-ink-secondary">When description contains</span>
      <input
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder="e.g. costco"
        className="w-40 rounded-md border border-grid bg-transparent px-2 py-1.5"
      />
      <span className="text-ink-secondary">use</span>
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded-md border border-grid bg-transparent px-2 py-1.5"
      >
        <option value="">Category…</option>
        <CategoryOptions options={options} />
      </select>
      <button disabled={pending} className="rounded-md bg-viz-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">
        Add rule
      </button>
      {message && <span className="w-full text-ink-muted">{message}</span>}
    </form>
  );
}

export function DeleteRuleButton({ ruleId }: { ruleId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => deleteRule(ruleId))}
      className="text-sm text-ink-muted hover:text-status-critical disabled:opacity-50"
    >
      Delete
    </button>
  );
}
