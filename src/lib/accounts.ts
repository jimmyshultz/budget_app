// Account types, in the order they appear on the Accounts page. Liability balances
// are stored as positive amounts owed (Plaid's convention) and subtracted from net worth.
export const ACCOUNT_SECTIONS = [
  { type: "depository", label: "Cash", isLiability: false },
  { type: "credit", label: "Credit cards", isLiability: true },
  { type: "investment", label: "Investments", isLiability: false },
  { type: "property", label: "Property", isLiability: false },
  { type: "loan", label: "Loans", isLiability: true },
  { type: "other", label: "Other", isLiability: false },
] as const;

export type AccountType = (typeof ACCOUNT_SECTIONS)[number]["type"];

export function isLiability(type: string): boolean {
  return ACCOUNT_SECTIONS.find((s) => s.type === type)?.isLiability ?? false;
}

/** Types you can add by hand, for things Plaid can't connect. */
export const MANUAL_KINDS: { type: AccountType; label: string; balanceLabel: string; placeholder: string }[] = [
  { type: "property", label: "Home / property", balanceLabel: "Estimated value", placeholder: "Home" },
  { type: "loan", label: "Mortgage / loan", balanceLabel: "Amount owed", placeholder: "Mortgage" },
  { type: "depository", label: "Cash account", balanceLabel: "Balance", placeholder: "Savings" },
  { type: "investment", label: "Investment", balanceLabel: "Value", placeholder: "Brokerage" },
  { type: "other", label: "Other asset", balanceLabel: "Value", placeholder: "Car" },
];

export function isManualKind(type: string): type is AccountType {
  return MANUAL_KINDS.some((k) => k.type === type);
}
