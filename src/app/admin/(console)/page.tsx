import { EmptyState } from "@/components/primitives/Card";
import type { LedgerTxType } from "@prisma/client";
import { db } from "@/lib/db";
import { DEPOSITS_NEEDING_REVIEW } from "@/lib/payment-status";
import { verifyIntegrity } from "@/server/services/ledger";
import { getMainDraw } from "@/server/services/draw";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Section } from "@/components/primitives/Section";
import { Figure } from "@/components/primitives/Figure";
import { Badge, StatusBadge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { ActionForm } from "@/components/admin/ActionForm";
import { runPrincipalRelease } from "@/server/actions/admin";

import { formatMoney } from "@/lib/money";
import { formatDate, formatDateShort } from "@/lib/format";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

async function sumOf(type: LedgerTxType): Promise<bigint> {
  const result = await db.ledgerEntry.aggregate({
    where: { direction: "CREDIT", account: { kind: "USER_AVAILABLE" }, transaction: { type } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0n;
}

/** Matured principals not yet moved to AVAILABLE, and the next one coming up. */
async function principalRelease() {
  const now = new Date();
  const matured = await db.participation.findMany({
    where: { status: "ACTIVE", principalUnlocksAt: { lte: now } },
    select: { id: true },
  });
  const released = await db.ledgerTransaction.count({
    where: { idempotencyKey: { in: matured.map((p) => `participation:${p.id}:unlock`) } },
  });
  const next = await db.participation.findFirst({
    where: { status: "ACTIVE", principalUnlocksAt: { gt: now } },
    orderBy: { principalUnlocksAt: "asc" },
    select: { principalUnlocksAt: true },
  });
  return { due: matured.length - released, next: next?.principalUnlocksAt ?? null };
}

export default async function AdminOverview() {
  const [
    users, activeParticipants, pendingDeposits, pendingWithdrawals,
    depositsTotal, withdrawalsPaid, commissionTotal, drawTotal, bumperTotal,
    integrity, draw, recentDeposits, recentWithdrawals,
  ] = await Promise.all([
    db.user.count(),
    db.participation.count({ where: { status: "ACTIVE" } }),
    db.deposit.count({ where: DEPOSITS_NEEDING_REVIEW }),
    db.withdrawal.count({ where: { status: { in: ["REQUESTED", "PENDING_REVIEW", "APPROVED", "PROCESSING"] } } }),
    db.deposit.aggregate({ where: { status: "CONFIRMED" }, _sum: { amount: true } }),
    db.withdrawal.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    sumOf("REFERRAL_COMMISSION"),
    sumOf("LUCKY_DRAW_REWARD"),
    sumOf("BUMPER_PRIZE"),
    verifyIntegrity(),
    getMainDraw(),
    db.deposit.findMany({
      where: { status: "PENDING" }, take: 5, orderBy: { createdAt: "desc" },
      include: { user: true, plan: true },
    }),
    db.withdrawal.findMany({
      where: { status: { in: ["REQUESTED", "PENDING_REVIEW", "APPROVED", "PROCESSING"] } },
      take: 5, orderBy: { createdAt: "asc" }, include: { user: true },
    }),
  ]);

  const rewardsDistributed = drawTotal + bumperTotal;
  const release = await principalRelease();

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${users.toLocaleString()} users · ${activeParticipants.toLocaleString()} active participations`}
      />

      {/* Integrity is the first thing an operator should see. If the books do
          not balance, nothing else on this page can be trusted. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 border-s-2 border-line bg-surface px-3 py-2"
           style={integrity.ok ? undefined : { borderColor: "var(--color-bad)" }}>
        {integrity.ok ? (
          <>
            <Badge tone="ok">Ledger balanced</Badge>
            <span className="text-sm text-mid">
              Every transaction sums to zero and every account balance matches its entries.
            </span>
          </>
        ) : (
          <>
            <Badge tone="bad">Ledger integrity failure</Badge>
            <span className="text-sm text-bad">
              {integrity.unbalancedTransactions.length} unbalanced transaction(s),{" "}
              {integrity.driftedAccounts.length} drifted account(s). Investigate before processing payouts.
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3 xl:grid-cols-5">
        <Figure label="Deposits confirmed" size="lg" value={formatMoney(depositsTotal._sum.amount ?? 0n, { compactCents: true })} />
        <Figure label="Withdrawals paid" size="lg" tone="muted" value={formatMoney(withdrawalsPaid._sum.amount ?? 0n, { compactCents: true })} />
        <Figure label="Commission paid" size="lg" tone="ok" value={formatMoney(commissionTotal, { compactCents: true })} />
        <Figure label="Rewards distributed" size="lg" tone="gold" value={formatMoney(rewardsDistributed, { compactCents: true })} />
        <Figure
          label="Net held"
          size="lg"
          value={formatMoney((depositsTotal._sum.amount ?? 0n) - (withdrawalsPaid._sum.amount ?? 0n), { compactCents: true })}
          note="Deposits less payouts"
        />
      </div>

      <div className="mt-7 grid min-w-0 gap-x-10 gap-y-6 lg:grid-cols-2">
        <Section
          title="Deposits awaiting review"
          description={pendingDeposits > 0 ? `${pendingDeposits} pending` : undefined}
          action={<Button size="sm" variant="ghost" href="/admin/deposits">Open queue</Button>}
        >
          {recentDeposits.length === 0 ? (
            <EmptyState title="Nothing waiting" description="Confirmed and rejected deposits stay in the full queue." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR><TH>User</TH><TH>Method</TH><TH>Requested</TH><TH align="right">Amount</TH></TR>
                </THead>
                <tbody>
                  {recentDeposits.map((deposit) => (
                    <TR key={deposit.id}>
                      <TD><CellStack primary={deposit.user.fullName} secondary={deposit.user.email} /></TD>
                      <TD className="text-mid">{deposit.method.replace(/_/g, " ")}</TD>
                      <TD className="num text-micro text-mid">{formatDateShort(deposit.createdAt)}</TD>
                      <TD numeric>{formatMoney(deposit.amount)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Section>

        <Section
          title="Withdrawal queue"
          description={pendingWithdrawals > 0 ? `${pendingWithdrawals} open` : undefined}
          action={<Button size="sm" variant="ghost" href="/admin/withdrawals">Open queue</Button>}
        >
          {recentWithdrawals.length === 0 ? (
            <EmptyState title="Queue is clear" description="Requests appear here the moment a participant submits one." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR><TH>User</TH><TH>Source</TH><TH>Status</TH><TH align="right">Amount</TH></TR>
                </THead>
                <tbody>
                  {recentWithdrawals.map((withdrawal) => (
                    <TR key={withdrawal.id}>
                      <TD><CellStack primary={withdrawal.user.fullName} secondary={withdrawal.destination.slice(0, 18) + "…"} /></TD>
                      <TD className="text-mid">{withdrawal.sourceKind}</TD>
                      <TD><StatusBadge status={withdrawal.status} /></TD>
                      <TD numeric>{formatMoney(withdrawal.amount)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Section>
      </div>

      <Section
        title="Principal release"
        description="Runs automatically every day at 01:00 UTC. Use the button to run it now."
        className="mt-2"
      >
        <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
          <Figure label="Due now" size="md" value={release.due.toLocaleString()} />
          <Figure label="Next unlock" size="sm" value={release.next ? formatDate(release.next) : "—"} />
          <ActionForm
            action={runPrincipalRelease}
            hidden={{}}
            label="Release matured principal"
            variant="solid"
            size="md"
            confirm="Every deposit whose lock period has ended moves from Locked to Available, and each participant is notified. Deposits already released are skipped."
          />
        </div>
      </Section>

      <Section title="Main draw" className="mt-2">
        {!draw ? (
          <EmptyState
            title="No main draw selected"
            description="The homepage shows an empty state until a draw is designated as the main draw."
            action={<Button variant="primary" href="/admin/draws">Manage draws</Button>}
          />
        ) : (
          <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
            <Figure label="Draw" size="md" value={draw.name} />
            <Figure label="Status" size="sm" value={<StatusBadge status={draw.status} />} />
            <Figure label="Entries" size="md" value={draw._count.entries.toLocaleString()} />
            <Figure
              label="Prize pool"
              size="md"
              tone="gold"
              value={formatMoney(
                draw.prizeTiers.reduce((total, tier) => total + tier.prizeAmount * BigInt(tier.winnerCount), 0n),
                { compactCents: true },
              )}
              note={draw.prizeTiers.map((t) => `${t.winnerCount} × ${formatMoney(t.prizeAmount, { compactCents: true })}`).join(" · ")}
            />
            <Figure label="Entries close" size="sm" value={formatDate(draw.entryCutoffAt)} />
            <Figure label="Draw date" size="sm" value={formatDate(draw.drawAt)} />
            <Button variant="solid" href={`/admin/draws/${draw.id}`}>Manage</Button>
          </div>
        )}
      </Section>
    </>
  );
}
