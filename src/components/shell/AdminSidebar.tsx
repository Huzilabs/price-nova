"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Wordmark";
import { cn } from "@/lib/cn";

/**
 * Admin navigation.
 *
 * A sidebar on desktop, where the member app has a bottom bar — the two shells
 * stay structurally different so neither reads as a re-skin of the other.
 * Grouped by what an operator is doing rather than by database table.
 *
 * Below `lg` the sidebar would swallow a third of the viewport, so the same
 * destinations collapse into one horizontally scrolling strip.
 */
const GROUPS: Array<{ label: string; items: Array<{ href: string; label: string }> }> = [
  { label: "Operate", items: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/deposits", label: "Deposits" },
    { href: "/admin/withdrawals", label: "Withdrawals" },
  ]},
  { label: "Rewards", items: [
    { href: "/admin/draws", label: "Draws" },
    { href: "/admin/bumper", label: "Bumper prizes" },
  ]},
  { label: "People", items: [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/referrals", label: "Referrals" },
  ]},
  { label: "Records", items: [
    { href: "/admin/ledger", label: "Ledger" },
    { href: "/admin/audit", label: "Audit log" },
  ]},
  { label: "Configure", items: [
    { href: "/admin/payment-accounts", label: "Payment accounts" },
    { href: "/admin/plans", label: "Plans" },
    { href: "/admin/settings", label: "Settings" },
  ]},
];

export function AdminSidebar({
  pendingDeposits, pendingWithdrawals,
}: { pendingDeposits: number; pendingWithdrawals: number }) {
  const pathname = usePathname();
  const badges: Record<string, number> = {
    "/admin/deposits": pendingDeposits,
    "/admin/withdrawals": pendingWithdrawals,
  };
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile: one scrolling strip. */}
      <nav
        aria-label="Admin"
        className="sticky top-0 z-30 flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GROUPS.flatMap((group) => group.items).map((item) => {
          const active = isActive(item.href);
          const count = badges[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap",
                active ? "bg-surface-3 font-bold text-hi" : "text-mid hover:text-hi",
              )}
            >
              {item.label}
              {count > 0 && (
                <span className="num rounded-full bg-gold-tint px-1.5 text-micro font-bold text-gold">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: the grouped sidebar. */}
      <nav
        aria-label="Admin"
        className="hidden h-full w-[13.5rem] shrink-0 flex-col border-e border-line bg-surface lg:flex"
      >
        <div className="flex h-12 items-center gap-2 border-b border-line px-4">
          <Mark className="size-4" />
          <span className="font-display text-base font-extrabold tracking-[-0.02em] text-hi">
            PriceNova
          </span>
          <span className="ms-auto text-micro font-bold uppercase tracking-[0.09em] text-faint">
            Admin
          </span>
        </div>

        <div className="grow overflow-y-auto py-3">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-4 px-2">
              <div className="px-2 pb-1 text-micro font-bold uppercase tracking-[0.1em] text-faint">
                {group.label}
              </div>
              {group.items.map((item) => {
                const active = isActive(item.href);
                const count = badges[item.href] ?? 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                      "transition-colors duration-(--dur-1)",
                      active
                        ? "bg-surface-3 font-bold text-hi shadow-[inset_2px_0_0_var(--color-mint)]"
                        : "text-mid hover:bg-surface-2 hover:text-hi",
                    )}
                  >
                    {item.label}
                    {count > 0 && (
                      <span className="num ms-auto rounded-full bg-gold-tint px-1.5 text-micro font-bold text-gold">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
