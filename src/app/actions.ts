"use server";

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CountryCode, Products } from "plaid";
import { db, schema } from "@/db";
import { isManualKind } from "@/lib/accounts";
import { decrypt, encrypt } from "@/lib/crypto";
import { parseDollars } from "@/lib/format";
import { addMonths, parseMonth } from "@/lib/months";
import { getPlaid, plaidConfigured, plaidErrorMessage } from "@/lib/plaid";
import { syncAll, syncItem, type SyncResult } from "@/lib/sync";

export type ConnectKind = "banking" | "investments" | "loan";

// Each kind asks Plaid for the product that institution type actually supports.
// Requiring "transactions" would hide investment-only and loan-only institutions in Link.
const PRODUCTS: Record<ConnectKind, Products[]> = {
  banking: [Products.Transactions],
  investments: [Products.Investments],
  loan: [Products.Liabilities],
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type LinkOptions = { kind: ConnectKind } | { itemId: string };

/**
 * Link token for a new connection ({ kind }) or for Plaid's update mode ({ itemId }): re-log
 * into a bank for an existing connection (e.g. after ITEM_LOGIN_REQUIRED) or add/remove accounts
 * there, keeping the item and all its history. `hosted` asks for a Hosted Link URL to open in the
 * system browser (the desktop app, since banks block logins inside embedded browsers).
 */
async function createLink(options: LinkOptions, hosted: boolean): Promise<Result<{ linkToken: string; url?: string }>> {
  if (!plaidConfigured()) {
    return { ok: false, error: "Plaid keys missing. Add your Plaid client ID and secret." };
  }
  let modeFields;
  if ("itemId" in options) {
    const item = db.select().from(schema.plaidItems).where(eq(schema.plaidItems.id, options.itemId)).get();
    if (!item) return { ok: false, error: "Connection not found." };
    modeFields = { access_token: decrypt(item.accessTokenEnc), update: { account_selection_enabled: true } };
  } else {
    modeFields = {
      products: PRODUCTS[options.kind],
      ...(options.kind === "banking" ? { transactions: { days_requested: 730 } } : {}),
    };
  }
  try {
    const { data } = await getPlaid().linkTokenCreate({
      client_name: "Budget App",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: "local-user" },
      ...modeFields,
      ...(hosted ? { hosted_link: {} } : {}),
    });
    if (hosted && !data.hosted_link_url) return { ok: false, error: "Plaid did not return a hosted link URL." };
    return { ok: true, data: { linkToken: data.link_token, url: data.hosted_link_url } };
  } catch (err) {
    return { ok: false, error: plaidErrorMessage(err) };
  }
}

/** In-page Plaid Link (browser). */
export async function createLinkToken(kind: ConnectKind): Promise<Result<string>> {
  const res = await createLink({ kind }, false);
  return res.ok ? { ok: true, data: res.data.linkToken } : res;
}

export async function createReconnectLinkToken(itemId: string): Promise<Result<string>> {
  const res = await createLink({ itemId }, false);
  return res.ok ? { ok: true, data: res.data.linkToken } : res;
}

export type HostedLink = { linkToken: string; url: string };

/** Hosted Link (desktop app): Plaid runs in the system browser and the app polls for the result. */
export async function createHostedLink(options: LinkOptions): Promise<Result<HostedLink>> {
  const res = await createLink(options, true);
  return res.ok ? { ok: true, data: { linkToken: res.data.linkToken, url: res.data.url! } } : res;
}

export type HostedStatus = { state: "waiting" } | { state: "success" } | { state: "exited"; message: string };

/** Whether the Hosted Link session has finished. Finished without an exit means success. */
export async function checkHostedSession(linkToken: string): Promise<Result<HostedStatus>> {
  try {
    const { data } = await getPlaid().linkTokenGet({ link_token: linkToken });
    const session = data.link_sessions?.find((s) => s.finished_at);
    if (!session) return { ok: true, data: { state: "waiting" } };
    if (session.exit) {
      const message =
        session.exit.error?.display_message || session.exit.error?.error_message || "Closed before finishing.";
      return { ok: true, data: { state: "exited", message } };
    }
    return { ok: true, data: { state: "success" } };
  } catch (err) {
    return { ok: false, error: plaidErrorMessage(err) };
  }
}

