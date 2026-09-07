import { EmptyState } from "@/components/primitives/Card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Section } from "@/components/primitives/Section";
import { Figure } from "@/components/primitives/Figure";
import { StatusBadge, Badge } from "@/components/primitives/Badge";
import { Table, TableWrap, THead, TH, TR, TD, CellStack } from "@/components/primitives/Table";

import { ActionForm } from "@/components/admin/ActionForm";
import { WinnerSelector } from "@/components/admin/WinnerSelector";
import { EditDrawButton } from "@/components/admin/EditDrawButton";
import { MainDrawToggle } from "@/components/admin/MainDrawToggle";
import { moveDraw } from "@/server/actions/admin";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const NEXT: Record<string, string | null> = {
  DRAFT: "OPEN",
  OPEN: "ENTRY_CLOSED",
  ENTRY_CLOSED: "READY_FOR_DRAW",
  READY_FOR_DRAW: null,
  WINNER_SELECTED: "PRIZE_ISSUED",
  PRIZE_ISSUED: "COMPLETED",
  COMPLETED: null,
  CANCELLED: null,
};

export default async function DrawDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const draw = await db.draw.findUnique({
    where: { id },
    include: {
      prizeTiers: { orderBy: { sortOrder: "asc" }, include: { winners: { include: { user: true } } } },
      winners: { include: { user: true, prizeTier: true } },
      _count: { select: { entries: true } },
    },
  });
  if (!draw) notFound();

  const [entries, auditTrail] = await Promise.all([
    db.drawEntry.findMany({
      where: { drawId: draw.id },
      include: { user: true },
      orderBy: { entryNumber: "asc" },
      take: 500,
    }),
    db.auditLog.findMany({
      where: { entityType: "Draw", entityId: draw.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pool = draw.prizeTiers.reduce((t, tier) => t + tier.prizeAmount * BigInt(tier.winnerCount), 0n);
  const next = NEXT[draw.status];
  const wonUserIds = new Set(draw.winners.map((w) => w.userId));

  return (
    <>
      <PageHeader
        title={draw.name}
        description={
          <>
            Entries close {formatDate(draw.entryCutoffAt)} · draw {formatDate(draw.drawAt)} ·{" "}
            selection mode <span className="num">{draw.selectionMode}</span>
          </>
        }
        action={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={draw.status} />
            <MainDrawToggle
              drawId={draw.id}
              drawName={draw.name}
              isMain={draw.isMain === true}
              isDraft={draw.status === "DRAFT"}
            />
            <EditDrawButton
              draw={{
                id: draw.id,
                name: draw.name,
                description: draw.description ?? "",
                imageUrl: draw.imageUrl ?? "",
                entryRequirement: draw.entryRequirement ?? "",
                startsAt: draw.startsAt.toISOString().slice(0, 16),
                entryCutoffAt: draw.entryCutoffAt.toISOString().slice(0, 16),
                drawAt: draw.drawAt.toISOString().slice(0, 16),
                selectionMode: draw.selectionMode,
                tiers: draw.prizeTiers.map((t) => ({
                  name: t.name,
                  winnerCount: t.winnerCount,
                  prize: (Number(t.prizeAmount) / 100).toFixed(2),
                })),
                tiersLocked: draw.winners.length > 0,
              }}
            />
            {next && (
              <ActionForm
                action={moveDraw}
                hidden={{ drawId: draw.id, to: next }}
                label={
                  next === "OPEN" ? "Open entries"
                  : next === "ENTRY_CLOSED" ? "Close entries"
                  : next === "READY_FOR_DRAW" ? "Ready for draw"
                  : next === "PRIZE_ISSUED" ? "Mark prizes issued"
                  : "Complete"
                }
                variant="primary"
                size="md"
                confirm={
                  next === "ENTRY_CLOSED" ? (
                    <>
                      This freezes the eligible participants into a permanent entry list.
                      Anyone who activates after this point rolls into next month&rsquo;s draw
                      (rule xi). The snapshot is what makes this draw auditable later.
                    </>
                  ) : (
                    <>The draw moves to {next.replace(/_/g, " ").toLowerCase()}.</>
                  )
                }
              />
            )}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-4">
        <Figure label="Eligible entries" size="lg" value={draw._count.entries.toLocaleString()} />
        <Figure label="Prize pool" size="lg" tone="gold" value={formatMoney(pool, { compactCents: true })} />
        <Figure label="Winners drawn" size="lg" value={`${draw.winners.length}`} />
        <Figure label="Tiers" size="lg" value={`${draw.prizeTiers.length}`} />
      </div>

      <Section title="Prize tiers" className="mt-7">
        <TableWrap>
          <Table>
            <THead>
              <TR><TH>Tier</TH><TH align="right">Winners</TH><TH align="right">Each</TH><TH align="right">Drawn</TH><TH align="right">Select</TH></TR>
            </THead>
            <tbody>
              {draw.prizeTiers.map((tier) => (
                <TR key={tier.id}>
                  <TD>{tier.name}</TD>
                  <TD numeric>{tier.winnerCount}</TD>
                  <TD numeric className="text-gold">{formatMoney(tier.prizeAmount, { compactCents: true })}</TD>
                  <TD numeric className="text-mid">{tier.winners.length}</TD>
                  <TD align="right">
                    {draw.status === "READY_FOR_DRAW" || draw.status === "WINNER_SELECTED" ? (
                      tier.winners.length >= tier.winnerCount ? (
                        <Badge tone="ok">Complete</Badge>
                      ) : (
                        <WinnerSelector
                          drawId={draw.id}
                          tierId={tier.id}
                          tierName={tier.name}
                          prize={formatMoney(tier.prizeAmount)}
                          mode={draw.selectionMode}
                          candidates={entries
                            .filter((e) => !wonUserIds.has(e.userId))
                            .map((e) => ({ userId: e.userId, name: e.user.fullName, entryNumber: e.entryNumber }))}
                        />
                      )
                    ) : (
                      <span className="text-micro text-faint">
                        {draw.status === "COMPLETED" ? "Closed" : "Move to Ready for draw"}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      {draw.winners.length > 0 && (
        <Section title="Winners">
          <TableWrap>
            <Table>
              <THead><TR><TH>Winner</TH><TH>Tier</TH><TH>Selected</TH><TH align="right">Prize</TH></TR></THead>
              <tbody>
                {draw.winners.map((winner) => (
                  <TR key={winner.id}>
                    <TD>
                      <Link href={`/admin/users/${winner.userId}`} className="hover:underline">
                        <CellStack primary={winner.user.fullName} secondary={winner.user.email} />
                      </Link>
                    </TD>
                    <TD className="text-mid">{winner.prizeTier.name}</TD>
                    <TD className="num text-micro text-mid">{formatDateTime(winner.selectedAt)}</TD>
                    <TD numeric className="text-gold">{formatMoney(winner.prizeTier.prizeAmount)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Section>
      )}

      <div className="grid min-w-0 gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="Entry list" description="Frozen at the cutoff — this is the audit record.">
          {entries.length === 0 ? (
            <EmptyState
              title="No entries yet"
              description="Entries are generated when you close entries for this draw. Until then the list is live and can change."
            />
          ) : (
            <TableWrap>
              <Table>
                <THead><TR><TH>Entry</TH><TH>Participant</TH><TH>Eligibility</TH></TR></THead>
                <tbody>
                  {entries.slice(0, 100).map((entry) => (
                    <TR key={entry.id}>
                      <TD className="num text-micro">{entry.entryNumber}</TD>
                      <TD>
                        <Link href={`/admin/users/${entry.userId}`} className="hover:underline">
                          <CellStack primary={entry.user.fullName} secondary={entry.user.email} />
                        </Link>
                      </TD>
                      <TD className="text-micro text-mid">{entry.eligibilityNote}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Section>

        <Section title="Audit trail" description="Section 8: every selection is attributable.">
          {auditTrail.length === 0 ? (
            <p className="text-sm text-mid">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {auditTrail.map((log) => (
                <li key={log.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-hi">{log.action}</span>
                    <span className="num text-micro text-mid">{formatDateTime(log.createdAt)}</span>
                  </div>
                  {log.actorRole && <div className="text-micro text-mid">by {log.actorRole}{log.ipAddress ? ` · ${log.ipAddress}` : ""}</div>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
