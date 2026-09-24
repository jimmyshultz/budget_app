import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { monthRange } from "./months";

// "Spending" = money out of cash and credit accounts, excluding transfers and income
// categories. Refunds (negative amounts) net against their category.
const SPENDING_FILTER = sql`
  a.type in ('depository', 'credit')
  and coalesce(c.is_transfer, 0) = 0
  and coalesce(c.is_income, 0) = 0
`;

export type CategorySpend = {
  categoryId: number | null;
  name: string;
  groupName: string;
  spentCents: number;
  count: number;
};

export function spendingByCategory(month: string): CategorySpend[] {
  const { start, end } = monthRange(month);
  return db.all<CategorySpend>(sql`
    select t.category_id as categoryId,
           coalesce(c.name, 'Uncategorized') as name,
           coalesce(c.group_name, 'Other') as groupName,
           sum(t.amount_cents) as spentCents,
           count(*) as count
    from transactions t
    join accounts a on a.id = t.account_id
    left join categories c on c.id = t.category_id
    where t.date >= ${start} and t.date < ${end} and ${SPENDING_FILTER}
    group by t.category_id
    order by spentCents desc
  `);
}

/** Income received per income category (positive = money in). */
export function incomeByCategory(month: string): { categoryId: number; receivedCents: number }[] {
  const { start, end } = monthRange(month);
  return db.all(sql`
    select t.category_id as categoryId, -sum(t.amount_cents) as receivedCents
    from transactions t
    join accounts a on a.id = t.account_id
    join categories c on c.id = t.category_id
    where t.date >= ${start} and t.date < ${end}
      and a.type in ('depository', 'credit')
      and c.is_income = 1
    group by t.category_id
  `);
}

export type MonthTotal ={ month: string; spentCents: number; incomeCents: number };

/** Spending and income per month for [fromMonth, toMonth], with empty months filled in. */
export function monthlyTotals(months: string[]): MonthTotal[] {
  const start = monthRange(months[0]).start;
  const end = monthRange(months[months.length - 1]).end;
  const rows = db.all<MonthTotal>(sql`
    select substr(t.date, 1, 7) as month,
           sum(case when coalesce(c.is_income, 0) = 0 then t.amount_cents else 0 end) as spentCents,
           -sum(case when c.is_income = 1 then t.amount_cents else 0 end) as incomeCents
    from transactions t
    join accounts a on a.id = t.account_id
    left join categories c on c.id = t.category_id
    where t.date >= ${start} and t.date < ${end}
      and a.type in ('depository', 'credit')
      and coalesce(c.is_transfer, 0) = 0
    group by month
  `);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((month) => byMonth.get(month) ?? { month, spentCents: 0, incomeCents: 0 });
}
