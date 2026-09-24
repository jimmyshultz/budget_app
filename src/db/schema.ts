import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// All money is stored as integer cents to avoid floating-point drift.
// Transaction amounts follow Plaid's sign convention: positive = money leaving
// the account (a purchase), negative = money coming in (a refund, paycheck, payment).

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

/** One login at one institution. Holds the encrypted Plaid access token. */
export const plaidItems = sqliteTable("plaid_items", {
  id: text("id").primaryKey(), // Plaid item_id
  accessTokenEnc: text("access_token_enc").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  products: text("products").notNull(), // comma-separated, e.g. "transactions"
  cursor: text("cursor"), // /transactions/sync cursor
  lastSyncedAt: text("last_synced_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // Plaid account_id, or a uuid for manual accounts
  itemId: text("item_id").references(() => plaidItems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  officialName: text("official_name"),
  mask: text("mask"),
  type: text("type").notNull(), // depository | credit | investment | loan | other
  subtype: text("subtype"),
  currentBalanceCents: integer("current_balance_cents"),
  availableBalanceCents: integer("available_balance_cents"),
  creditLimitCents: integer("credit_limit_cents"),
  isoCurrency: text("iso_currency").default("USD"),
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at"),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    groupName: text("group_name").notNull(),
    isIncome: integer("is_income", { mode: "boolean" }).notNull().default(false),
    // Transfers (card payments, moves between your own accounts) are excluded from spending.
    isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("categories_name_idx").on(t.name)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(), // Plaid transaction_id
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    authorizedDate: text("authorized_date"),
    amountCents: integer("amount_cents").notNull(),
    name: text("name").notNull(),
    merchantName: text("merchant_name"),
    plaidCategoryPrimary: text("plaid_category_primary"),
    plaidCategoryDetailed: text("plaid_category_detailed"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: text("category_source"), // plaid | rule | user
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    pendingTransactionId: text("pending_transaction_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
  ],
);

/** "If the merchant/description contains X, use category Y." Checked before Plaid's category. */
export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(), // case-insensitive substring
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull().default(0),
  createdAt: createdAt(),
});

export const budgets = sqliteTable(
  "budgets",
  {
    month: text("month").notNull(), // YYYY-MM
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.month, t.categoryId] })],
);

export type PlaidItem = typeof plaidItems.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
