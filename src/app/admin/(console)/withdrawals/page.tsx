import { EmptyState } from "@/components/primitives/Card";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { StatusBadge, Badge } from "@/components/primitives/Badge";

import { ActionForm } from "@/components/admin/ActionForm";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { moveWithdrawal } from "@/server/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import * as settings from "@/server/services/settings";

export const metadata = { title: "Withdrawals" };
export const dynamic = "force-dynamic";

const OPEN = ["REQUESTED", "PENDING_REVIEW", "APPROVED", "PROCESSING"] as const;

export default async function WithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "OPEN", q = "" } = await searchParams;

  const withdrawals = await db.withdrawal.findMany({
    where: {
      ...(status === "ALL" ? {} : status === "OPEN" ? { status: { in: [...OPEN] } } : { status: status as never }),
      ...(q
        ? { user: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } }
        : {}),
    },
    include: { user: { include: { wallet: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const counts = await db.withdrawal.groupBy({ by: ["status"], _count: true });
  const countFor = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;
  const openCount = OPEN.reduce((total, key) => total + countFor(key), 0);

  // Rules (v), (ix), (x) — shown so an operator understands a refusal.
  const windows = await Promise.all(
    (["COMMISSION", "PRIZE", "BUMPER", "PRINCIPAL"] as const).map(async (kind) => ({
      kind, ...(await settings.isWithdrawalWindowOpen(kind)),
    })),
  );

  return (
    <>
      <PageHeader
        title="Withdrawals"
        description="Requested funds are already reserved out of the user's available balance. Approving twice pays once."
      />

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5 border-s-2 border-line bg-surface px-3 py-2">
        {windows.map((w) => (
          <span key={w.kind} className="flex items-center gap-1.5 text-micro">
            <Badge tone={w.open ? "ok" : "neutral"}>{w.kind}</Badge>
            <span className="text-mid">{w.reason}</span>
          </span>
        ))}
      </div>

      <FilterTabs
        basePath="/admin/withdrawals"
        current={status}
        query={q}
        tabs={[
          { key: "OPEN", label: "Open", count: openCount },
          { key: "PENDING_REVIEW", label: "In review", count: countFor("PENDING_REVIEW") },
          { key: "APPROVED", label: "Approved", count: countFor("APPROVED") },
          { key: "PAID", label: "Paid", count: countFor("PAID") },
          { key: "ALL", label: "All" },
        ]}
      />

      {withdrawals.length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="Requests appear here the moment a participant submits one, with their funds already reserved."
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>User</TH><TH>Source</TH><TH>Destination</TH><TH>Requested</TH>
                <TH>Status</TH><TH align="right">Available</TH><TH align="right">Amount</TH><TH align="right">Action</TH>
              </TR>
            </THead>
            <tbody>
              {withdrawals.map((w) => {
                const available = w.user.wallet?.available ?? 0n;
                const next =
                  w.status === "PENDING_REVIEW" || w.status === "REQUESTED" ? "APPROVED"
                  : w.status === "APPROVED" ? "PROCESSING"
                  : w.status === "PROCESSING" ? "PAID"
                  : null;

                return (
                  <TR key={w.id}>
                    <TD><CellStack primary={w.user.fullName} secondary={w.user.email} /></TD>
                    <TD className="text-mid">{w.sourceKind}</TD>
                    <TD>
                      <CellStack
                        primary={<span className="num text-micro">{w.destination.slice(0, 22)}…</span>}
                        secondary={w.method.replace(/_/g, " ")}
                      />
                    </TD>
                    <TD className="num text-micro text-mid whitespace-nowrap">{formatDateTime(w.createdAt)}</TD>
                    <TD><StatusBadge status={w.status} /></TD>
                    <TD numeric className="text-mid">{formatMoney(available)}</TD>
                    <TD numeric>{formatMoney(w.amount)}</TD>
                    <TD align="right">
                      <span className="flex items-center justify-end gap-1.5">
                        {next && (
                          <ActionForm
                            action={moveWithdrawal}
                            hidden={{ withdrawalId: w.id, to: next }}
                            label={next === "PAID" ? "Mark paid" : next === "PROCESSING" ? "Processing" : "Approve"}
                            variant={next === "PAID" ? "primary" : "solid"}
                            confirm={
                              next === "PAID" ? (
                                <>
                                  Confirm that <strong>{formatMoney(w.amount)}</strong> has been sent to{" "}
                                  <span className="num">{w.destination}</span> via {w.method.replace(/_/g, " ")}.
                                  This consumes the reserved funds and reduces platform cash. It cannot be undone —
                                  a mistake requires a compensating adjustment.
                                </>
                              ) : (
                                <>
                                  {w.user.fullName}&rsquo;s request for <strong>{formatMoney(w.amount)}</strong> moves
                                  to {next.toLowerCase()}. The funds are already reserved; no balance changes here.
                                </>
                              )
                            }
                          />
                        )}
                        {(["REQUESTED", "PENDING_REVIEW", "APPROVED", "PROCESSING"] as string[]).includes(w.status) && (
                          <ActionForm
                            action={moveWithdrawal}
                            hidden={{ withdrawalId: w.id, to: "REJECTED" }}
                            label="Reject"
                            variant="ghost"
                            reasonRequired
                            confirm={
                              <>
                                The reserved <strong>{formatMoney(w.amount)}</strong> returns to{" "}
                                {w.user.fullName}&rsquo;s available balance, and they are notified with your reason.
                              </>
                            }
                          />
                        )}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
