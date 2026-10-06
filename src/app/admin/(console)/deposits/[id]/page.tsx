import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Section } from "@/components/primitives/Section";
import { Card } from "@/components/primitives/Card";
import { Badge, PaymentStatusBadge } from "@/components/primitives/Badge";
import { ActionForm } from "@/components/admin/ActionForm";
import { approvePayment, rejectPayment } from "@/server/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { displayStatus, explorerUrl, methodLabel } from "@/lib/payment-status";

export const metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

/**
 * One payment, with everything a reviewer needs on one screen: who, how much
 * was asked, how much they say they sent, the TXID with a block-explorer link,
 * and the address the payment was meant to reach.
 */
export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      user: true,
      plan: true,
      deposit: true,
      paymentAccount: true,
      events: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!payment) notFound();

  const reviewer = payment.deposit.reviewedById
    ? await db.user.findUnique({
        where: { id: payment.deposit.reviewedById },
        select: { fullName: true, email: true },
      })
    : null;

  const txid = payment.userSubmittedReference ?? payment.txHash;
  const explorer = explorerUrl(payment.cryptoNetwork, payment.txHash ?? payment.userSubmittedReference);
  // The address snapshot taken when the payment opened; falls back to the
  // account's current address only for payments made before snapshots existed.
  const receivingWallet = payment.receivingAddress ?? payment.paymentAccount?.walletAddress ?? null;
  const walletChanged = Boolean(
    payment.receivingAddress && payment.paymentAccount?.walletAddress
    && payment.receivingAddress !== payment.paymentAccount.walletAddress,
  );

  const reviewable =
    payment.deposit.status === "PENDING"
    && !["SUCCESS", "REJECTED", "CANCELLED", "FAILED", "EXPIRED", "REFUNDED"].includes(payment.status)
    && (payment.provider !== "MANUAL" || Boolean(payment.userSubmittedReference));

  const shortfall =
    payment.userSubmittedAmount != null && payment.userSubmittedAmount < payment.expectedAmount;

  return (
    <>
      <div className="mb-3 text-sm">
        <Link href="/admin/deposits" className="text-mid hover:text-hi">← Payments</Link>
      </div>

      <PageHeader
        title={`${formatMoney(payment.expectedAmount)} · ${payment.user.fullName}`}
        description={<span className="mono">{payment.reference}</span>}
        action={<PaymentStatusBadge payment={payment} />}
      />

      {reviewable && (
        <Card tone="raised" className="mb-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-hi">Waiting for your decision</div>
              <p className="mt-0.5 text-sm text-mid">
                Open the TXID on the explorer and confirm it sent at least{" "}
                <strong className="text-hi">{formatMoney(payment.expectedAmount)}</strong> to the
                receiving wallet below, on {payment.cryptoNetwork ?? "the expected network"}.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <ActionForm
                action={rejectPayment}
                hidden={{ paymentId: payment.id }}
                label="Reject Payment"
                variant="ghost"
                size="md"
                reasonRequired
                confirm={<>Nothing is credited. {payment.user.fullName} is notified with your reason and can submit a new payment.</>}
              />
              <ActionForm
                action={approvePayment}
                hidden={{ paymentId: payment.id }}
                label="Approve Payment"
                variant="primary"
                size="md"
                confirm={
                  <>
                    Approve this payment? This will credit{" "}
                    <strong className="text-hi">{formatMoney(payment.expectedAmount)}</strong> to{" "}
                    <strong className="text-hi">{payment.user.fullName}</strong>&apos;s deposit/wallet and
                    create the corresponding ledger entry. Their {payment.plan.name} participation
                    activates and any referral commission is paid. This cannot be undone.
                    {shortfall && (
                      <span className="mt-2 block font-bold text-bad">
                        They reported sending only {formatMoney(payment.userSubmittedAmount!)}. Approve
                        only if the explorer shows the full amount arrived.
                      </span>
                    )}
                  </>
                }
              />
            </span>
          </div>
        </Card>
      )}

      <div className="grid min-w-0 gap-x-10 gap-y-6 lg:grid-cols-2">
        <Section title="Payment">
          <dl className="divide-y divide-line-soft rounded-lg border border-line">
            <Row term="Requested amount" value={formatMoney(payment.expectedAmount)} />
            <Row
              term="Amount submitted"
              value={payment.userSubmittedAmount != null
                ? <span className={shortfall ? "font-bold text-bad" : undefined}>{formatMoney(payment.userSubmittedAmount)}</span>
                : "—"}
            />
            <Row term="Currency" value={payment.cryptoAsset ?? payment.currency} />
            <Row term="Network" value={payment.cryptoNetwork ?? "—"} />
            <Row term="Method" value={methodLabel(payment.method)} />
            <Row
              term="TXID"
              value={txid ? (
                <span className="flex flex-col items-end gap-1">
                  <span className="mono break-all text-micro text-hi">{txid}</span>
                  {explorer && (
                    <a href={explorer} target="_blank" rel="noopener noreferrer" className="text-micro font-bold text-mint hover:underline">
                      Open on explorer ↗
                    </a>
                  )}
                </span>
              ) : <span className="text-faint">Not submitted yet</span>}
            />
            <Row
              term="Receiving wallet"
              value={receivingWallet ? (
                <span className="flex flex-col items-end gap-1">
                  <span className="mono break-all text-micro text-hi">{receivingWallet}</span>
                  {walletChanged && <Badge tone="warn">Published wallet has changed since</Badge>}
                </span>
              ) : "—"}
            />
            <Row term="Opened" value={formatDateTime(payment.createdAt)} />
            <Row term="Submitted" value={payment.lastVerifiedAt ? formatDateTime(payment.lastVerifiedAt) : "—"} />
            <Row term="Status" value={<PaymentStatusBadge payment={payment} />} />
            {payment.deposit.reviewedAt && (
              <Row
                term={payment.deposit.status === "CONFIRMED" ? "Approved" : "Reviewed"}
                value={`${formatDateTime(payment.deposit.reviewedAt)}${reviewer ? ` · ${reviewer.fullName}` : " · system"}`}
              />
            )}
            {payment.failureReason && ["REJECTED", "CANCELLED"].includes(displayStatus(payment)) && (
              <Row term="Reason" value={payment.failureReason} />
            )}
          </dl>
        </Section>

        <div className="min-w-0 space-y-6">
          <Section title="User">
            <dl className="divide-y divide-line-soft rounded-lg border border-line">
              <Row term="Name" value={<Link href={`/admin/users/${payment.userId}`} className="hover:underline">{payment.user.fullName}</Link>} />
              <Row term="Email" value={payment.user.email} />
              <Row term="Phone" value={payment.user.phone ?? "—"} />
              <Row term="Plan" value={payment.plan.name} />
              <Row term="Account status" value={payment.user.status.toLowerCase()} />
            </dl>
          </Section>

          <Section title="History">
            {payment.events.length === 0 ? (
              <p className="text-sm text-faint">No events recorded.</p>
            ) : (
              <ol className="space-y-2">
                {payment.events.map((event) => (
                  <li key={event.id} className="text-sm">
                    <span className="mono text-micro text-faint">{formatDateTime(event.createdAt)}</span>{" "}
                    <span className="text-mid">{event.type}</span>
                    {event.toStatus && <span className="text-faint"> → {event.toStatus.replace(/_/g, " ").toLowerCase()}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3">
      <dt className="shrink-0 text-sm text-mid">{term}</dt>
      <dd className="min-w-0 text-end text-sm text-hi">{value}</dd>
    </div>
  );
}
