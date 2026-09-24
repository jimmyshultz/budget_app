import { connection } from "next/server";
import { and, asc, desc, eq, gte, isNull, like, lt, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { CategorySelect } from "@/components/CategorySelect";
import { formatCents, formatDate } from "@/lib/format";
import { currentMonth, monthRange, parseMonth } from "@/lib/months";

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  await connection();
  const params = await searchParams;
  const month = parseMonth(params.month) ?? currentMonth();
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const accountId = typeof params.account === "string" ? params.account : "";
  // "none" = transactions with no category at all.
  const category = typeof params.category === "string" ? params.category : "";

  const { start, end } = monthRange(month);
  const filters: SQL[] = [gte(schema.transactions.date, start), lt(schema.transactions.date, end)];
  if (accountId) filters.push(eq(schema.transactions.accountId, accountId));
  if (category === "none") filters.push(isNull(schema.transactions.categoryId));
  else if (/^\d+$/.test(category)) filters.push(eq(schema.transactions.categoryId, Number(category)));
  if (q) {
    filters.push(
      or(like(schema.transactions.name, `%${q}%`), like(schema.transactions.merchantName, `%${q}%`))!,
    );
  }

  const rows = db
    .select({
      id: schema.transactions.id,
      date: schema.transactions.date,
      name: schema.transactions.name,
      merchantName: schema.transactions.merchantName,
      amountCents: schema.transactions.amountCents,
      pending: schema.transactions.pending,
      categoryId: schema.transactions.categoryId,
      categorySource: schema.transactions.categorySource,
      accountName: schema.accounts.name,
      accountMask: schema.accounts.mask,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(and(...filters))
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .all();

  const categories = db
    .select({ id: schema.categories.id, name: schema.categories.name, groupName: schema.categories.groupName })
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder))
    .all();
  const accounts = db.select({ id: schema.accounts.id, name: schema.accounts.name, mask: schema.accounts.mask }).from(schema.accounts).all();

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap gap-2 text-sm">
        <input type="month" name="month" defaultValue={month} className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700" />
        <select name="account" defaultValue={accountId} className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.mask && `••${a.mask}`}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={category} className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700">
          <option value="">All categories</option>
          <option value="none">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input type="search" name="q" defaultValue={q} placeholder="Search" className="flex-1 rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700" />
        <button className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">Filter</button>
      </form>

      {rows.length === 0 ? (
        <p className="text-neutral-500">No matching transactions for this month.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="w-48 py-2 pr-3 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {rows.map((t) => (
                <tr key={t.id} className={t.pending ? "text-neutral-500" : ""}>
                  <td className="whitespace-nowrap py-1.5 pr-3">{formatDate(t.date)}</td>
                  <td className="py-1.5 pr-3">
                    <p>
                      {t.merchantName ?? t.name}
                      {t.pending && <span className="ml-2 text-xs italic">pending</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {t.accountName} {t.accountMask && `••${t.accountMask}`}
                    </p>
                  </td>
                  <td className="py-1.5 pr-3">
                    <CategorySelect
                      transactionId={t.id}
                      categoryId={t.categoryId}
                      merchant={t.merchantName ?? t.name}
                      options={categories}
                    />
                  </td>
                  {/* Plaid: positive = money out. Show inflows in green with a +. */}
                  <td className={`whitespace-nowrap py-1.5 text-right tabular-nums ${t.amountCents < 0 ? "text-emerald-600" : ""}`}>
                    {t.amountCents < 0 ? "+" : ""}
                    {formatCents(Math.abs(t.amountCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
