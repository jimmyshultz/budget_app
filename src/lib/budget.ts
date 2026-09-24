export type BudgetStatus = "none" | "good" | "warning" | "critical";

// Spending this far ahead of the calendar (as a fraction of the budget) counts as "ahead of pace".
const PACE_TOLERANCE = 0.1;

/**
 * good: spending is at or behind the calendar pace.
 * warning: under budget but spending faster than the month is passing.
 * critical: over budget.
 */
export function budgetStatus(spentCents: number, budgetCents: number | null, elapsed: number): BudgetStatus {
  if (budgetCents == null) return "none";
  if (spentCents > budgetCents) return "critical";
  if (budgetCents === 0) return spentCents > 0 ? "critical" : "good";
  return spentCents / budgetCents > elapsed + PACE_TOLERANCE ? "warning" : "good";
}
