import { connection } from "next/server";
import { MonthNav } from "@/components/MonthNav";
import { CategoryBars, MonthColumns } from "@/components/charts";
import { formatCents } from "@/lib/format";
import { addMonths, currentMonth, monthLabel, parseMonth } from "@/lib/months";
import { monthlyTotals, spendingByCategory } from "@/lib/queries";

const TREND_MONTHS = 6;

export default async function SpendingPage({ searchParams }: PageProps<"/spending">) {
  await connection();
  const params = await searchParams;
  const month = parseMonth(params.month) ?? currentMonth();
  const today = currentMonth();

  // Categories whose charges and refunds cancel out add nothing to the chart.
  const byCategory = spendingByCategory(month).filter((c) => c.spentCents !== 0);
  const total = byCategory.reduce((s, c) => s + c.spentCents, 0);

  const months = Array.from({ length: TREND_MONTHS }, (_, i) => addMonths(month, i - TREND_MONTHS + 1));
  const trend = monthlyTotals(months);
  const priorMonths = trend.slice(0, -1).filter((t) => t.month < today && t.spentCents > 0);
  const average = priorMonths.length
    ? Math.round(priorMonths.reduce((s, t) => s + t.spentCents, 0) / priorMonths.length)
    : null;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav basePath="/spending" month={month} />
      </section>

      <section>
        <p className="text-sm text-ink-secondary">Spent{month === today ? " so far" : ""}</p>
        <p className="text-5xl font-semibold">{formatCents(total)}</p>
        {average != null && (
          <p className="mt-1 text-sm text-ink-secondary">
            {formatCents(average)} average over the previous {priorMonths.length} months
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">By category</h2>
        {byCategory.length === 0 ? (
          <p className="text-sm text-ink-muted">No spending this month.</p>
        ) : (
          <CategoryBars
            bars={byCategory.map((c) => ({
              key: String(c.categoryId),
              label: c.name,
              valueCents: c.spentCents,
              count: c.count,
              href: `/transactions?month=${month}${c.categoryId != null ? `&category=${c.categoryId}` : ""}`,
            }))}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Last {TREND_MONTHS} months</h2>
        <MonthColumns
          columns={trend.map((t) => ({
            month: t.month,
            valueCents: t.spentCents,
            partial: t.month === today,
            href: `/spending?month=${t.month}`,
          }))}
        />
        {trend.some((t) => t.month === today) && <p className="text-xs text-ink-muted">* month in progress</p>}
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-secondary hover:text-foreground">Show as table</summary>
          <table className="mt-2 w-full max-w-md">
            <thead className="text-left text-xs text-ink-muted">
              <tr>
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">Spent</th>
                <th className="py-1 text-right font-medium">Income</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grid tabular-nums">
              {trend.map((t) => (
                <tr key={t.month}>
                  <td className="py-1">{monthLabel(t.month)}</td>
                  <td className="py-1 text-right">{formatCents(t.spentCents)}</td>
                  <td className="py-1 text-right">{formatCents(t.incomeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </div>
  );
}
