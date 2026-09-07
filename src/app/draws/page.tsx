import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { listPublicDraws, categorise } from "@/server/services/draw";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHead, EmptyState } from "@/components/primitives/Card";
import { DrawCard } from "@/components/draw/DrawCard";
import { Button } from "@/components/primitives/Button";

export const metadata = { title: "Draws" };
export const dynamic = "force-dynamic";

/**
 * Every draw, grouped by what a participant can do with it.
 *
 * The three groups are derived from each draw's own status and dates, not
 * from a stored category column that could drift out of step with them.
 */
export default async function DrawsPage() {
  const session = await getSessionUser();
  const { active, upcoming, completed, all } = await listPublicDraws();

  // One query for the viewer's entry counts across every visible draw.
  const entryCounts = session
    ? await db.drawEntry.groupBy({
        by: ["drawId"],
        where: { userId: session.id, drawId: { in: all.map((d) => d.id) } },
        _count: true,
      })
    : [];
  const mine = new Map(entryCounts.map((row) => [row.drawId, row._count]));

  const groups = [
    { key: "active", title: "Live now", kicker: "Open for entries", draws: active },
    { key: "upcoming", title: "Coming up", kicker: "Not open yet", draws: upcoming },
    { key: "completed", title: "Finished", kicker: "Results", draws: completed },
  ] as const;

  return (
    <AppShell session={session}>
      <div className="tag text-faint">Browse</div>
      <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">
        All draws
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-mid">
        {all.length === 0
          ? "Draws will be listed here as soon as they are published."
          : `${all.length} ${all.length === 1 ? "draw" : "draws"} · ${active.length} open for entries right now.`}
      </p>

      {all.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No draws yet"
          description="Nothing has been published. When a draw opens it appears here with its prize and closing date."
          action={<Button href="/" variant="primary">Back to home</Button>}
        />
      ) : (
        groups.map((group) =>
          group.draws.length === 0 ? null : (
            <section key={group.key} className="mt-8">
              <SectionHead kicker={group.kicker} title={`${group.title} (${group.draws.length})`} />
              <div className="grid gap-4 sm:grid-cols-2">
                {group.draws.map((draw) => (
                  <DrawCard
                    key={draw.id}
                    id={draw.id}
                    name={draw.name}
                    imageUrl={draw.imageUrl}
                    prize={draw.prizeTiers[0]?.prizeAmount ?? null}
                    tierCount={draw.prizeTiers.length}
                    entries={draw._count.entries}
                    myEntries={mine.get(draw.id) ?? 0}
                    startsAt={draw.startsAt}
                    entryCutoffAt={draw.entryCutoffAt}
                    drawAt={draw.drawAt}
                    category={categorise(draw)}
                    isMain={draw.isMain === true}
                  />
                ))}
              </div>
            </section>
          ),
        )
      )}
    </AppShell>
  );
}
