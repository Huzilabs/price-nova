import Link from "next/link";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { StatusBadge, Badge, PaymentStatusBadge } from "@/components/primitives/Badge";
import { EmptyState, Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { ActionForm } from "@/components/admin/ActionForm";
import { confirmDeposit, rejectDeposit } from "@/server/actions/admin";
import { allAdapters } from "@/server/payments/registry";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { methodLabel } from "@/lib/payment-status";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

/** Statuses still open on the provider side — the "pending" bucket. */
const OPEN: Prisma.EnumPaymentStatusFilter["in"] = [
  "PENDING", "WAITING_FOR_PAYMENT", "VERIFYING", "PAYMENT_DETECTED", "CONFIRMING", "MANUAL_REVIEW_REQUIRED",
];

/**
 * Payments.
 *
 * One table for every rail, because an operator wants one answer to "did this
 * person pay". The default tab is the review queue: manual payments whose
 * participant has submitted a TXID, plus amount mismatches from gateways.
 * A manual payment with no TXID yet is not in the queue — there is nothing to
 * check — but is visible under All.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "ACTION", q = "" } = await searchParams;

  const needsReview: Prisma.PaymentWhereInput = {
    OR: [
      { provider: "MANUAL", deposit: { status: "PENDING" }, userSubmittedReference: { not: null }, status: { in: OPEN } },
      { status: { in: ["UNDERPAID", "OVERPAID"] }, deposit: { status: "PENDING" } },
    ],
  };

  const search: Prisma.PaymentWhereInput = q
    ? {
        OR: [
          { reference: { contains: q, mode: "insensitive" } },
          { userSubmittedReference: { contains: q, mode: "insensitive" } },
          { providerTxId: { contains: q, mode: "insensitive" } },
          { txHash: { contains: q, mode: "insensitive" } },
          { user: { fullName: { contains: q, mode: "insensitive" } } },
          { user: { email: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};

  const bucket: Record<string, Prisma.PaymentWhereInput> = {
    ACTION: needsReview,
    PENDING: { status: { in: OPEN } },
    APPROVED: { status: { in: ["SUCCESS", "OVERPAID"] } },
    REJECTED: { status: { in: ["REJECTED", "FAILED", "EXPIRED", "REFUNDED"] } },
    CANCELLED: { status: "CANCELLED" },
    ALL: {},
  };

  const where: Prisma.PaymentWhereInput = { AND: [bucket[status] ?? {}, search] };

  const [payments, orphanDeposits, counts] = await Promise.all([
    db.payment.findMany({
      where,
      include: { user: true, deposit: true },
      orderBy: [{ lastVerifiedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 100,
    }),
    // Deposits created before the payment system existed still need a home.
    status === "ACTION" || status === "ALL"
      ? db.deposit.findMany({
          where: { status: "PENDING", payment: null },
          include: { user: true, plan: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    Promise.all(
      (["ACTION", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map(
        async (key) => [key, await db.payment.count({ where: bucket[key]! })] as const,
      ),
    ),
  ]);

  const count = Object.fromEntries(counts) as Record<string, number>;

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
        description="Manual payments are credited only when you approve them. Check the TXID on the block explorer first — the participant's word is not proof."
      />

      {/* Provider readiness — the fastest way to answer "why can nobody pay?" */}
      <Card className="mb-5 flex flex-wrap gap-x-5 gap-y-2 p-3">
        {providerStatus.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-micro">
            <Badge tone={p.configured ? (p.sandbox ? "warn" : "mint") : "neutral"} dot={p.configured}>
              {p.key.replace(/_/g, " ")}
            </Badge>
            <span className="text-mid">
              {p.key === "MANUAL" ? "admin approval" : p.configured ? (p.sandbox ? "sandbox" : "live") : `missing ${p.missing.join(", ")}`}
            </span>
          </span>
        ))}
      </Card>

      <FilterTabs
        basePath="/admin/deposits"
        current={status}
        query={q}
        searchPlaceholder="TXID, reference, name or email"
        tabs={[
          { key: "ACTION", label: "Needs review", count: (count.ACTION ?? 0) + orphanDeposits.length },
          { key: "PENDING", label: "Pending", count: count.PENDING },
          { key: "APPROVED", label: "Approved", count: count.APPROVED },
          { key: "REJECTED", label: "Rejected", count: count.REJECTED },
          { key: "CANCELLED", label: "Cancelled", count: count.CANCELLED },
          { key: "ALL", label: "All" },
        ]}
      />

      {payments.length === 0 && orphanDeposits.length === 0 ? (
        <EmptyState
          title={status === "ACTION" ? "Nothing to review" : "No payments here"}
          description={status === "ACTION"
            ? "Payments appear here the moment a participant submits a transaction ID."
            : "Try another tab, or clear the search."}
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>User</TH><TH>Email</TH><TH align="right">Amount</TH><TH>Currency</TH>
                <TH>Network</TH><TH>Method</TH><TH>TXID</TH><TH>Submitted</TH>
                <TH>Status</TH><TH align="right">Action</TH>
              </TR>
            </THead>
            <tbody>
              {payments.map((payment) => {
                const txid = payment.userSubmittedReference ?? payment.txHash ?? payment.providerTxId;
                return (
                  <TR key={payment.id}>
                    <TD>
                      <Link href={`/admin/users/${payment.userId}`} className="font-bold text-hi hover:underline">
                        {payment.user.fullName}
                      </Link>
                    </TD>
                    <TD className="text-mid">{payment.user.email}</TD>
                    <TD numeric>
                      <CellStack
                        primary={formatMoney(payment.expectedAmount)}
                        secondary={payment.userSubmittedAmount != null
                          ? <span className={payment.userSubmittedAmount < payment.expectedAmount ? "text-bad" : undefined}>
                              sent {formatMoney(payment.userSubmittedAmount)}
                            </span>
                          : undefined}
                      />
                    </TD>
                    <TD className="text-mid">{payment.cryptoAsset ?? payment.currency}</TD>
                    <TD className="text-mid">{payment.cryptoNetwork ?? "—"}</TD>
                    <TD className="text-mid">{methodLabel(payment.method)}</TD>
                    <TD>
                      {txid
                        ? <span className="mono text-micro" title={txid}>{txid.slice(0, 10)}…{txid.slice(-6)}</span>
                        : <span className="text-micro text-faint">—</span>}
                    </TD>
                    <TD className="mono text-micro text-faint whitespace-nowrap">
                      {formatDateTime(payment.lastVerifiedAt ?? payment.createdAt)}
                    </TD>
                    <TD>
                      <span className="flex flex-col items-start gap-1">
                        <PaymentStatusBadge payment={payment} />
                        {(payment.status === "UNDERPAID" || payment.status === "OVERPAID") && (
                          <Badge tone="gold">Amount mismatch</Badge>
                        )}
                      </span>
                    </TD>
                    <TD align="right">
                      <Button href={`/admin/deposits/${payment.id}`} size="sm"
                              variant={payment.deposit.status === "PENDING" && txid ? "primary" : "ghost"}>
                        {payment.deposit.status === "PENDING" && txid ? "Review" : "View"}
                      </Button>
                    </TD>
                  </TR>
                );
              })}

              {/* Pre-payment-system deposits, still approvable. */}
              {orphanDeposits.map((deposit) => (
                <TR key={deposit.id}>
                  <TD className="font-bold text-hi">{deposit.user.fullName}</TD>
                  <TD className="text-mid">{deposit.user.email}</TD>
                  <TD numeric>{formatMoney(deposit.amount)}</TD>
                  <TD className="text-mid">{deposit.currency}</TD>
                  <TD className="text-faint">—</TD>
                  <TD className="text-mid">{methodLabel(deposit.method)} · legacy</TD>
                  <TD className="mono text-micro">{deposit.externalRef ?? "—"}</TD>
                  <TD className="mono text-micro text-faint whitespace-nowrap">{formatDateTime(deposit.createdAt)}</TD>
                  <TD><StatusBadge status={deposit.status} /></TD>
                  <TD align="right">
                    <span className="flex items-center justify-end gap-1.5">
                      <ActionForm
                        action={confirmDeposit}
                        hidden={{ depositId: deposit.id }}
                        label="Approve"
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
