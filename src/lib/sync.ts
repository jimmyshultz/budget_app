import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { AccountBase, RemovedTransaction, Transaction as PlaidTxn } from "plaid";
import { db, schema } from "@/db";
import type { PlaidItem } from "@/db/schema";
import { decrypt } from "./crypto";
import { plaid, plaidErrorMessage } from "./plaid";
import { categoryNameForPlaid, matchRule, type Rule } from "./categorize";

const toCents = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));

export type SyncResult = {
  itemId: string;
  institution: string | null;
  added: number;
  modified: number;
  removed: number;
  error?: string;
};

export async function syncAll(): Promise<SyncResult[]> {
  const items = db.select().from(schema.plaidItems).all();
  const results: SyncResult[] = [];
  for (const item of items) results.push(await syncItem(item));
  return results;
}

export async function syncItem(item: PlaidItem): Promise<SyncResult> {
  const result: SyncResult = {
    itemId: item.id,
    institution: item.institutionName,
    added: 0,
    modified: 0,
    removed: 0,
  };
  try {
    const accessToken = decrypt(item.accessTokenEnc);

    const { data } = await plaid.accountsGet({ access_token: accessToken });
    upsertAccounts(item.id, data.accounts);

    if (item.products.split(",").includes("transactions")) {
      const changes = await fetchTransactionChanges(accessToken, item.cursor);
      applyTransactionChanges(item.id, changes);
      result.added = changes.added.length;
      result.modified = changes.modified.length;
      result.removed = changes.removed.length;
    }

    db.update(schema.plaidItems)
      .set({ lastSyncedAt: new Date().toISOString(), lastError: null })
      .where(eq(schema.plaidItems.id, item.id))
      .run();
  } catch (err) {
    result.error = plaidErrorMessage(err);
    db.update(schema.plaidItems)
      .set({ lastError: result.error })
      .where(eq(schema.plaidItems.id, item.id))
      .run();
  }
  return result;
}

function upsertAccounts(itemId: string, plaidAccounts: AccountBase[]) {
  const now = new Date().toISOString();
  for (const a of plaidAccounts) {
    const values = {
      name: a.name,
      officialName: a.official_name ?? null,
      mask: a.mask ?? null,
      type: a.type,
      subtype: a.subtype ?? null,
      currentBalanceCents: toCents(a.balances.current),
      availableBalanceCents: toCents(a.balances.available),
      creditLimitCents: toCents(a.balances.limit),
      isoCurrency: a.balances.iso_currency_code ?? "USD",
      updatedAt: now,
    };
    db.insert(schema.accounts)
      .values({ id: a.account_id, itemId, ...values })
      .onConflictDoUpdate({ target: schema.accounts.id, set: values })
      .run();
  }
}

type Changes = {
  added: PlaidTxn[];
  modified: PlaidTxn[];
  removed: RemovedTransaction[];
  cursor: string;
};

async function fetchTransactionChanges(accessToken: string, startCursor: string | null) {
  // If the data changes mid-pagination Plaid asks us to restart from the original cursor.
  for (let attempt = 0; attempt < 3; attempt++) {
    const changes: Changes = { added: [], modified: [], removed: [], cursor: startCursor ?? "" };
    try {
      let hasMore = true;
      while (hasMore) {
        const { data } = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: changes.cursor || undefined,
          count: 500,
        });
        changes.added.push(...data.added);
        changes.modified.push(...data.modified);
        changes.removed.push(...data.removed);
        changes.cursor = data.next_cursor;
        hasMore = data.has_more;
      }
      return changes;
    } catch (err) {
      if (plaidErrorMessage(err).startsWith("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION")) continue;
      throw err;
    }
  }
  throw new Error("Transactions kept changing during sync; try again in a minute.");
}

function applyTransactionChanges(itemId: string, changes: Changes) {
  const categoryIdByName = new Map(
    db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .all()
      .map((c) => [c.name, c.id]),
  );
  const rules: Rule[] = db
    .select({ pattern: schema.categoryRules.pattern, categoryId: schema.categoryRules.categoryId })
    .from(schema.categoryRules)
    .orderBy(asc(schema.categoryRules.priority), asc(schema.categoryRules.id))
    .all();

  const autoCategory = (t: PlaidTxn) => {
    const ruleCategory = matchRule(rules, t.merchant_name, t.name);
    if (ruleCategory != null) return { categoryId: ruleCategory, categorySource: "rule" };
    const pfc = t.personal_finance_category;
    const name = categoryNameForPlaid(pfc?.primary, pfc?.detailed);
    return { categoryId: categoryIdByName.get(name) ?? null, categorySource: "plaid" };
  };

  const fields = (t: PlaidTxn) => ({
    accountId: t.account_id,
    date: t.date,
    authorizedDate: t.authorized_date ?? null,
    amountCents: Math.round(t.amount * 100),
    name: t.name,
    merchantName: t.merchant_name ?? null,
    plaidCategoryPrimary: t.personal_finance_category?.primary ?? null,
    plaidCategoryDetailed: t.personal_finance_category?.detailed ?? null,
    pending: t.pending,
    pendingTransactionId: t.pending_transaction_id ?? null,
  });

  db.transaction((tx) => {
    for (const t of changes.added) {
      let category = autoCategory(t);
      let notes: string | null = null;
      // When a pending charge posts, Plaid issues a new transaction. Keep any category
      // or notes you set on the pending version.
      if (t.pending_transaction_id) {
        const prior = tx
          .select()
          .from(schema.transactions)
          .where(eq(schema.transactions.id, t.pending_transaction_id))
          .get();
        if (prior) {
          if (prior.categorySource === "user") {
            category = { categoryId: prior.categoryId, categorySource: "user" };
          }
          notes = prior.notes;
        }
      }
      tx.insert(schema.transactions)
        .values({ id: t.transaction_id, ...fields(t), ...category, notes })
        .onConflictDoUpdate({ target: schema.transactions.id, set: fields(t) })
        .run();
    }

    for (const t of changes.modified) {
      const existing = tx
        .select({ categorySource: schema.transactions.categorySource })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, t.transaction_id))
        .get();
      const keepCategory = existing?.categorySource === "user";
      tx.insert(schema.transactions)
        .values({ id: t.transaction_id, ...fields(t), ...autoCategory(t) })
        .onConflictDoUpdate({
          target: schema.transactions.id,
          set: keepCategory ? fields(t) : { ...fields(t), ...autoCategory(t) },
        })
        .run();
    }

    const removedIds = changes.removed.map((r) => r.transaction_id);
    if (removedIds.length > 0) {
      tx.delete(schema.transactions).where(inArray(schema.transactions.id, removedIds)).run();
    }

    tx.update(schema.plaidItems)
      .set({ cursor: changes.cursor })
      .where(eq(schema.plaidItems.id, itemId))
      .run();
  });
}
