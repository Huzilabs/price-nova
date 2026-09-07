import { cn } from "@/lib/cn";

/**
 * The mark: a diamond within a diamond — a seal, and the simplest possible
 * "nova". Kept from v1 because it was never the corporate part; only its
 * colours changed, gold on mint instead of brass on green.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn("size-5", className)}>
      <rect x="10" y="1.6" width="11.9" height="11.9" transform="rotate(45 10 1.6)"
            fill="none" stroke="var(--color-gold)" strokeWidth="1.4" />
      <rect x="10" y="6.1" width="5.5" height="5.5" transform="rotate(45 10 6.1)"
            fill="var(--color-mint)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Mark className="size-6" />
      <span className="font-display text-lg font-extrabold tracking-[-0.02em] text-hi">PriceNova</span>
    </span>
  );
}
