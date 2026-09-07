import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Section } from "@/components/primitives/Section";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";
import { StatusBadge, Badge } from "@/components/primitives/Badge";

import { ActionForm } from "@/components/admin/ActionForm";
import { issueBumper } from "@/server/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Bumper prizes" };
export const dynamic = "force-dynamic";

export default async function BumperPage() {
  const [events, awards] = await Promise.all([
    db.bumperEvent.findMany({ orderBy: { threshold: "asc" }, include: { _count: { select: { awards: true } } } }),
    db.bumperAward.findMany({
      include: { user: true, bumperEvent: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Bumper prizes"
        description="Rules (vii) and (viii). Crossing a threshold creates an award for review rather than paying automatically — rule (viii) offers a choice of motorcycle or cash."
      />

      <Section title="Thresholds">
        <TableWrap>
          <Table>
            <THead>
              <TR><TH>Milestone</TH><TH align="right">Referrals</TH><TH>Prize</TH><TH>Winner chooses</TH><TH>Status</TH><TH align="right">Awarded</TH></TR>
            </THead>
            <tbody>
              {events.map((event) => (
                <TR key={event.id}>
                  <TD>{event.name}</TD>
                  <TD numeric>{event.threshold}</TD>
                  <TD>
                    <CellStack
                      primary={<span className="num text-gold">{formatMoney(event.prizeAmount, { compactCents: true })}</span>}
                      secondary={event.itemName ?? "Cash"}
                    />
                  </TD>
                  <TD>{event.winnerChooses ? <Badge tone="info">Yes</Badge> : <span className="text-micro text-faint">No</span>}</TD>
                  <TD><StatusBadge status={event.status} /></TD>
                  <TD numeric className="text-mid">{event._count.awards}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Section title="Awards" description="A threshold can be awarded to a person exactly once.">
        {awards.length === 0 ? (
          <EmptyState
            title="No milestones reached"
            description="Awards are created automatically the moment a referrer's qualifying count crosses a threshold."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR><TH>Participant</TH><TH>Milestone</TH><TH align="right">At count</TH><TH>Reached</TH><TH>Status</TH><TH align="right">Action</TH></TR>
              </THead>
              <tbody>
                {awards.map((award) => (
                  <TR key={award.id}>
                    <TD>
                      <Link href={`/admin/users/${award.userId}`} className="hover:underline">
                        <CellStack primary={award.user.fullName} secondary={award.user.email} />
                      </Link>
                    </TD>
                    <TD className="text-mid">{award.bumperEvent.name}</TD>
                    <TD numeric>{award.qualifyingCount}</TD>
                    <TD className="num text-micro text-mid">{formatDateTime(award.createdAt)}</TD>
                    <TD><StatusBadge status={award.status} /></TD>
                    <TD align="right">
                      {award.status === "PENDING_REVIEW" ? (
                        <ActionForm
                          action={issueBumper}
                          hidden={{ awardId: award.id, takeCash: "on" }}
                          label="Issue as cash"
                          variant="gold"
                          confirm={
                            <>
                              <strong>{award.user.fullName}</strong> will be credited{" "}
                              <strong>{formatMoney(award.bumperEvent.prizeAmount)}</strong> through
                              the ledger and a prize record created.
                              {award.bumperEvent.winnerChooses && (
                                <> Rule (viii) also allows {award.bumperEvent.itemName} instead — confirm
                                their choice before issuing.</>
                              )}
                            </>
                          }
                        />
                      ) : (
                        <span className="text-micro text-faint">
                          {award.approvedAt ? formatDateTime(award.approvedAt) : "—"}
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
