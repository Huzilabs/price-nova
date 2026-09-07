import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Progress. The single most important component in this system.
 *
 * Rule 2 of the design language: if a user is N steps away from something,
 * show the bar. A number alone ("14 of 20") tells them where they are; the
 * bar tells them how close, which is what makes them act.
 */
export function ProgressBar({
  value, target, tone = "mint", size = "md", showTicks = false, className,
}: {
  value: number;
  target: number;
  tone?: "mint" | "gold" | "coral";
  size?: "sm" | "md" | "lg";
  /** Segment the bar when the target is small enough to count at a glance. */
  showTicks?: boolean;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };
  const fills = {
    mint: "bg-gradient-to-r from-mint-deep to-mint",
    gold: "bg-gradient-to-r from-gold-deep to-gold",
    coral: "bg-gradient-to-r from-coral-deep to-coral",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-label={`${value} of ${target}`}
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", heights[size], className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-(--dur-3) ease-out", fills[tone])}
        style={{ width: `${pct}%` }}
      />
      {showTicks && target <= 20 && target > 1 && (
        <div className="absolute inset-0 flex" aria-hidden="true">
          {Array.from({ length: target - 1 }).map((_, i) => (
            <span key={i} className="h-full flex-1 border-e border-base/60 last:border-e-0" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A progress ring. Used where a bar would be too wide — inside a reward card,
 * beside an avatar, on a milestone tile.
 */
export function ProgressRing({
  value, target, size = 56, tone = "mint", children,
}: {
  value: number;
  target: number;
  size?: number;
  tone?: "mint" | "gold" | "coral";
  children?: React.ReactNode;
}) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const stroke = size >= 56 ? 5 : 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const colors = { mint: "var(--color-mint)", gold: "var(--color-gold)", coral: "var(--color-coral)" };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={colors[tone]} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-(--dur-3) ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** "7 / 10" with the numerator emphasised. */
export function Fraction({
  value, target, className,
}: { value: number; target: number; className?: string }) {
  return (
    <span className={cn("num", className)}>
      <span className="font-bold text-hi">{value.toLocaleString()}</span>
      <span className="text-faint"> / {target.toLocaleString()}</span>
    </span>
  );
}
