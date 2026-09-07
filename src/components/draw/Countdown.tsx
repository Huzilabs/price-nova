"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Draw countdown.
 *
 * Set in tabular mono so the digits sit in fixed columns and the block does
 * not twitch on every tick — the difference between "anticipation" and
 * "flashing casino sign" is largely that the type stays still.
 */
export function Countdown({
  target,
  className,
  tone = "dark",
}: {
  target: Date;
  className?: string;
  tone?: "dark" | "light";
}) {
  const [remaining, setRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    const tick = () => setRemaining(Math.max(0, target.getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  const parts = splitDuration(remaining);
  const label =
    remaining === null
      ? "Loading countdown"
      : `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes remaining`;

  const digit = tone === "dark" ? "text-hi" : "text-hi";
  const unit = tone === "dark" ? "text-gold" : "text-mid";
  const rule = tone === "dark" ? "bg-ink-inverse/15" : "bg-line";

  return (
    <div className={cn("flex items-stretch", className)} role="timer" aria-label={label}>
      {UNITS.map(({ key, short }, i) => (
        <React.Fragment key={key}>
          {i > 0 && (
            <span className={cn("mx-2 w-px self-stretch sm:mx-3", rule)} aria-hidden="true" />
          )}
          <div className="min-w-[2.75ch]">
            <div className={cn("num text-h2 font-medium leading-none tabular-nums sm:text-h1", digit)}>
              {remaining === null ? "––" : parts[key].toString().padStart(2, "0")}
            </div>
            <div className={cn("mt-1.5 text-micro font-semibold uppercase tracking-[0.09em]", unit)}>
              {short}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

const UNITS = [
  { key: "days", short: "Days" },
  { key: "hours", short: "Hrs" },
  { key: "minutes", short: "Min" },
  { key: "seconds", short: "Sec" },
] as const;

function splitDuration(ms: number | null) {
  const total = Math.floor((ms ?? 0) / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
