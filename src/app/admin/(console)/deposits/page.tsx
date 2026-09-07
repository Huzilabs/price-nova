import Link from "next/link";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { StatusBadge, Badge } from "@/components/primitives/Badge";
import { EmptyState, Card } from "@/components/primitives/Card";
import { ActionForm } from "@/components/admin/ActionForm";
import { confirmDeposit, rejectDeposit } from "@/server/actions/admin";
import { allAdapters } from "@/server/payments/registry";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

/**
 * Payments and deposits, in one place.
 *
 * This is the existing deposits queue extended, not a second screen: automated
 * payments and manual ones share the table because an operator wants one answer
 * to "did this person pay". The difference shows in the Action column —
 * automated payments that succeeded need no approval and offer none.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; provider?: string; method?: string }>;
}) {
  const { status = "ACTION", q = "", provider = "", method = "" } = await searchParams;

  const where: Prisma.PaymentWhereInput = {
    ...(provider ? { provider: provider as Prisma.EnumPaymentProviderFilter["equals"] } : {}),
    ...(method ? { method: method as Prisma.EnumPaymentMethodFilter["equals"] } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { providerTxId: { contains: q, mode: "insensitive" } },
            { txHash: { contains: q, mode: "insensitive" } },
            { user: { fullName: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  // "Needs action" is the queue that matters: anything a human must resolve.
  if (status === "ACTION") {
    where.OR = [
      { provider: "MANUAL", deposit: { status: "PENDING" } },
      { status: { in: ["UNDERPAID", "OVERPAID"] } },
    ];
  } else if (status !== "ALL") {
    where.status = status as Prisma.EnumPaymentStatusFilter["equals"];
  }

  const [payments, counts, orphanDeposits] = await Promise.all([
    db.payment.findMany({
      where,
      include: { user: true, plan: true, deposit: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.payment.groupBy({ by: ["status"], _count: true }),
    // Deposits created before the payment system existed still need a home.
    db.deposit.findMany({
      where: { status: "PENDING", payment: null },
      include: { user: true, plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const countFor = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;
  const actionCount =
    (await db.payment.count({
      where: { OR: [{ provider: "MANUAL", deposit: { status: "PENDING" } }, { status: { in: ["UNDERPAID", "OVERPAID"] } }] },
    })) + orphanDeposits.length;

  const providerStatus = allAdapters().map((a) => ({
    key: a.key,
    configured: a.isConfigured(),
    sandbox: a.isConfigured() && a.isSandbox(),
    missing: a.missingConfig(),
  }));

  return (
    <>
      <PageHeader
        title="Payments"
        description="Automated payments credit themselves once the provider confirms. Only manual transfers and amount mismatches need a person."
      />

      {/* Provider readiness — the fastest way to answer "why can nobody pay?" */}
      <Card className="mb-5 flex flex-wrap gap-x-5 gap-y-2 p-3">
        {providerStatus.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-micro">
            <Badge tone={p.configured ? (p.sandbox ? "warn" : "mint") : "neutral"} dot={p.configured}>
              {p.key.replace(/_/g, " ")}
            </Badge>
            <span className="text-mid">
              {p.configured ? (p.sandbox ? "sandbox" : "live") : `missing ${p.missing.join(", ")}`}
            </span>
          </span>
        ))}
      </Card>

      <FilterTabs
        basePath="/admin/deposits"
        current={status}
        query={q}
        searchPlaceholder="Reference, tx id, hash, user"
        tabs={[
          { key: "ACTION", label: "Needs action", count: actionCount },
          { key: "WAITING_FOR_PAYMENT", label: "Waiting", count: countFor("WAITING_FOR_PAYMENT") },
          { key: "CONFIRMING", label: "Confirming", count: countFor("CONFIRMING") },
          { key: "SUCCESS", label: "Succeeded", count: countFor("SUCCESS") },
          { key: "FAILED", label: "Failed", count: countFor("FAILED") },
          { key: "ALL", label: "All" },
        ]}
      />

      {payments.length === 0 && orphanDeposits.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="Payments appear the moment a participant starts checkout, and update themselves as providers confirm."
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>User</TH><TH>Plan</TH><TH>Provider</TH><TH>Method</TH>
                <TH>Network</TH><TH>Status</TH><TH>Provider tx / hash</TH>
                <TH>Created</TH><TH>Completed</TH>
                <TH align="right">Expected</TH><TH align="right">Received</TH><TH align="right">Action</TH>
              </TR>
            </THead>
            <tbody>
              {payments.map((payment) => {
                const manualPending = payment.provider === "MANUAL" && payment.deposit.status === "PENDING";
                return (
                  <TR key={payment.id}>
                    <TD>
                      <Link href={`/admin/users/${payment.userId}`} className="hover:underline">
                        <CellStack primary={payment.user.fullName} secondary={payment.user.email} />
                      </Link>
                    </TD>
                    <TD className="text-mid">{payment.plan.name}</TD>
                    <TD className="text-mid">{payment.provider.replace(/_/g, " ")}</TD>
                    <TD className="text-mid">{payment.method.replace(/_/g, " ")}</TD>
                    <TD className="text-micro text-faint">{payment.cryptoNetwork ?? "—"}</TD>
                    <TD>
                      <span className="flex flex-col gap-1">
                        <StatusBadge status={payment.status} />
                        {payment.deposit.status === "CONFIRMED" && <Badge tone="mint">Credited</Badge>}
                      </span>
                    </TD>
                    <TD>
                      <CellStack
                        primary={<span className="mono text-micro">{payment.providerTxId ?? "—"}</span>}
                        secondary={payment.txHash ? <span className="mono">{payment.txHash.slice(0, 18)}…</span> : payment.reference}
                      />
                    </TD>
                    <TD className="mono text-micro text-faint whitespace-nowrap">{formatDateTime(payment.createdAt)}</TD>
                    <TD className="mono text-micro text-faint whitespace-nowrap">
                      {payment.completedAt ? formatDateTime(payment.completedAt) : "—"}
                    </TD>
                    <TD numeric>{formatMoney(payment.expectedAmount)}</TD>
                    <TD numeric className={payment.status === "UNDERPAID" ? "text-bad" : "text-mid"}>
                      {payment.receivedAmount != null ? formatMoney(payment.receivedAmount) : "—"}
                      {payment.receivedCrypto && (
                        <div className="mono text-micro text-faint">{payment.receivedCrypto} {payment.cryptoAsset}</div>
                      )}
                    </TD>
                    <TD align="right">
                      {manualPending ? (
                        <span className="flex items-center justify-end gap-1.5">
                          <ActionForm
                            action={confirmDeposit}
                            hidden={{ depositId: payment.depositId }}
                            label="Confirm"
                            variant="primary"
                            confirm={
                              <>
                                Confirm that <strong>{formatMoney(payment.expectedAmount)}</strong> from{" "}
                                <strong>{payment.user.fullName}</strong> has actually arrived. This credits
                                their wallet, activates participation and pays referral commission. It posts
                                to the ledger and cannot be edited afterwards.
                              </>
                            }
                          />
                          <ActionForm
                            action={rejectDeposit}
                            hidden={{ depositId: payment.depositId }}
                            label="Reject"
                            variant="ghost"
                            reasonRequired
                            confirm={<>No money moves. The participant is notified with your reason.</>}
                          />
                        </span>
                      ) : payment.status === "SUCCESS" ? (
                        <span className="text-micro text-faint">Automatic</span>
                      ) : payment.status === "UNDERPAID" || payment.status === "OVERPAID" ? (
                        <span className="text-micro text-gold">Amount mismatch — review</span>
                      ) : (
                        <span className="text-micro text-faint">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}

              {/* Pre-payment-system deposits, still approvable. */}
              {orphanDeposits.map((deposit) => (
                <TR key={deposit.id}>
                  <TD>
                    <Link href={`/admin/users/${deposit.userId}`} className="hover:underline">
                      <CellStack primary={deposit.user.fullName} secondary={deposit.user.email} />
                    </Link>
                  </TD>
                  <TD className="text-mid">{deposit.plan.name}</TD>
                  <TD className="text-mid">legacy</TD>
                  <TD className="text-mid">{deposit.method.replace(/_/g, " ")}</TD>
                  <TD className="text-micro text-faint">—</TD>
                  <TD><StatusBadge status={deposit.status} /></TD>
                  <TD className="mono text-micro">{deposit.externalRef ?? "—"}</TD>
                  <TD className="mono text-micro text-faint whitespace-nowrap">{formatDateTime(deposit.createdAt)}</TD>
                  <TD className="text-micro text-faint">—</TD>
                  <TD numeric>{formatMoney(deposit.amount)}</TD>
                  <TD numeric className="text-mid">—</TD>
                  <TD align="right">
                    <span className="flex items-center justify-end gap-1.5">
                      <ActionForm
                        action={confirmDeposit}
                        hidden={{ depositId: deposit.id }}
                        label="Confirm"
                        variant="primary"
                        confirm={<>Credits {formatMoney(deposit.amount)} and activates participation.</>}
                      />
                      <ActionForm
                        action={rejectDeposit}
                        hidden={{ depositId: deposit.id }}
                        label="Reject" variant="ghost" reasonRequired
                        confirm={<>No money moves.</>}
                      />
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
