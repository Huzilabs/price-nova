import { requireAdmin } from "@/lib/guards";
import { db } from "@/lib/db";
import { AdminSidebar } from "@/components/shell/AdminSidebar";
import { signOut } from "@/server/actions/auth";

/**
 * Admin shell. `data-density="compact"` is the whole difference in component
 * sizing — same tokens, tighter rows, denser tables.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Every route under this layout is guarded. /admin/login deliberately sits
  // OUTSIDE the (console) route group: nested layouts in Next nest rather than
  // replace, so putting the login page under this shell would have it redirect
  // to itself forever. The group keeps the URLs identical.
  const admin = await requireAdmin();

  const [pendingDeposits, pendingWithdrawals] = await Promise.all([
    db.deposit.count({ where: { status: "PENDING" } }),
    db.withdrawal.count({ where: { status: { in: ["REQUESTED", "PENDING_REVIEW", "APPROVED", "PROCESSING"] } } }),
  ]);

  return (
    <div data-density="compact" className="flex min-h-dvh flex-col bg-base lg:h-dvh lg:flex-row lg:overflow-hidden">
      <AdminSidebar pendingDeposits={pendingDeposits} pendingWithdrawals={pendingWithdrawals} />

      <div className="flex min-w-0 grow flex-col">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-4 sm:px-5">
          <div className="ms-auto flex items-center gap-3">
            <span className="text-micro text-mid">
              {admin.fullName} · <span className="text-faint">{admin.roles.join(", ")}</span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-sm px-2 py-1 text-micro font-medium text-mid transition-colors duration-(--dur-1) hover:bg-surface-2 hover:text-hi"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 grow px-4 py-5 sm:px-5 lg:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
