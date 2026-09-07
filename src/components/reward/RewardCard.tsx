import * as React from "react";
import { Card } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { ProgressBar, Fraction } from "@/components/primitives/Progress";
import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/cn";

/**
 * A reward the user is working towards.
 *
 * Every one of these answers three questions in a fixed order: what is it,
 * how close am I, and what do I do next. That order is the whole reason the
 * card works — a prize with no distance to it is an advert, and a distance
 * with no action is a nag.
 */
export type RewardState = "locked" | "in-progress" | "ready" | "claimed";

export function RewardCard({
  title, prize, requirement, value, target, state, href, ctaLabel = "Invite friends", note,
}: {
  title: string;
  prize: string;
  requirement: string;
  value: number;
  target: number;
  state: RewardState;
  href?: string;
  ctaLabel?: string;
  note?: string;
}) {
  const remaining = Math.max(0, target - value);
  const ready = state === "ready";
  const claimed = state === "claimed";

  return (
    <Card
      tone={claimed ? "gold" : ready ? "gold" : "default"}
      interactive={!claimed}
      className={cn("relative flex flex-col overflow-hidden p-5", claimed && "opacity-90")}
    >
      {(ready || claimed) && (
        <div className="pointer-events-none absolute inset-0 halo-gold" aria-hidden="true" />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="tag text-faint">{title}</div>
          {/* A prize can be "$100" or "Honda 70cc motorcycle or $500". Long
              strings step down a size and wrap on word boundaries rather than
              blowing the card out to three lines of display type. */}
          <div
            className={cn(
              "prize mt-1.5 text-balance",
              prize.length > 14 ? "text-lg leading-tight" : "text-h2",
              claimed || ready ? "text-gold" : "text-hi",
            )}
          >
            {prize}
          </div>
        </div>
        {claimed ? (
          <Badge tone="gold" dot className="shrink-0">Claimed</Badge>
        ) : ready ? (
          <Badge tone="gold" dot className="shrink-0">Ready</Badge>
        ) : (
          <Badge tone="neutral" className="shrink-0 whitespace-nowrap">{remaining} to go</Badge>
        )}
      </div>

      <p className="relative mt-3 text-sm leading-relaxed text-mid">{requirement}</p>

      {!claimed && (
        <div className="relative mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <Fraction value={value} target={target} className="text-sm" />
            <span className="num text-micro font-bold text-faint">
              {Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%
            </span>
          </div>
          <ProgressBar value={value} target={target} tone={ready ? "gold" : "mint"} />
        </div>
      )}

      {note && <p className="relative mt-3 text-micro text-faint">{note}</p>}

      {href && !claimed && (
        <Button href={href} variant={ready ? "gold" : "outline"} size="md" fullWidth className="relative mt-4">
          {ready ? "Claim reward" : ctaLabel}
        </Button>
      )}
    </Card>
  );
}
