import "server-only";
import { db } from "@/lib/db";

/**
 * Runtime configuration. Nothing the business might change lives in code —
 * withdrawal windows, the entry cutoff day, prize tiers, thresholds.
 */
export type Window = { startDay: number; endDay: number };
export type WindowRule = Window[] | "ANY_TIME" | "ANY_TIME_AFTER_LOCK";

export async function get<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function getAll(): Promise<Record<string, unknown>> {
  const rows = await db.setting.findMany({ orderBy: { key: "asc" } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function set(key: string, value: unknown, updatedById?: string) {
  return db.setting.upsert({
    where: { key },
    update: { value: value as never, updatedById: updatedById ?? null },
    create: { key, value: value as never, updatedById: updatedById ?? null },
  });
}

/**
 * Is a withdrawal of this kind permitted today?
 *
 * Evaluated in UTC against the calendar day, because a window of "the 1st and
 * 2nd" must mean the same two days everywhere — see the note in lib/format.ts.
 */
export async function isWithdrawalWindowOpen(
  sourceKind: string,
  now: Date = new Date(),
): Promise<{ open: boolean; reason: string }> {
  const rule = await get<WindowRule>(`withdrawal.windows.${sourceKind}`, "ANY_TIME");

  if (rule === "ANY_TIME") return { open: true, reason: "No window restriction" };
  if (rule === "ANY_TIME_AFTER_LOCK") {
    return { open: true, reason: "Governed by the plan lock period, not a calendar window" };
  }

  const day = now.getUTCDate();
  const match = rule.find((w) => day >= w.startDay && day <= w.endDay);
  if (match) return { open: true, reason: `Within window ${match.startDay}–${match.endDay}` };

  const windows = rule.map((w) => (w.startDay === w.endDay ? `${w.startDay}` : `${w.startDay}–${w.endDay}`));
  return { open: false, reason: `Outside the withdrawal window (open on ${windows.join(" and ")} of each month)` };
}
