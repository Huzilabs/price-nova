import { requireUser } from "@/lib/guards";
import { getMyEntries } from "@/server/queries/entries";
import { AppShell } from "@/components/shell/AppShell";
import { Card, SectionHead, EmptyState } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Ticket } from "@/components/primitives/Ticket";
import { Countdown } from "@/components/primitives/Countdown";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDayMonth } from "@/lib/format";

export const metadata = { title: "My entries" };
export const dynamic = "force-dynamic";

/**
 * My entries.
 *
 * Tickets, not a table. An entry is the thing a participant is emotionally
 * invested in, so it gets the notched-ticket treatment and its serial in mono
 * — and a win is unmistakable rather than a boolean in a column.
 */
export default async function EntriesPage() {
  const session = await requireUser();
  const { entries, activeParticipation, pending } = await getMyEntries(session.id);

  const live = entries.filter((e) => e.category === "ACTIVE" || e.category === "UPCOMING");
  const past = entries.filter((e) => e.category === "COMPLETED");
  const wins = entries.filter((e) => e.won);

  return (
    <AppShell session={session}>
      <div className="tag text-faint">Yours</div>
      <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">My entries</h1>
      <p className="mt-2 text-sm leading-relaxed text-mid">
        {entries.length === 0
          ? "Entry numbers are issued when a draw's entries close."
          : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}${wins.length > 0 ? ` · ${wins.length} winning` : ""}.`}
      </p>

      {/* ---- Wins first. Nothing outranks this. ------------------------- */}
      {wins.length > 0 && (
        <section className="mt-6">
          <SectionHead kicker="Result" title="Your wins" />
          <div className="space-y-3">
            {wins.map((entry) => (
              <Card key={entry.id} tone="gold" className="animate-pop p-5 text-center">
                <div className="text-3xl" aria-hidden="true">🎉</div>
                <h2 className="font-display mt-2 text-h2 font-extrabold tracking-[-0.025em] text-hi">
                  You won
                </h2>
                <div className="prize mt-1 text-prize text-gold">
                  {formatMoney(entry.wonPrize ?? entry.prize ?? 0n, { compactCents: true })}
                </div>
                <p className="mt-2 text-sm text-mid">
                  {entry.drawName} · {formatDayMonth(entry.drawAt)}
                </p>
                <p className="mono mt-1 text-micro text-faint">{entry.entryNumber}</p>
                <Button href={`/draws/${entry.drawId}`} variant="gold" size="lg" className="mt-4">
                  View the draw
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ---- Eligible, number not yet issued ---------------------------- */}
      {pending.length > 0 && (
        <section className="mt-8">
          <SectionHead kicker="Coming" title="Entries being issued" />
          <div className="space-y-3">
            {pending.map((draw) => (
              <Card key={draw.id} tone="raised" className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Badge tone="mint" dot>Eligible</Badge>
                    <div className="mt-2 truncate text-base font-bold text-hi">{draw.name}</div>
                    <div className="mt-0.5 text-sm text-mid">
                      Your number is issued when entries close
                    </div>
                  </div>
                  {draw.prize !== null && (
                    <div className="prize shrink-0 text-h2 text-gold">
                      {formatMoney(draw.prize, { compactCents: true })}
                    </div>
                  )}
                </div>
                <div className="mt-3.5">
                  <div className="tag mb-1.5 text-faint">Entries close in</div>
                  <Countdown target={draw.entryCutoffAt} size="sm" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ---- Active tickets --------------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Active" title="In play" />
        {live.length === 0 ? (
          <EmptyState
            title={activeParticipation ? "No entries in play" : "You're not participating yet"}
            description={
              activeParticipation
                ? "You're eligible for the next draw. Your entry number appears here once entries close."
                : "Make a deposit to activate participation and be entered in every draw that opens."
            }
            action={
              activeParticipation
                ? <Button href="/draws" variant="primary">Browse draws</Button>
                : <Button href="/join" variant="primary">Participate</Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((entry) => (
              <Ticket
                key={entry.id}
                serial={entry.entryNumber}
                drawName={entry.drawName}
                prize={entry.prize !== null ? formatMoney(entry.prize, { compactCents: true }) : "—"}
                status={entry.won ? "won" : "active"}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---- History ---------------------------------------------------- */}
      {past.length > 0 && (
        <section className="mt-8">
          <SectionHead kicker="History" title="Past entries" />
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((entry) => (
              <div key={entry.id}>
                <Ticket
                  serial={entry.entryNumber}
                  drawName={entry.drawName}
                  prize={entry.prize !== null ? formatMoney(entry.prize, { compactCents: true }) : "—"}
                  status={entry.won ? "won" : "closed"}
                />
                <p className="mt-1.5 px-1 text-micro text-faint">
                  Drawn {formatDate(entry.drawAt)}
                  {!entry.won && " · not this time"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
