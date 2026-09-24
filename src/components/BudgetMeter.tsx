import type { BudgetStatus } from "@/lib/budget";
import { formatCents } from "@/lib/format";

const FILL: Record<BudgetStatus, string> = {
  none: "bg-viz-accent",
  good: "bg-viz-accent",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
};

/** Budget progress bar with a marker for how far through the month we are. */
export function BudgetMeter({
  spentCents,
  budgetCents,
  elapsed,
  status,
}: {
  spentCents: number;
  budgetCents: number;
  elapsed: number;
  status: BudgetStatus;
}) {
  const fraction = budgetCents > 0 ? Math.min(Math.max(spentCents, 0) / budgetCents, 1) : spentCents > 0 ? 1 : 0;
  const showPace = elapsed > 0 && elapsed < 1;
  return (
    <div
      className="relative h-2.5 rounded-full bg-viz-track"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={budgetCents / 100}
      aria-valuenow={Math.max(spentCents, 0) / 100}
      aria-valuetext={`${formatCents(spentCents)} of ${formatCents(budgetCents)}`}
    >
      <div className={`h-full rounded-full ${FILL[status]}`} style={{ width: `${fraction * 100}%` }} />
      {showPace && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-pace-marker"
          style={{ left: `calc(${elapsed * 100}% - 1px)` }}
          title={`${Math.round(elapsed * 100)}% of the month has passed`}
        />
      )}
    </div>
  );
}

export function StatusLabel({
  status,
  spentCents,
  budgetCents,
}: {
  status: BudgetStatus;
  spentCents: number;
  budgetCents: number | null;
}) {
  if (status === "none" || budgetCents == null) {
    return <span className="text-ink-muted">No budget</span>;
  }
  const left = budgetCents - spentCents;
  const text =
    status === "critical"
      ? `Over by ${formatCents(-left)}`
      : status === "warning"
        ? `Ahead of pace · ${formatCents(left)} left`
        : `On track · ${formatCents(left)} left`;
  return <StatusText status={status}>{text}</StatusText>;
}

const ICONS = {
  good: ["✓", "bg-status-good text-white"],
  warning: ["▲", "bg-status-warning text-black"],
  critical: ["!", "bg-status-critical text-white"],
} as const;

/** Status is never color alone: an icon plus the text label. */
function StatusText({ status, children }: { status: keyof typeof ICONS; children: React.ReactNode }) {
  const [icon, iconClass] = ICONS[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-secondary">
      <span
        aria-hidden
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${iconClass}`}
      >
        {icon}
      </span>
      {children}
    </span>
  );
}

export function IncomeLabel({ receivedCents, expectedCents }: { receivedCents: number; expectedCents: number | null }) {
  if (expectedCents == null) return <span className="text-ink-muted">Not planned</span>;
  const remaining = expectedCents - receivedCents;
  if (remaining <= 0) {
    return (
      <StatusText status="good">
        {remaining < 0 ? `${formatCents(-remaining)} more than expected` : "All received"}
      </StatusText>
    );
  }
  return <span className="text-ink-secondary">{formatCents(remaining)} still expected</span>;
}

/** Expected income minus planned spending: what's left to assign (or how far over). */
export function PlanSummary({
  expectedIncome,
  plannedSpending,
  hasPlan,
}: {
  expectedIncome: number;
  plannedSpending: number;
  hasPlan: boolean;
}) {
  if (!hasPlan) {
    return (
      <p className="text-sm text-ink-secondary">
        No plan for this month yet. Enter your expected income and a budget for each category below, or copy last
        month&apos;s.
      </p>
    );
  }
  const left = expectedIncome - plannedSpending;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-grid p-4">
      <h2 className="font-medium">Plan</h2>
      <dl className="flex max-w-sm flex-col gap-1 text-sm tabular-nums">
        <div className="flex justify-between gap-6">
          <dt className="text-ink-secondary">Expected income</dt>
          <dd>{formatCents(expectedIncome)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-ink-secondary">Planned spending</dt>
          <dd>−{formatCents(plannedSpending)}</dd>
        </div>
        <div className="flex justify-between gap-6 border-t border-grid pt-1 font-medium">
          <dt>{left >= 0 ? "Left to plan" : "Overplanned by"}</dt>
          <dd>{formatCents(Math.abs(left))}</dd>
        </div>
      </dl>
      <p className="text-sm">
        {expectedIncome === 0 ? (
          <span className="text-ink-secondary">Add your expected income below to see the gap.</span>
        ) : left > 0 ? (
          <StatusText status="good">
            You&apos;re planning to spend {formatCents(left)} less than you expect to earn.
          </StatusText>
        ) : left === 0 ? (
          <StatusText status="good">Every dollar of expected income is planned.</StatusText>
        ) : (
          <StatusText status="critical">
            Planned spending is {formatCents(-left)} more than expected income.
          </StatusText>
        )}
      </p>
    </section>
  );
}
