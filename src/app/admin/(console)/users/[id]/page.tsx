import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { commissionEligibility } from "@/server/services/eligibility";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Section } from "@/components/primitives/Section";
import { Figure, Delta } from "@/components/primitives/Figure";
import { StatusBadge, Badge } from "@/components/primitives/Badge";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";

import { ActionForm } from "@/components/admin/ActionForm";
import { AdjustBalanceForm } from "@/components/admin/AdjustBalanceForm";
import { setUserStatus } from "@/server/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      wallet: true,
      roles: { include: { role: true } },
      referredBy: true,
      participations: { include: { plan: true }, orderBy: { createdAt: "desc" } },
      deposits: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 10 },
      withdrawals: { orderBy: { createdAt: "desc" }, take: 10 },
      referralsMade: { include: { referred: true }, orderBy: { createdAt: "desc" } },
      commissions: true,
      prizes: { orderBy: { createdAt: "desc" } },
      drawWins: { include: { draw: true, prizeTier: true } },
      ledgerAccounts: true,
    },
  });
  if (!user) notFound();

  const [eligibility, entries, auditTrail] = await Promise.all([
    commissionEligibility(user.id),
    db.ledgerEntry.findMany({
      where: { account: { userId: user.id } },
      include: { transaction: true, account: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.auditLog.findMany({
      where: { entityType: "User", entityId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const commissionTotal = user.commissions.reduce((t, c) => t + c.amount, 0n);
  const qualifying = user.referralsMade.filter((r) => r.qualified).length;

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={
          <>
            {user.email} · <span className="num">{user.referralCode}</span> · joined {formatDate(user.createdAt)}
            {user.referredBy && <> · referred by <Link className="underline" href={`/admin/users/${user.referredBy.id}`}>{user.referredBy.fullName}</Link></>}
          </>
        }
        action={
          <span className="flex items-center gap-2">
            <StatusBadge status={user.status} />
            {user.status === "ACTIVE" ? (
              <ActionForm
                action={setUserStatus}
                hidden={{ userId: user.id, status: "SUSPENDED" }}
                label="Suspend"
                variant="danger"
                reasonRequired
                confirm={
                  <>
                    {user.fullName} will be signed out on their next request and blocked from
                    depositing, withdrawing or entering draws. Existing balances are untouched.
                  </>
                }
              />
            ) : (
              <ActionForm
                action={setUserStatus}
                hidden={{ userId: user.id, status: "ACTIVE" }}
                label="Reactivate"
                variant="primary"
                reasonRequired
                confirm={<>{user.fullName} regains access immediately.</>}
              />
            )}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
        <Figure label="Available" size="lg" value={formatMoney(user.wallet?.available ?? 0n)} />
        <Figure label="Locked" size="lg" tone="muted" value={formatMoney(user.wallet?.locked ?? 0n)} />
        <Figure label="Pending" size="lg" tone="muted" value={formatMoney(user.wallet?.pending ?? 0n)} />
        <Figure label="Lifetime earned" size="lg" tone="ok" value={formatMoney(user.wallet?.lifetimeEarned ?? 0n)} />
        <Figure label="Lifetime withdrawn" size="lg" tone="muted" value={formatMoney(user.wallet?.lifetimeWithdrawn ?? 0n)} />
        <Figure
          label="Commission earned"
          size="lg"
          value={formatMoney(commissionTotal)}
          note={`${qualifying} qualifying of ${user.referralsMade.length}`}
        />
      </div>

      <div className="mt-7 grid min-w-0 gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Section title="Ledger" description="Every movement, newest first. Append-only.">
            {entries.length === 0 ? (
              <EmptyState title="No ledger activity" description="Entries appear as soon as this account's first deposit is confirmed." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <TR><TH>When</TH><TH>Type</TH><TH>Bucket</TH><TH align="right">Amount</TH><TH align="right">Balance after</TH></TR>
                  </THead>
                  <tbody>
                    {entries.map((entry) => {
                      const signed = entry.direction === "CREDIT" ? entry.amount : -entry.amount;
                      return (
                        <TR key={entry.id}>
                          <TD className="num text-micro text-mid whitespace-nowrap">{formatDateTime(entry.createdAt)}</TD>
                          <TD><CellStack primary={entry.transaction.type.replace(/_/g, " ")} secondary={entry.transaction.description} /></TD>
                          <TD className="text-micro text-mid">{entry.account.kind.replace("USER_", "")}</TD>
                          <TD numeric><Delta amount={signed} /></TD>
                          <TD numeric className="text-mid">{formatMoney(entry.balanceAfter)}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Section>

          <Section title="Deposits">
            {user.deposits.length === 0 ? (
              <EmptyState title="No deposits" description="This account has not submitted a deposit yet." />
            ) : (
              <TableWrap>
                <Table>
                  <THead><TR><TH>Date</TH><TH>Plan</TH><TH>Method</TH><TH>Status</TH><TH align="right">Amount</TH></TR></THead>
                  <tbody>
                    {user.deposits.map((d) => (
                      <TR key={d.id}>
                        <TD className="num text-micro text-mid">{formatDate(d.createdAt)}</TD>
                        <TD className="text-mid">{d.plan.name}</TD>
                        <TD className="text-mid">{d.method.replace(/_/g, " ")}</TD>
                        <TD><StatusBadge status={d.status} /></TD>
                        <TD numeric>{formatMoney(d.amount)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Section>

          <Section title="Withdrawals">
            {user.withdrawals.length === 0 ? (
              <EmptyState title="No withdrawals" description="Requests will appear here with their reserved amount." />
            ) : (
              <TableWrap>
                <Table>
                  <THead><TR><TH>Date</TH><TH>Source</TH><TH>Status</TH><TH align="right">Amount</TH></TR></THead>
                  <tbody>
                    {user.withdrawals.map((w) => (
                      <TR key={w.id}>
                        <TD className="num text-micro text-mid">{formatDate(w.createdAt)}</TD>
                        <TD className="text-mid">{w.sourceKind}</TD>
                        <TD><StatusBadge status={w.status} /></TD>
                        <TD numeric>{formatMoney(w.amount)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Section>
        </div>

        <aside className="min-w-0">
          <Section title="Participation" headingLevel="h3">
            {user.participations.length === 0 ? (
              <p className="text-sm text-mid">No participation on record.</p>
            ) : (
              <dl className="divide-y divide-line-soft">
                {user.participations.map((p) => (
                  <div key={p.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-hi">{p.plan.name}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-1 text-micro text-mid">
                      {p.activatedAt ? `Activated ${formatDate(p.activatedAt)}` : "Not activated"}
                      {p.principalUnlocksAt && ` · unlocks ${formatDate(p.principalUnlocksAt)}`}
                    </div>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <Section title="Commission eligibility" headingLevel="h3">
            <Badge tone={eligibility.eligible ? "ok" : "neutral"}>
              {eligibility.eligible ? "Eligible" : "Not eligible"}
            </Badge>
            <ul className="mt-2 space-y-1">
              {eligibility.reasons.map((reason) => (
                <li key={reason} className="text-micro leading-relaxed text-mid">— {reason}</li>
              ))}
            </ul>
          </Section>

          <Section title="Referrals" headingLevel="h3">
            {user.referralsMade.length === 0 ? (
              <p className="text-sm text-mid">No referrals.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {user.referralsMade.slice(0, 12).map((referral) => (
                  <li key={referral.id} className="flex items-center justify-between gap-3 py-1.5">
                    <Link href={`/admin/users/${referral.referredId}`} className="truncate text-sm text-hi hover:underline">
                      {referral.referred.fullName}
                    </Link>
                    <Badge tone={referral.qualified ? "ok" : "neutral"}>
                      {referral.qualified ? "Qualified" : "Pending"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Prizes" headingLevel="h3">
            {user.prizes.length === 0 ? (
              <p className="text-sm text-mid">No prizes.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {user.prizes.map((prize) => (
                  <li key={prize.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate text-sm text-hi">{prize.itemName ?? prize.sourceType}</span>
                    <span className="num text-sm text-gold">{formatMoney(prize.amount, { compactCents: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Manual adjustment" headingLevel="h3">
            <AdjustBalanceForm userId={user.id} userName={user.fullName} />
          </Section>

          <Section title="Audit history" headingLevel="h3">
            {auditTrail.length === 0 ? (
              <p className="text-sm text-mid">Nothing recorded against this account.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {auditTrail.map((log) => (
                  <li key={log.id} className="py-1.5">
                    <div className="text-sm text-hi">{log.action}</div>
                    <div className="num text-micro text-mid">{formatDateTime(log.createdAt)}</div>
                    {log.reason && <div className="text-micro text-mid">“{log.reason}”</div>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
