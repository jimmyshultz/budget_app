"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Shown while Plaid keys are missing, except on the pages where you enter them. */
export function SetupBanner() {
  const pathname = usePathname();
  if (pathname === "/setup" || pathname === "/settings") return null;
  return (
    <div className="border-b border-grid bg-neutral-50 dark:bg-neutral-900">
      <p className="mx-auto max-w-5xl px-4 py-2 text-sm text-ink-secondary">
        Plaid isn&apos;t set up yet, so banks can&apos;t be connected.{" "}
        <Link href="/setup" className="font-medium text-viz-accent underline">
          Set up Plaid
        </Link>
      </p>
    </div>
  );
}