/** Save a new connection from a public token and pull its data. */
async function addConnection(
  publicToken: string,
  kind: ConnectKind,
  institution: { id: string | null; name: string | null },
): Promise<SyncResult> {
  const { data } = await getPlaid().itemPublicTokenExchange({ public_token: publicToken });
  db.insert(schema.plaidItems)
    .values({
      id: data.item_id,
      accessTokenEnc: encrypt(data.access_token),
      institutionId: institution.id,
      institutionName: institution.name,
      products: PRODUCTS[kind].join(","),
    })
    .onConflictDoNothing()
    .run();
  const item = db.select().from(schema.plaidItems).where(eq(schema.plaidItems.id, data.item_id)).get()!;
  return syncItem(item);
}

/** In-page Plaid Link success. */
export async function exchangePublicToken(
  publicToken: string,
  kind: ConnectKind,
  institution: { id: string | null; name: string | null },
): Promise<Result<SyncResult>> {
  try {
    const result = await addConnection(publicToken, kind, institution);
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: plaidErrorMessage(err) };
  }
}

/**
 * Hosted Link success for a new connection. The public token is read from Plaid here on the
 * server, so it never passes through the window.
 */
export async function completeHostedConnect(linkToken: string, kind: ConnectKind): Promise<Result<SyncResult[]>> {
  try {
    const { data } = await getPlaid().linkTokenGet({ link_token: linkToken });
    const added = (data.link_sessions ?? []).flatMap((s) => s.results?.item_add_results ?? []);
    if (added.length === 0) return { ok: false, error: "Plaid reported no new connection." };
    const results: SyncResult[] = [];
    for (const r of added) {
      results.push(
        await addConnection(r.public_token, kind, {
          id: r.institution?.institution_id ?? null,
          name: r.institution?.name ?? null,
        }),
      );
    }
    revalidatePath("/", "layout");
    return { ok: true, data: results };
  } catch (err) {
    return { ok: false, error: plaidErrorMessage(err) };
  }
}

/** After update mode succeeds: sync right away, which also clears the stored error. */
export async function finishReconnect(itemId: string): Promise<Result<SyncResult>> {
  const item = db.select().from(schema.plaidItems).where(eq(schema.plaidItems.id, itemId)).get();
  if (!item) return { ok: false, error: "Connection not found." };
  const result = await syncItem(item);
  revalidatePath("/", "layout");
  return { ok: true, data: result };
}

export async function syncNow(): Promise<SyncResult[]> {
  const results = await syncAll();
  revalidatePath("/", "layout");
  return results;
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Called when the app opens: syncs only if some connection hasn't synced in 6 hours. */
export async function syncIfStale(): Promise<SyncResult[] | null> {
  const items = db.select({ lastSyncedAt: schema.plaidItems.lastSyncedAt }).from(schema.plaidItems).all();
  const stale = items.some((i) => !i.lastSyncedAt || Date.now() - Date.parse(i.lastSyncedAt) > STALE_AFTER_MS);
  return stale ? syncNow() : null;
}

export async function disconnectItem(itemId: string): Promise<Result<null>> {
  const item = db.select().from(schema.plaidItems).where(eq(schema.plaidItems.id, itemId)).get();
  if (!item) return { ok: false, error: "Connection not found." };
  try {
    // Frees the connection on Plaid's side (it counts toward your plan's limit).
    await getPlaid().itemRemove({ access_token: decrypt(item.accessTokenEnc) });
  } catch (err) {
    const message = plaidErrorMessage(err);
    // Already gone on Plaid's side (e.g. a Sandbox item after switching to Production): just clean up locally.
    if (!/ITEM_NOT_FOUND|INVALID_ACCESS_TOKEN/.test(message)) {
      return { ok: false, error: message };
    }
  }
  db.delete(schema.plaidItems).where(eq(schema.plaidItems.id, itemId)).run();
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

// Manual accounts are rows in `accounts` with no Plaid item. Only those can be edited here.
const isManual = isNull(schema.accounts.itemId);

export async function createManualAccount(name: string, type: string, balance: string): Promise<Result<null>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a name." };
  if (!isManualKind(type)) return { ok: false, error: "Pick an account type." };
  const cents = parseDollars(balance);
  if (cents == null || Number.isNaN(cents)) return { ok: false, error: "Enter a dollar amount." };
  db.insert(schema.accounts)
    .values({
      id: `manual-${crypto.randomUUID()}`,
      name: trimmed,
      type,
      subtype: "manual",
      currentBalanceCents: cents,
      updatedAt: new Date().toISOString(),
    })
    .run();
  revalidatePath("/accounts");
  return { ok: true, data: null };
}

export async function updateManualBalance(accountId: string, balance: string): Promise<Result<null>> {
  const cents = parseDollars(balance);
  if (cents == null || Number.isNaN(cents)) return { ok: false, error: "Enter a dollar amount." };
  const { changes } = db
    .update(schema.accounts)
    .set({ currentBalanceCents: cents, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.accounts.id, accountId), isManual))
    .run();
  if (changes === 0) return { ok: false, error: "Account not found." };
  revalidatePath("/accounts");
  return { ok: true, data: null };
}

