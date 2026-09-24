import Link from "next/link";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BudgetInput } from "@/components/BudgetInput";
import { BudgetMeter, IncomeLabel, PlanSummary, StatusLabel } from "@/components/BudgetMeter";
import { MonthNav } from "@/components/MonthNav";
import { CopyBudgetButton } from "@/components/CopyBudgetButton";
import { budgetStatus } from "@/lib/budget";
import { UNCATEGORIZED } from "@/lib/categorize";
import { formatCents, formatSigned } from "@/lib/format";
import { currentMonth, monthElapsed, parseMonth } from "@/lib/months";
import { incomeByCategory, spendingByCategory } from "@/lib/queries";

type Row = {
  categoryId: number;
  name: string;
  groupName: string;
  /** Spent for expense rows; received for income rows. */
  actualCents: number;
  budgetCents: number | null;
};

export default async function BudgetPage({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const month = parseMonth(params.month) ?? currentMonth();
  const elapsed = monthElapsed(month);

  const allCategories = db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)).all();
  const categories = allCategories.filter((c) => !c.isIncome && !c.isTransfer);
  const incomeCategories = allCategories.filter((c) => c.isIncome);
  const uncategorizedId = categories.find((c) => c.name === UNCATEGORIZED)?.id;

  const spentById = new Map<number, number>();
  for (const s of spendingByCategory(month)) {
    const id = s.categoryId ?? uncategorizedId;
    if (id != null) spentById.set(id, (spentById.get(id) ?? 0) + s.spentCents);
  }
  const budgetById = new Map(
    db
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.month, month))
      .all()
      .map((b) => [b.categoryId, b.amountCents]),
  );

  const receivedById = new Map(incomeByCategory(month).map((r) => [r.categoryId, r.receivedCents]));

  const toRow = (c: (typeof allCategories)[number], actual: Map<number, number>): Row => ({
    categoryId: c.id,
    name: c.name,
    groupName: c.groupName,
    actualCents: actual.get(c.id) ?? 0,
    budgetCents: budgetById.get(c.id) ?? null,
  });
  const rows = categories.map((c) => toRow(c, spentById));
  const incomeRows = incomeCategories.map((c) => toRow(c, receivedById));
  const active = rows.filter((r) => r.budgetCents != null || r.actualCents !== 0);
  const inactive = rows.filter((r) => r.budgetCents == null && r.actualCents === 0);

  const totalBudget = active.reduce((s, r) => s + (r.budgetCents ?? 0), 0);
  const totalSpent = active.reduce((s, r) => s + r.actualCents, 0);
  const budgetedSpent = active.reduce((s, r) => s + (r.budgetCents != null ? r.actualCents : 0), 0);
  const expectedIncome = incomeRows.reduce((s, r) => s + (r.budgetCents ?? 0), 0);
  const receivedIncome = incomeRows.reduce((s, r) => s + r.actualCents, 0);
  const hasSpendingBudget = active.some((r) => r.budgetCents != null);
  const hasPlan = hasSpendingBudget || incomeRows.some((r) => r.budgetCents != null);
  const overallStatus = hasSpendingBudget ? budgetStatus(budgetedSpent, totalBudget, elapsed) : "none";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/" month={month} />
        <CopyBudgetButton month={month} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <div>
            <p className="text-sm text-ink-secondary">Spent</p>
            <p className="text-5xl font-semibold">{formatCents(totalSpent)}</p>
          </div>
          <dl className="flex gap-8 text-sm">
            <Stat label="Income received" value={formatCents(receivedIncome)} />
            <Stat label="Net so far" value={formatSigned(receivedIncome - totalSpent)} />
            <Stat
              label={elapsed < 1 ? "Month elapsed" : "Month"}
              value={elapsed < 1 ? `${Math.round(elapsed * 100)}%` : "Complete"}
            />
          </dl>
        </div>
        {hasSpendingBudget && (
          <div className="flex flex-col gap-1.5">
            <BudgetMeter spentCents={budgetedSpent} budgetCents={totalBudget} elapsed={elapsed} status={overallStatus} />
            <p className="text-sm">
              <StatusLabel status={overallStatus} spentCents={budgetedSpent} budgetCents={totalBudget} />
              <span className="text-ink-muted"> across budgeted categories</span>
            </p>
          </div>
        )}
      </section>

      <PlanSummary expectedIncome={expectedIncome} plannedSpending={totalBudget} hasPlan={hasPlan} />

      <section className="flex flex-col gap-1">
        <h2 className="border-b border-grid pb-1 font-medium">Income</h2>
        <BudgetTable rows={incomeRows} month={month} elapsed={elapsed} kind="income" />
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="border-b border-grid pb-1 font-medium">Spending</h2>
        <BudgetTable rows={active} month={month} elapsed={elapsed} kind="expense" />
      </section>

      {inactive.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-ink-secondary hover:text-foreground">
            {inactive.length} categories with no spending or budget
          </summary>
          <div className="mt-3">
            <BudgetTable rows={inactive} month={month} elapsed={elapsed} kind="expense" />
          </div>
        </details>
      )}
    </div>
  );
}

function BudgetTable({
  rows,
  month,
  elapsed,
  kind,
}: {
  rows: Row[];
  month: string;
  elapsed: number;
  kind: "income" | "expense";
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="divide-y divide-grid">
      {rows.map((r) => {
        // Income has no "over budget" or pace: paychecks land on fixed dates, not evenly.
        const status = kind === "income" ? "none" : budgetStatus(r.actualCents, r.budgetCents, elapsed);
        return (
          <li key={r.categoryId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[11rem_1fr_auto]">
            <div>
              <Link
                href={`/transactions?month=${month}&category=${r.categoryId}`}
                className="font-medium hover:underline"
              >
                {r.name}
              </Link>
              <p className="text-xs text-ink-muted">{r.groupName}</p>
            </div>
            <div className="order-last col-span-2 flex flex-col gap-1.5 sm:order-none sm:col-span-1">
              {r.budgetCents != null ? (
                <BudgetMeter
                  spentCents={r.actualCents}
                  budgetCents={r.budgetCents}
                  elapsed={kind === "income" ? 0 : elapsed}
                  status={status}
                />
              ) : null}
              <p className="text-xs">
                <span className="tabular-nums text-foreground">{formatCents(r.actualCents)}</span>
                {kind === "income" ? (
                  <>
                    <span className="text-ink-muted"> received · </span>
                    <IncomeLabel receivedCents={r.actualCents} expectedCents={r.budgetCents} />
                  </>
                ) : (
                  <>
                    <span className="text-ink-muted"> spent · </span>
                    <StatusLabel status={status} spentCents={r.actualCents} budgetCents={r.budgetCents} />
                  </>
                )}
              </p>
            </div>
            {/* Keyed on month + amount so the field resets when either changes on the server. */}
            <BudgetInput
              key={`${month}:${r.budgetCents}`}
              month={month}
              categoryId={r.categoryId}
              categoryName={r.name}
              amountCents={r.budgetCents}
            />
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-lg font-medium">{value}</dd>
    </div>
  );
}
