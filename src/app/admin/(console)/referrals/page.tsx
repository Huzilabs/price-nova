import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Figure } from "@/components/primitives/Figure";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { Badge } from "@/components/primitives/Badge";

import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const [referrals, totals, topReferrers] = await Promise.all([
    db.referral.findMany({
      include: { referrer: true, referred: true, commission: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.commission.aggregate({ _sum: { amount: true }, _count: true }),
    db.user.findMany({
      where: { referralsMade: { some: { qualified: true } } },
      include: { _count: { select: { referralsMade: true } }, commissions: true },
      take: 10,
    }),
  ]);

  const ranked = topReferrers
    .map((user) => ({
      user,
      qualifying: user.commissions.length,
      earned: user.commissions.reduce((t, c) => t + c.amount, 0n),
    }))
    .sort((a, b) => b.qualifying - a.qualifying);

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Rule (vi): commission is paid once per referral, and only while the referrer keeps their own principal deposited."
      />

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-4">
        <Figure label="Referrals recorded" size="lg" value={referrals.length.toLocaleString()} />
        <Figure label="Commission payments" size="lg" value={totals._count.toLocaleString()} />
        <Figure label="Commission paid" size="lg" tone="ok" value={formatMoney(totals._sum.amount ?? 0n, { compactCents: true })} />
        <Figure label="Top referrer" size="md" value={ranked[0]?.user.fullName ?? "—"} note={ranked[0] ? `${ranked[0].qualifying} qualifying` : undefined} />
      </div>

      <div className="mt-7 grid min-w-0 gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-2 border-b border-line pb-2 text-lg font-semibold">Recent referrals</h2>
          {referrals.length === 0 ? (
            <EmptyState title="No referrals yet" description="A referral is recorded when someone signs up with a referral code." />
          ) : (
            <TableWrap>
              <Table>
                <THead><TR><TH>Referrer</TH><TH>Referred</TH><TH>Joined</TH><TH>Qualified</TH><TH align="right">Commission</TH></TR></THead>
                <tbody>
                  {referrals.map((referral) => (
                    <TR key={referral.id}>
                      <TD>
                        <Link href={`/admin/users/${referral.referrerId}`} className="hover:underline">
                          <CellStack primary={referral.referrer.fullName} secondary={referral.referrer.referralCode} />
                        </Link>
                      </TD>
                      <TD>
                        <Link href={`/admin/users/${referral.referredId}`} className="hover:underline">
                          <CellStack primary={referral.referred.fullName} secondary={referral.referred.email} />
                        </Link>
                      </TD>
                      <TD className="num text-micro text-mid">{formatDate(referral.createdAt)}</TD>
                      <TD><Badge tone={referral.qualified ? "ok" : "neutral"}>{referral.qualified ? "Qualified" : "Pending deposit"}</Badge></TD>
                      <TD numeric>{referral.commission ? formatMoney(referral.commission.amount) : <span className="text-faint">—</span>}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="mb-2 border-b border-line pb-2 text-lg font-semibold">Leaderboard</h2>
          {ranked.length === 0 ? (
            <p className="pt-3 text-sm text-mid">No qualifying referrals yet.</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {ranked.map((row, index) => (
                <li key={row.user.id} className="flex items-center gap-3 py-2">
                  <span className="num w-5 text-micro text-faint">{index + 1}</span>
                  <Link href={`/admin/users/${row.user.id}`} className="min-w-0 grow truncate text-sm text-hi hover:underline">
                    {row.user.fullName}
                  </Link>
                  <span className="num text-micro text-mid">{row.qualifying}</span>
                  <span className="num text-sm text-mint">{formatMoney(row.earned, { compactCents: true })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
