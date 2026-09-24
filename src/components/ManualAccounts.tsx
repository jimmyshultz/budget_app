"use client";

import { useState, useTransition } from "react";
import { createManualAccount, deleteManualAccount, updateManualBalance } from "@/app/actions";
import { MANUAL_KINDS } from "@/lib/accounts";
import { formatCents } from "@/lib/format";

const input = "rounded-md border border-grid bg-transparent px-2 py-1.5";

export function AddManualAccount() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(MANUAL_KINDS[0].type);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const kind = MANUAL_KINDS.find((k) => k.type === type)!;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="self-start text-sm text-ink-secondary hover:text-foreground">
        + Add a manual account (home value, mortgage, anything Plaid can&apos;t connect)
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border border-grid p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createManualAccount(name, type, balance);
          if (!res.ok) return setError(res.error);
          setName("");
          setBalance("");
          setError(null);
          setOpen(false);
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={input}>
          {MANUAL_KINDS.map((k) => (
            <option key={k.type} value={k.type}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind.placeholder} className={`${input} w-44`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{kind.balanceLabel}</span>
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          inputMode="decimal"
          placeholder="$0"
          className={`${input} w-36 text-right tabular-nums`}
        />
      </label>
      <button disabled={pending} className="rounded-md bg-viz-accent px-3 py-1.5 font-medium text-white disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-ink-muted hover:text-foreground">
        Cancel
      </button>
      {error && <p className="w-full text-status-critical">{error}</p>}
    </form>
  );
}

/** Balance with inline edit + delete, for accounts you maintain by hand. */
export function ManualBalance({
  accountId,
  name,
  balanceCents,
  updatedAt,
}: {
  accountId: string;
  name: string;
  balanceCents: number | null;
  updatedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(balanceCents == null ? "" : String(balanceCents / 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="text-right">
        <p className="tabular-nums">{formatCents(balanceCents)}</p>
        <p className="text-xs text-ink-muted">
          {updatedAt && `updated ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · `}
          <button onClick={() => setEditing(true)} className="underline-offset-2 hover:text-foreground hover:underline">
            Update
          </button>
        </p>
      </div>
    );
  }

  const save = () =>
    startTransition(async () => {
      const res = await updateManualBalance(accountId, value);
      if (!res.ok) return setError(res.error);
      setError(null);
      setEditing(false);
    });

  return (
    <div className="flex flex-col items-end gap-1 text-sm">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          inputMode="decimal"
          aria-label={`${name} balance`}
          className={`${input} w-36 py-1 text-right tabular-nums`}
        />
        <button onClick={save} disabled={pending} className="rounded-md bg-viz-accent px-2.5 py-1 font-medium text-white disabled:opacity-50">
          Save
        </button>
      </div>
      <div className="flex gap-3 text-xs">
        {error && <span className="text-status-critical">{error}</span>}
        <button onClick={() => setEditing(false)} className="text-ink-muted hover:text-foreground">
          Cancel
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete ${name}?`)) startTransition(() => deleteManualAccount(accountId));
          }}
          className="text-ink-muted hover:text-status-critical"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
