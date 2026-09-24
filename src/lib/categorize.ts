import "server-only";

export type DefaultCategory = {
  name: string;
  group: string;
  color: string;
  isIncome?: boolean;
  isTransfer?: boolean;
};

export const UNCATEGORIZED = "Uncategorized";
export const TRANSFER = "Transfer";

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Paycheck", group: "Income", color: "#16a34a", isIncome: true },
  { name: "Other Income", group: "Income", color: "#4ade80", isIncome: true },
  { name: "Mortgage", group: "Housing", color: "#2563eb" },
  { name: "Utilities", group: "Housing", color: "#3b82f6" },
  { name: "Home", group: "Housing", color: "#60a5fa" },
  { name: "Groceries", group: "Food", color: "#ea580c" },
  { name: "Dining Out", group: "Food", color: "#fb923c" },
  { name: "Gas", group: "Transportation", color: "#7c3aed" },
  { name: "Auto & Transport", group: "Transportation", color: "#a78bfa" },
  { name: "Shopping", group: "Shopping", color: "#db2777" },
  { name: "Medical", group: "Health", color: "#0d9488" },
  { name: "Personal Care", group: "Health", color: "#2dd4bf" },
  { name: "Entertainment", group: "Fun", color: "#ca8a04" },
  { name: "Travel", group: "Fun", color: "#facc15" },
  { name: "Insurance", group: "Bills", color: "#475569" },
  { name: "Services", group: "Bills", color: "#64748b" },
  { name: "Loan Payments", group: "Bills", color: "#94a3b8" },
  { name: "Fees", group: "Bills", color: "#b91c1c" },
  { name: "Taxes & Government", group: "Bills", color: "#78716c" },
  { name: "Gifts & Donations", group: "Giving", color: "#e11d48" },
  { name: TRANSFER, group: "Transfers", color: "#a3a3a3", isTransfer: true },
  { name: UNCATEGORIZED, group: "Other", color: "#d4d4d4" },
];

// Plaid personal_finance_category → our category name. Checked in order against
// the detailed category (which starts with the primary), so specific prefixes
// must come before general ones.
const PLAID_CATEGORY_MAP: [prefix: string, category: string][] = [
  ["INCOME_WAGES", "Paycheck"],
  ["INCOME_SALARY", "Paycheck"],
  ["INCOME", "Other Income"],
  ["TRANSFER_IN", TRANSFER],
  ["TRANSFER_OUT", TRANSFER],
  ["LOAN_PAYMENTS_CREDIT_CARD", TRANSFER], // paying a card from checking isn't new spending
  ["LOAN_PAYMENTS_MORTGAGE", "Mortgage"],
  ["LOAN_PAYMENTS", "Loan Payments"],
  ["FOOD_AND_DRINK_GROCERIES", "Groceries"],
  ["FOOD_AND_DRINK", "Dining Out"],
  ["TRANSPORTATION_GAS", "Gas"],
  ["TRANSPORTATION", "Auto & Transport"],
  ["RENT_AND_UTILITIES_RENT", "Home"],
  ["RENT_AND_UTILITIES", "Utilities"],
  ["HOME_IMPROVEMENT", "Home"],
  ["GENERAL_MERCHANDISE", "Shopping"],
  ["MEDICAL", "Medical"],
  ["PERSONAL_CARE", "Personal Care"],
  ["ENTERTAINMENT", "Entertainment"],
  ["TRAVEL", "Travel"],
  ["BANK_FEES", "Fees"],
  ["GENERAL_SERVICES_INSURANCE", "Insurance"],
  ["GENERAL_SERVICES", "Services"],
  ["GOVERNMENT_AND_NON_PROFIT_DONATIONS", "Gifts & Donations"],
  ["GOVERNMENT_AND_NON_PROFIT", "Taxes & Government"],
];

export function categoryNameForPlaid(
  primary: string | null | undefined,
  detailed: string | null | undefined,
): string {
  const key = detailed || primary;
  if (!key) return UNCATEGORIZED;
  const match = PLAID_CATEGORY_MAP.find(([prefix]) => key.startsWith(prefix));
  return match ? match[1] : UNCATEGORIZED;
}

export type Rule = { pattern: string; categoryId: number };

/** Rules are pre-sorted by priority; first substring match wins. */
export function matchRule(
  rules: Rule[],
  merchantName: string | null | undefined,
  name: string,
): number | null {
  const haystack = `${merchantName ?? ""} ${name}`.toLowerCase();
  const rule = rules.find((r) => haystack.includes(r.pattern.toLowerCase()));
  return rule ? rule.categoryId : null;
}
