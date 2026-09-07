import "server-only";
import { db } from "@/lib/db";
import { categorise } from "@/server/services/draw";

/**
 * A participant's entries.
 *
 * An entry only exists once a draw's entry list has been frozen at its cutoff,
 * so "no entries yet" is a real and common state rather than an error — the
 * page says so instead of inventing a ticket.
 */
export async function getMyEntries(userId: string) {
  const [entries, wins, activeParticipation, openDraws] = await Promise.all([
    db.drawEntry.findMany({
      where: { userId },
      include: { draw: { include: { prizeTiers: { orderBy: { sortOrder: "asc" } } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.drawWinner.findMany({
      where: { userId }, include: { prizeTier: true, draw: true },
    }),
    db.participation.findFirst({
      where: { userId, status: "ACTIVE" }, include: { plan: true },
    }),
    // Draws the user is eligible for but which have not issued entries yet.
    db.draw.findMany({
      where: { status: { in: ["OPEN"] } },
      include: { prizeTiers: { orderBy: { sortOrder: "asc" } } },
      orderBy: { drawAt: "asc" },
    }),
  ]);

  const wonDrawIds = new Set(wins.map((w) => w.drawId));
  const enteredDrawIds = new Set(entries.map((e) => e.drawId));

  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      entryNumber: entry.entryNumber,
      createdAt: entry.createdAt,
      drawId: entry.drawId,
      drawName: entry.draw.name,
      drawAt: entry.draw.drawAt,
      prize: entry.draw.prizeTiers[0]?.prizeAmount ?? null,
      category: categorise(entry.draw),
      won: wonDrawIds.has(entry.drawId),
      wonPrize: wins.find((w) => w.drawId === entry.drawId)?.prizeTier.prizeAmount ?? null,
    })),
    wins,
    activeParticipation,
    /** Eligible, entry number not yet issued. */
    pending: activeParticipation
      ? openDraws
          .filter((draw) => !enteredDrawIds.has(draw.id))
          .map((draw) => ({
            id: draw.id,
            name: draw.name,
            drawAt: draw.drawAt,
            entryCutoffAt: draw.entryCutoffAt,
            prize: draw.prizeTiers[0]?.prizeAmount ?? null,
          }))
      : [],
  };
}
