import * as React from "react";
import { cn } from "@/lib/cn";
import { formatMoney, splitMoney, type Minor } from "@/lib/money";

/**
 * A financial figure: label above, value below, no box around it.
 *
 * Sizes map to hierarchy, not to taste — `hero` appears at most once per
 * page, `lg` for the two or three numbers that matter, `md` for the rest.
 */
type FigureSize = "hero" | "lg" | "md" | "sm";

export function Figure({
  label,
  value,
  size = "md",
  tone = "default",
  note,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  size?: FigureSize;
  tone?: "default" | "ok" | "bad" | "muted" | "gold";
  note?: React.ReactNode;
  className?: string;
}) {
  const sizes: Record<FigureSize, string> = {
    hero: "prize text-mega font-normal",
    lg: "num text-h1 font-medium",
    md: "num text-lg font-medium",
    sm: "num text-base font-medium",
  };
  const tones = {
    default: "text-hi",
    ok: "text-mint",
    bad: "text-bad",
    muted: "text-mid",
    gold: "text-gold",
  } as const;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1.5 min-w-0 break-words", sizes[size], tones[tone])}>{value}</div>
      {note && <div className="mt-1 text-sm text-mid">{note}</div>}
    </div>
  );
}

/**
 * The account balance. Cents are set smaller and lighter than the whole
 * amount — the trick every bank statement uses to make a figure feel
 * composed rather than merely large.
 */
export function BalanceFigure({
  amount,
  className,
}: {
  amount: Minor;
  className?: string;
}) {
  const { sign, whole, cents } = splitMoney(amount);
  return (
    <div className={cn("prize text-mega leading-none text-hi", className)}>
      <span className="me-0.5 align-[0.62em] text-[0.42em] font-normal text-mid">
        {sign}$
      </span>
      {whole}
      {/* Cents stay on the baseline. Raising them as well as the currency
          mark makes the figure read as two superscripts around a number. */}
      <span className="text-[0.52em] text-mid">.{cents}</span>
    </div>
  );
}

/** A signed ledger delta. Credits and debits must never look alike. */
export function Delta({ amount, className }: { amount: Minor; className?: string }) {
  const positive = amount >= 0n;
  return (
    <span
      className={cn(
        "num font-medium tabular-nums",
        positive ? "text-mint" : "text-bad",
        className,
      )}
    >
      {formatMoney(amount, { signed: true })}
    </span>
  );
}