export async function deleteManualAccount(accountId: string) {
  db.delete(schema.accounts).where(and(eq(schema.accounts.id, accountId), isManual)).run();
  revalidatePath("/accounts");
}

export async function setTransactionCategory(transactionId: string, categoryId: number | null) {
  db.update(schema.transactions)
    .set({ categoryId, categorySource: "user" })
    .where(eq(schema.transactions.id, transactionId))
    .run();
  revalidatePath("/", "layout");
}

/**
 * Save a rule and re-categorize existing matching transactions, except ones you
 * categorized by hand. Returns how many transactions changed.
 */
export async function createRule(pattern: string, categoryId: number): Promise<Result<number>> {
  const trimmed = pattern.trim();
  if (trimmed.length < 2) return { ok: false, error: "Pattern must be at least 2 characters." };
  const existing = db
    .select()
    .from(schema.categoryRules)
    .where(sql`lower(${schema.categoryRules.pattern}) = lower(${trimmed})`)
    .get();
  if (existing) {
    db.update(schema.categoryRules).set({ categoryId }).where(eq(schema.categoryRules.id, existing.id)).run();
  } else {
    db.insert(schema.categoryRules).values({ pattern: trimmed, categoryId }).run();
  }
  const escaped = trimmed.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { changes } = db
    .update(schema.transactions)
    .set({ categoryId, categorySource: "rule" })
    .where(
      and(
        or(isNull(schema.transactions.categorySource), ne(schema.transactions.categorySource, "user")),
        sql`lower(coalesce(${schema.transactions.merchantName}, '') || ' ' || ${schema.transactions.name}) like ${`%${escaped}%`} escape '\\'`,
      ),
    )
    .run();
  revalidatePath("/", "layout");
  return { ok: true, data: changes };
}

export async function deleteRule(ruleId: number) {
  db.delete(schema.categoryRules).where(eq(schema.categoryRules.id, ruleId)).run();
  revalidatePath("/rules");
}

export async function setBudget(month: string, categoryId: number, dollars: string): Promise<Result<null>> {
  if (!parseMonth(month)) return { ok: false, error: "Invalid month." };
  const amountCents = parseDollars(dollars);
  if (Number.isNaN(amountCents)) return { ok: false, error: "Enter a dollar amount." };
  if (amountCents == null) {
    db.delete(schema.budgets)
      .where(and(eq(schema.budgets.month, month), eq(schema.budgets.categoryId, categoryId)))
      .run();
  } else {
    db.insert(schema.budgets)
      .values({ month, categoryId, amountCents })
      .onConflictDoUpdate({ target: [schema.budgets.month, schema.budgets.categoryId], set: { amountCents } })
      .run();
  }
  revalidatePath("/");
  return { ok: true, data: null };
}

/** Copy the previous month's budget amounts into categories this month doesn't have yet. */
export async function copyPreviousBudgets(month: string): Promise<Result<number>> {
  if (!parseMonth(month)) return { ok: false, error: "Invalid month." };
  const previous = db.select().from(schema.budgets).where(eq(schema.budgets.month, addMonths(month, -1))).all();
  if (previous.length === 0) return { ok: false, error: "Last month has no budget to copy." };
  const { changes } = db
    .insert(schema.budgets)
    .values(previous.map((b) => ({ month, categoryId: b.categoryId, amountCents: b.amountCents })))
    .onConflictDoNothing()
    .run();
  revalidatePath("/");
  return { ok: true, data: changes };
}
