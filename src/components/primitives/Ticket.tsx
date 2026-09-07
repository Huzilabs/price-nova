import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * An entry ticket.
 *
 * Real notched geometry via CSS mask rather than an image, so it scales, works
 * on any background and costs nothing to load. This is the object the whole
 * product is about — a user's entries should feel like something they hold,
 * not a row in a table.
 */
export function Ticket({
  serial, drawName, prize, status = "active", className,
}: {
  serial: string;
  drawName: string;
  prize: string;
  status?: "active" | "won" | "closed";
  className?: string;
}) {
  const won = status === "won";
  return (
    <div
      className={cn(
        "ticket relative flex min-w-0 items-stretch overflow-hidden rounded-lg border",
        won ? "border-gold/40 bg-gold-tint" : "border-line bg-surface",
        status === "closed" && "opacity-55",
        className,
      )}
      style={{ ["--notch-y" as string]: "50%" }}
    >
      <div className="min-w-0 grow p-3.5">
        <div className={cn("tag", won ? "text-gold" : "text-faint")}>
          {won ? "Winning ticket" : drawName}
        </div>
        <div className="mono mt-1.5 truncate text-base font-semibold tracking-[0.06em] text-hi">
          {serial}
        </div>
      </div>

      <div className="perf my-3 w-px shrink-0 self-stretch bg-line"
           style={{ backgroundImage: "repeating-linear-gradient(to bottom, var(--color-line) 0 5px, transparent 5px 10px)", height: "auto", width: "2px" }}
           aria-hidden="true" />

      <div className="flex shrink-0 flex-col items-end justify-center p-3.5">
        <div className="tag text-faint">Prize</div>
        <div className={cn("prize mt-0.5 text-lg", won ? "text-gold" : "text-mid")}>{prize}</div>
      </div>
    </div>
  );
}

/** A compact count of entries, shown beside the draw. */
export function TicketCount({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 20 14" className="size-5 text-gold" aria-hidden="true">
        <path
          d="M1.5 3a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 18.5 3v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 11V9a2 2 0 0 0 0-4Z"
          fill="none" stroke="currentColor" strokeWidth="1.4"
        />
      </svg>
      <span className="num text-lg font-bold text-hi">{count.toLocaleString()}</span>
      <span className="text-sm text-mid">{count === 1 ? "entry" : "entries"}</span>
    </div>
  );
}
