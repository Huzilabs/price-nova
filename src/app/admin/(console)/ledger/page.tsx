import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { db } from "@/lib/db";
import { verifyIntegrity } from "@/server/services/ledger";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { Badge } from "@/components/primitives/Badge";
import { Figure, Delta } from "@/components/primitives/Figure";

import { FilterTabs } from "@/components/admin/FilterTabs";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Ledger" };
export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: type = "ALL", q = "" } = await searchParams;

  const transactions = await db.ledgerTransaction.findMany({
    where: {
      ...(type === "ALL" ? {} : { type: type as never }),
      ...(q ? { OR: [{ description: { contains: q, mode: "insensitive" } }, { idempotencyKey: { contains: q } }] } : {}),
    },
    include: {
      entries: { include: { account: { include: { user: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const [counts, accounts, integrity] = await Promise.all([
    db.ledgerTransaction.groupBy({ by: ["type"], _count: true }),
    db.ledgerAccount.findMany({ where: { userId: null }, orderBy: { kind: "asc" } }),
    verifyIntegrity(),
  ]);
  const countFor = (key: string) => counts.find((c) => c.type === key)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Double entry. Every transaction sums to zero; entries are append-only."
      />

      <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
        {accounts.map((account) => (
          <Figure
            key={account.id}
            label={account.kind.replace(/_/g, " ")}
            size="md"
            tone={account.kind === "PRIZE_POOL" ? "gold" : "default"}
            value={formatMoney(account.balance, { compactCents: true })}
          />
        ))}
      </div>

      <div className="mb-4 flex items-center gap-3 border-s-2 px-3 py-2"
           style={{ borderColor: integrity.ok ? "var(--color-mint)" : "var(--color-bad)", background: "var(--color-surface)" }}>
        <Badge tone={integrity.ok ? "ok" : "bad"}>
          {integrity.ok ? "Balanced" : "Integrity failure"}
        </Badge>
        <span className="text-sm text-mid">
          {integrity.ok
            ? "All transactions sum to zero and every account balance matches its entries."
            : `${integrity.unbalancedTransactions.length} unbalanced, ${integrity.driftedAccounts.length} drifted.`}
        </span>
      </div>

      <FilterTabs
        basePath="/admin/ledger"
        current={type}
        query={q}
        searchPlaceholder="Search description or key"
        tabs={[
          { key: "ALL", label: "All" },
          { key: "DEPOSIT", label: "Deposits", count: countFor("DEPOSIT") },
          { key: "REFERRAL_COMMISSION", label: "Commission", count: countFor("REFERRAL_COMMISSION") },
          { key: "LUCKY_DRAW_REWARD", label: "Draw rewards", count: countFor("LUCKY_DRAW_REWARD") },
          { key: "WITHDRAWAL", label: "Withdrawals", count: countFor("WITHDRAWAL") },
        ]}
      />

      {transactions.length === 0 ? (
        <EmptyState title="No transactions match" description="Every movement of money appears here the moment it is posted." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR><TH>When</TH><TH>Type</TH><TH>Description</TH><TH>Postings</TH><TH align="right">Amount</TH></TR>
            </THead>
            <tbody>
              {transactions.map((tx) => {
                const total = tx.entries
                  .filter((e) => e.direction === "DEBIT")
                  .reduce((sum, e) => sum + e.amount, 0n);
                return (
                  <TR key={tx.id}>
                    <TD className="num text-micro text-mid whitespace-nowrap">{formatDateTime(tx.createdAt)}</TD>
                    <TD><Badge tone={tx.type === "LUCKY_DRAW_REWARD" || tx.type === "BUMPER_PRIZE" ? "gold" : "neutral"}>{tx.type.replace(/_/g, " ")}</Badge></TD>
                    <TD><CellStack primary={tx.description} secondary={<span className="num">{tx.idempotencyKey}</span>} /></TD>
                    <TD>
                      <div className="space-y-0.5">
                        {tx.entries.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-2 text-micro">
                            <span className={entry.direction === "DEBIT" ? "text-mid" : "text-mid"}>
                              {entry.direction === "DEBIT" ? "Dr" : "Cr"}
                            </span>
                            <span className="text-mid">
                              {entry.account.user
                                ? <Link href={`/admin/users/${entry.account.userId}`} className="hover:underline">
                                    {entry.account.user.fullName} · {entry.account.kind.replace("USER_", "")}
                                  </Link>
                                : entry.account.kind.replace(/_/g, " ")}
                            </span>
                            <span className="num ms-auto">{formatMoney(entry.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </TD>
                    <TD numeric><Delta amount={total} /></TD>
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
