/**
 * Date formatting.
 *
 * Every date in PriceNova is a BUSINESS date — a draw day, a withdrawal
 * window, an entry cutoff — and business dates must not shift under the
 * viewer's timezone. A draw on 30 September is on 30 September in Karachi and
 * in London; rendering it with the browser's local zone turned it into
 * "1 October" for a UTC+5 viewer, which is how withdrawal windows silently
 * become off-by-one. So: always UTC, always through these helpers.
 */

const UTC = "UTC";

export function formatDate(date: Date, locale = "en-GB"): string {
  return date.toLocaleDateString(locale, {
    day: "numeric", month: "long", year: "numeric", timeZone: UTC,
  });
}

/** "30 Sep" — for dense tables and inline references. */
export function formatDateShort(date: Date, locale = "en-GB"): string {
  return date.toLocaleDateString(locale, {
    day: "2-digit", month: "short", timeZone: UTC,
  });
}

/** "30 September" — no year, when the year is already established. */
export function formatDayMonth(date: Date, locale = "en-GB"): string {
  return date.toLocaleDateString(locale, {
    day: "numeric", month: "long", timeZone: UTC,
  });
}

export function formatDateTime(date: Date, locale = "en-GB"): string {
  return date.toLocaleString(locale, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: UTC,
  }) + " UTC";
}

/** Whole days between now and a future date, rounded up. */
export function daysUntil(date: Date, from: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - from.getTime()) / 86_400_000));
}
