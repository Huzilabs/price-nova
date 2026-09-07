import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getDraw, categorise, myEntries } from "@/server/services/draw";
import { AppShell } from "@/components/shell/AppShell";
import { Card, SectionHead } from "@/components/primitives/Card";
import { Badge, StatusBadge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Countdown } from "@/components/primitives/Countdown";
import { DrawImage } from "@/components/draw/DrawImage";
import { Ticket } from "@/components/primitives/Ticket";
import { WinnerCard, publicName } from "@/components/reward/WinnerCard";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDayMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draw = await db.draw.findUnique({ where: { id }, select: { name: true } });
  return { title: draw?.name ?? "Draw" };
}

/**
 * One draw, in whatever state it is actually in.
 *
 * The page reshapes itself around `status` and the clock rather than showing
 * every section always: an upcoming draw counts down to opening, a live one
 * counts down to close and offers participation, a finished one leads with the
 * winners. Nothing is hidden by CSS — the sections genuinely differ.
 */
export default async function DrawDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();
  const draw = await getDraw(id);

  if (!draw || draw.status === "DRAFT") notFound();

  const [entries, participation, myTickets] = await Promise.all([
    myEntries(draw.id, session?.id ?? null),
    session
      ? db.participation.findFirst({ where: { userId: session.id, status: "ACTIVE" } })
      : null,
    session
      ? db.drawEntry.findMany({ where: { drawId: draw.id, userId: session.id } })
      : [],
  ]);

  const category = categorise(draw);
  const topTier = draw.prizeTiers[0] ?? null;
  const pool = draw.prizeTiers.reduce(
    (total, tier) => total + tier.prizeAmount * BigInt(tier.winnerCount), 0n,
  );
  const entriesClosed = category !== "UPCOMING" && draw.entryCutoffAt <= new Date();
  const hasWinners = draw.winners.length > 0;

  return (
    <AppShell session={session}>
      <Button href="/draws" variant="ghost" size="sm" className="mb-3">← All draws</Button>

      <Card className="overflow-hidden p-0">
        <DrawImage src={draw.imageUrl} name={draw.name} prize={topTier?.prizeAmount ?? null} className="h-48 sm:h-64" />

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {draw.isMain === true && <Badge tone="gold" dot>Main draw</Badge>}
            <StatusBadge status={draw.status} />
            <Badge tone="neutral">{draw._count.entries.toLocaleString()} entries</Badge>
          </div>

          <h1 className="font-display mt-3 text-h1 font-extrabold leading-tight tracking-[-0.03em] text-hi">
            {draw.name}
          </h1>

          {draw.description && (
            <p className="mt-2.5 text-base leading-relaxed text-mid">{draw.description}</p>
          )}

          {topTier && (
            <div className="mt-5">
              <div className="tag text-gold">Top prize</div>
              <div className="prize mt-1 text-prize text-gold">
                {formatMoney(topTier.prizeAmount, { compactCents: true })}
              </div>
            </div>
          )}

          {/* ---- State-specific block ---------------------------------- */}
          <div className="mt-6">
            {category === "UPCOMING" ? (
              <>
                <div className="tag mb-2 text-mid">Participation opens in</div>
                <Countdown target={draw.startsAt} size="lg" />
                <p className="mt-3 text-sm text-mid">
                  Opens {formatDate(draw.startsAt)}. You cannot enter yet.
                </p>
              </>
            ) : hasWinners ? (
              <Card tone="gold" className="p-4">
                <div className="tag text-gold">Result</div>
                <p className="mt-1.5 text-base font-bold text-hi">
                  {draw.winners.length} {draw.winners.length === 1 ? "winner" : "winners"} drawn
                  on {formatDayMonth(draw.drawAt)}
                </p>
              </Card>
            ) : entriesClosed ? (
              <>
                <Badge tone="warn" dot>Entries closed</Badge>
                <div className="tag mt-4 mb-2 text-mid">Winner announced in</div>
                <Countdown target={draw.drawAt} size="lg" />
              </>
            ) : (
              <>
                <div className="tag mb-2 text-mid">Entries close in</div>
                <Countdown target={draw.entryCutoffAt} size="lg" />
                <p className="mt-3 text-sm text-mid">
                  Closes {formatDate(draw.entryCutoffAt)} · drawn {formatDate(draw.drawAt)}
                </p>
              </>
            )}
          </div>

          {/* ---- What the viewer can do -------------------------------- */}
          <div className="mt-6">
            {!session ? (
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button href={`/signup`} variant="primary" size="xl" shine fullWidth>
                  Join to enter
                </Button>
                <Button href="/login" variant="outline" size="xl" fullWidth>Sign in</Button>
              </div>
            ) : entries > 0 ? (
              <Card tone="mint" className="p-4">
                <div className="flex items-center gap-2">
                  <Badge tone="mint" dot>You are entered</Badge>
                </div>
                <p className="mt-2 text-sm text-mid">
                  You hold {entries} {entries === 1 ? "entry" : "entries"} in this draw.
                </p>
              </Card>
            ) : category === "COMPLETED" ? (
              <p className="text-sm text-mid">This draw has finished.</p>
            ) : participation ? (
              <Card tone="mint" className="p-4">
                <Badge tone="mint" dot>Participation active</Badge>
                <p className="mt-2 text-sm leading-relaxed text-mid">
                  You are eligible. Your entry number is issued when entries close
                  on {formatDayMonth(draw.entryCutoffAt)}.
                </p>
              </Card>
            ) : entriesClosed ? (
              <p className="text-sm text-mid">
                Entries have closed for this draw. Participate now and you are entered in the next one.
              </p>
            ) : (
              <Button href={`/join?draw=${draw.id}`} variant="primary" size="xl" shine fullWidth>
                Participate in this draw
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ---- Prizes ---------------------------------------------------- */}
      {draw.prizeTiers.length > 0 && (
        <section className="mt-8">
          <SectionHead
            kicker="Prizes"
            title={`${formatMoney(pool, { compactCents: true })} total`}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {draw.prizeTiers.map((tier) => (
              <Card key={tier.id} tone="raised" className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-hi">{tier.name}</div>
                  <div className="mt-0.5 text-micro text-faint">
                    {tier.winnerCount.toLocaleString()} {tier.winnerCount === 1 ? "winner" : "winners"}
                  </div>
                </div>
                <div className="prize shrink-0 text-h2 text-gold">
                  {formatMoney(tier.prizeAmount, { compactCents: true })}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ---- Winners --------------------------------------------------- */}
      {hasWinners && (
        <section className="mt-8">
          <SectionHead kicker="Result" title="Winners" />
          <div className="grid gap-3 sm:grid-cols-2">
            {draw.winners.map((winner) => (
              <WinnerCard
                key={winner.id}
                name={publicName(winner.user.fullName)}
                prize={formatMoney(winner.prizeTier.prizeAmount, { compactCents: true })}
                drawName={winner.prizeTier.name}
                date={formatDayMonth(winner.selectedAt)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- The viewer's tickets -------------------------------------- */}
      {myTickets.length > 0 && (
        <section className="mt-8">
          <SectionHead kicker="Yours" title="Your entries" />
          <div className="grid gap-3 sm:grid-cols-2">
            {myTickets.map((ticket) => (
              <Ticket
                key={ticket.id}
                serial={ticket.entryNumber}
                drawName={draw.name}
                prize={topTier ? formatMoney(topTier.prizeAmount, { compactCents: true }) : "—"}
                status={draw.winners.some((w) => w.userId === ticket.userId) ? "won" : category === "COMPLETED" ? "closed" : "active"}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Rules ----------------------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Transparency" title="How this draw works" />
        <Card className="divide-y divide-line-soft">
          {[
            ["Opens", formatDate(draw.startsAt)],
            ["Entries close", formatDate(draw.entryCutoffAt)],
            ["Drawn", formatDate(draw.drawAt)],
            ["Who can enter", draw.entryRequirement ?? "Anyone with an active participation before entries close."],
            ["Winner selection", draw.selectionMode === "RANDOM"
              ? "Chosen at random from the frozen entry list using a cryptographic random source."
              : "Chosen by an administrator from the frozen entry list. Every selection is written to an audit log with the entry number and the administrator responsible, before any prize is credited."],
            ["How prizes are paid", "Credited to your wallet through the ledger. Prize withdrawals open on the 1st and 2nd of each month."],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
              <div className="shrink-0 text-sm font-bold text-hi sm:w-40">{label}</div>
              <div className="text-sm leading-relaxed text-mid">{value}</div>
            </div>
          ))}
        </Card>
      </section>
    </AppShell>
  );
}
