import Link from "next/link";
import { formatCents } from "@/lib/format";
import { monthLabel } from "@/lib/months";

// Charts are plain HTML/CSS: one hue (magnitude, not identity), bars capped at
// 24px with a 4px rounded data-end, hover/focus tooltips, and a table fallback.

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-grid bg-background px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

export type CategoryBar = { key: string; label: string; valueCents: number; count: number; href?: string };

/** Horizontal bars, sorted largest first, value at the tip. */
export function CategoryBars({ bars }: { bars: CategoryBar[] }) {
  const total = bars.reduce((s, b) => s + Math.max(b.valueCents, 0), 0);
  const max = Math.max(...bars.map((b) => b.valueCents), 1);
  return (
    <ul className="flex flex-col gap-1">
      {bars.map((b) => {
        const pct = total > 0 ? Math.round((Math.max(b.valueCents, 0) / total) * 100) : 0;
        const inner = (
          <>
            <span className="w-32 shrink-0 truncate text-sm text-ink-secondary sm:w-40">{b.label}</span>
            <span className="relative flex flex-1 items-center gap-2">
              <span
                className="h-5 rounded-r bg-viz-accent transition-colors group-hover:bg-viz-accent-hover group-focus-visible:bg-viz-accent-hover"
                style={{ width: `${(Math.max(b.valueCents, 0) / max) * 85}%`, minWidth: b.valueCents > 0 ? 2 : 0 }}
              />
              <span className="text-sm tabular-nums">{formatCents(b.valueCents)}</span>
              <Tooltip>
                <strong className="text-sm">{formatCents(b.valueCents)}</strong>{" "}
                <span className="text-ink-secondary">
                  {b.label} · {pct}% of spending · {b.count} {b.count === 1 ? "transaction" : "transactions"}
                </span>
              </Tooltip>
            </span>
          </>
        );
        return (
          <li key={b.key}>
            {b.href ? (
              <Link href={b.href} className="group flex items-center gap-3 rounded py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-viz-accent">
                {inner}
              </Link>
            ) : (
              <div tabIndex={0} className="group flex items-center gap-3 py-0.5 outline-none">
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 100_00;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value)!;
  return step * magnitude;
}

export type MonthColumn = { month: string; valueCents: number; partial?: boolean; href?: string };

/** Vertical columns over time, with 3 gridlines. The last column carries a direct label. */
export function MonthColumns({ columns, height = 180 }: { columns: MonthColumn[]; height?: number }) {
  const top = niceMax(Math.max(...columns.map((c) => c.valueCents), 0));
  const ticks = [top, top / 2, 0];
  const last = columns[columns.length - 1];
  return (
    <div className="flex gap-2">
      <div className="relative w-14 shrink-0 text-right text-xs tabular-nums text-ink-muted" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / top) * 100}%` }}>
            {formatCents(t).replace(/\.00$/, "")}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 h-px ${t === 0 ? "bg-baseline" : "bg-grid"}`}
              style={{ top: `${(1 - t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex">
            {columns.map((c) => {
              const h = (Math.max(c.valueCents, 0) / top) * 100;
              const body = (
                <>
                  <Tooltip>
                    <strong className="text-sm">{formatCents(c.valueCents)}</strong>{" "}
                    <span className="text-ink-secondary">
                      {monthLabel(c.month)}
                      {c.partial ? " so far" : ""}
                    </span>
                  </Tooltip>
                  {c === last && (
                    <span className="mb-1 text-xs font-medium tabular-nums">{formatCents(c.valueCents).replace(/\.\d\d$/, "")}</span>
                  )}
                  <span
                    className="w-6 rounded-t bg-viz-accent transition-colors group-hover:bg-viz-accent-hover group-focus-visible:bg-viz-accent-hover"
                    style={{ height: `${h}%` }}
                  />
                </>
              );
              const cls = "group relative flex flex-1 flex-col items-center justify-end outline-none focus-visible:ring-2 focus-visible:ring-viz-accent";
              return c.href ? (
                <Link key={c.month} href={c.href} className={cls} aria-label={`${monthLabel(c.month)}: ${formatCents(c.valueCents)}`}>
                  {body}
                </Link>
              ) : (
                <div key={c.month} tabIndex={0} className={cls}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex">
          {columns.map((c) => (
            <span key={c.month} className="flex-1 text-center text-xs text-ink-muted">
              {monthLabel(c.month, "short")}
              {c.partial ? "*" : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
