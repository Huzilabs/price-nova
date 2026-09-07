"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The countdown.
 *
 * v1's was a modest 28px row of digits. Here it is the second-largest thing on
 * the page after the prize itself, because "how long do I have" is the
 * question that brings people back.
 *
 * Digits are tabular so the block does not twitch every second — the
 * difference between anticipation and a flashing sign. The seconds pair turns
 * coral inside the final hour: urgency arrives through colour, not animation.
 */
export function Countdown({
  target, size = "lg", className, onComplete,
}: {
  target: Date;
  size?: "sm" | "md" | "lg";
  className?: string;
  onComplete?: () => void;
}) {
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const fired = React.useRef(false);

  React.useEffect(() => {
    const tick = () => {
      const left = Math.max(0, target.getTime() - Date.now());
      setRemaining(left);
      if (left === 0 && !fired.current) { fired.current = true; onComplete?.(); }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target, onComplete]);

  const t = split(remaining);
  const urgent = remaining !== null && remaining < 3_600_000;

  const digit = {
    sm: "text-title",
    md: "text-h2",
    lg: "text-mega",
  }[size];
  const box = {
    sm: "min-w-[2.4ch] px-1.5 py-1 rounded-md",
    md: "min-w-[2.6ch] px-2.5 py-1.5 rounded-lg",
    lg: "min-w-[2.5ch] px-3 py-2.5 sm:px-4 rounded-xl",
  }[size];

  const label =
    remaining === null ? "Loading countdown"
      : `${t.days} days, ${t.hours} hours, ${t.minutes} minutes remaining`;

  return (
    <div className={cn("flex items-stretch gap-1.5 sm:gap-2", className)} role="timer" aria-label={label}>
      {(["days", "hours", "minutes", "seconds"] as const).map((unit) => {
        const isSeconds = unit === "seconds";
        return (
          <div key={unit} className="flex flex-col items-center">
            <div
              className={cn(
                "flex items-center justify-center border tabular-nums font-display font-extrabold tracking-[-0.04em]",
                box, digit,
                isSeconds && urgent
                  ? "border-coral/40 bg-coral-tint text-coral"
                  : "border-line bg-surface-2 text-hi",
              )}
            >
              {remaining === null ? "––" : String(t[unit]).padStart(2, "0")}
            </div>
            <div className={cn("tag mt-1.5", isSeconds && urgent ? "text-coral" : "text-faint")}>
              {unit === "days" ? "days" : unit === "hours" ? "hrs" : unit === "minutes" ? "min" : "sec"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function split(ms: number | null) {
  const total = Math.floor((ms ?? 0) / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
