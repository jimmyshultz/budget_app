import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DeleteRuleButton, RuleForm } from "@/components/RuleForm";

export default async function RulesPage() {
  await connection();
  const categories = db
    .select({ id: schema.categories.id, name: schema.categories.name, groupName: schema.categories.groupName })
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder))
    .all();
  const rules = db
    .select({
      id: schema.categoryRules.id,
      pattern: schema.categoryRules.pattern,
      category: schema.categories.name,
    })
    .from(schema.categoryRules)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.categoryRules.categoryId))
    .orderBy(asc(schema.categoryRules.priority), asc(schema.categoryRules.id))
    .all();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Category rules</h1>
        <p className="text-sm text-ink-secondary">
          Rules run before Plaid&apos;s categories, on new and existing transactions. Matching is case-insensitive
          against the merchant name and description. The first rule that matches wins. Transactions you
          categorized by hand are never changed.
        </p>
      </div>
      <RuleForm options={categories} />
      {rules.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No rules yet. You can also create one by changing a category on the Transactions page.
        </p>
      ) : (
        <ul className="divide-y divide-grid">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm dark:bg-neutral-800">{r.pattern}</code>
                <span className="text-ink-muted"> → </span>
                {r.category}
              </span>
              <DeleteRuleButton ruleId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
