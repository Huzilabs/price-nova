import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ok" | "bad" | "warn" | "mint" | "gold" | "coral" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-mid border-line",
  ok: "bg-mint-tint text-mint border-mint/30",
  mint: "bg-mint-tint text-mint border-mint/30",
  bad: "bg-bad-tint text-bad border-bad/30",
  warn: "bg-gold-tint text-gold border-gold/30",
  gold: "bg-gold-tint text-gold border-gold/35",
  coral: "bg-coral-tint text-coral border-coral/30",
  info: "bg-info-tint text-info border-info/30",
};

export function Badge({
  tone = "neutral", className, children, dot = false,
}: {
  tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-micro font-bold uppercase tracking-[0.07em] leading-none",
        TONES[tone], className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warn", PENDING_REVIEW: "warn", PROCESSING: "warn", REQUESTED: "neutral",
  APPROVED: "info", CONFIRMED: "ok", PAID: "ok", COMPLETED: "ok",
  REJECTED: "bad", FAILED: "bad", CANCELLED: "neutral",
  ACTIVE: "ok", LOCKED: "warn", INACTIVE: "neutral", SUSPENDED: "bad", CLOSED: "neutral",
  DRAFT: "neutral", OPEN: "mint", ENTRY_CLOSED: "warn", READY_FOR_DRAW: "coral",
  WINNER_SELECTED: "gold", PRIZE_ISSUED: "gold", ISSUED: "gold",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} className={className}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/**
 * A level badge — a chevron count that grows with the user's team. Cheap to
 * earn early, visibly harder later, which is what keeps the ladder motivating.
 */
export function LevelBadge({ referrals, className }: { referrals: number; className?: string }) {
  const level = referrals >= 1000 ? 5 : referrals >= 300 ? 4 : referrals >= 100 ? 3 : referrals >= 25 ? 2 : referrals >= 1 ? 1 : 0;
  const names = ["Newcomer", "Builder", "Captain", "Leader", "Champion", "Legend"];
  const tones: Tone[] = ["neutral", "mint", "mint", "info", "gold", "gold"];

  return (
    <Badge tone={tones[level]!} className={className}>
      <span aria-hidden="true" className="tracking-tighter">{"›".repeat(Math.max(1, level))}</span>
      {names[level]}
    </Badge>
  );
}
