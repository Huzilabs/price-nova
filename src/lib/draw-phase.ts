import type { DrawStatus } from "@prisma/client";

/**
 * Whether a draw has stopped taking entries.
 *
 * Either the cutoff time has passed, or an admin has moved the draw past OPEN
 * ("Close entries"). The status wins over the clock: once an admin closes a
 * draw, no page may keep counting down to a cutoff that no longer applies.
 */
export function entriesClosed(
  draw: { status: DrawStatus; entryCutoffAt: Date },
  now: Date = new Date(),
): boolean {
  return (draw.status !== "OPEN" && draw.status !== "DRAFT") || draw.entryCutoffAt <= now;
}
