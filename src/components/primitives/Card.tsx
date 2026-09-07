import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Cards. v1 avoided them on principle; here they are the unit of the product,
 * because a rewards app is a stack of discrete, tappable things.
 *
 * The discipline that replaces "no cards" is: a card must be one idea with one
 * action. If it needs two headings, it is two cards.
 */
export function Card({
  tone = "default", interactive = false, className, children, ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "raised" | "gold" | "mint" | "coral" | "locked";
  interactive?: boolean;
}) {
  const tones = {
    default: "bg-surface border-line",
    raised: "bg-surface-2 border-line",
    gold: "bg-gold-tint border-gold/30",
    mint: "bg-mint-tint border-mint/25",
    coral: "bg-coral-tint border-coral/25",
    locked: "bg-surface/60 border-line-soft",
  } as const;

  return (
    <div
      {...props}
      className={cn(
        "rounded-xl border shadow-card",
        tones[tone],
        interactive && "transition-transform duration-(--dur-1) ease-out hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Section heading with an optional action. Bold, not a hairline rule. */
export function SectionHead({
  title, action, kicker, className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  kicker?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {kicker && <div className="tag mb-1 text-faint">{kicker}</div>}
        <h2 className="font-display text-title font-bold tracking-[-0.02em] text-hi">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Empty state. Still no illustration — but it always offers the next move. */
export function EmptyState({
  title, description, action, icon, className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="text-lg font-bold text-hi">{title}</p>
      <p className="mt-1.5 max-w-[42ch] text-sm leading-relaxed text-mid">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
