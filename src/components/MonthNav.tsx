import Link from "next/link";
import { addMonths, currentMonth, monthLabel } from "@/lib/months";

export function MonthNav({ basePath, month }: { basePath: string; month: string }) {
  const link = (m: string) => `${basePath}?month=${m}`;
  const arrow = "flex h-8 w-8 items-center justify-center rounded-md border border-grid text-lg hover:bg-neutral-100 dark:hover:bg-neutral-800";
  return (
    <div className="flex items-center gap-2">
      <Link href={link(addMonths(month, -1))} aria-label="Previous month" title="Previous month" className={arrow}>
        ‹
      </Link>
      <h1 className="min-w-44 text-center text-lg font-semibold">{monthLabel(month)}</h1>
      <Link href={link(addMonths(month, 1))} aria-label="Next month" title="Next month" className={arrow}>
        ›
      </Link>
      {month !== currentMonth() && (
        <Link href={basePath} className="ml-1 text-sm text-ink-muted hover:text-foreground">
          This month
        </Link>
      )}
    </div>
  );
}
