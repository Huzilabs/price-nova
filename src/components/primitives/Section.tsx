import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The anti-card.
 *
 * A section is a title, a hairline rule, and content flowing beneath it. No
 * border box, no shadow, no rounded rectangle. This is the default container
 * in PriceNova; `Panel` below is the exception, used only when content must
 * genuinely lift out of the page flow.
 */
export function Section({
  title,
  description,
  action,
  className,
  headingLevel: Heading = "h2",
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mb-(--section-y) min-w-0", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
          <div className="min-w-0">
            {title && (
              <Heading className="font-display text-lg leading-snug font-bold tracking-[-0.015em] text-hi">
                {title}
              </Heading>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-mid">{description}</p>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2 pb-0.5">{action}</div>}
        </div>
      )}
      <div className={cn(title || action ? "pt-4" : undefined)}>{children}</div>
    </section>
  );
}

/**
 * A lifted surface. Use ONLY when content must separate from the page —
 * an upcoming draw, a modal body, a confirmation summary. If you are about to
 * wrap a statistic in one of these, use a `Figure` on the bare page instead.
 */
export function Panel({
  className,
  children,
  tone = "default",
}: {
  className?: string;
  children: React.ReactNode;
  tone?: "default" | "inset" | "gold" | "ink";
}) {
  const tones = {
    default: "bg-surface border-line",
    inset: "bg-surface-2 border-line",
    gold: "bg-gold-tint border-gold/30",
    ink: "bg-base border-line",
  } as const;
  return <div className={cn("rounded-xl border shadow-card", tones[tone], className)}>{children}</div>;
}

/** A labelled horizontal rule for subdividing a section without nesting. */
export function RuleLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="tag shrink-0 text-faint">{children}</span>
      <span className="h-px grow bg-line" aria-hidden="true" />
    </div>
  );
}
