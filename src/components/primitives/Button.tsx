import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Buttons.
 *
 * v1's buttons were 36px tall with a 4px radius — correct for an admin tool,
 * far too timid for "enter the draw". These are large, heavily rounded and
 * weighted, because the primary action on most screens is the point of the
 * screen.
 *
 * Note the text colours: coral and gold both take DARK ink. White on coral
 * measures 2.83:1 and fails; dark ink on coral is 6.6:1. Measured, not chosen.
 */
type Variant = "primary" | "gold" | "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  /* The main call to action. Coral = act now. */
  primary: "bg-coral text-[#1a1206] hover:bg-coral-hi shadow-coral font-bold",
  /* Prize-adjacent actions only — claiming, entering, winning. */
  gold: "bg-gold text-[#1a1206] hover:bg-gold-hi shadow-gold font-bold",
  /* Quiet affirmative on a dark card. */
  solid: "bg-surface-3 text-hi hover:bg-line border border-line",
  outline: "bg-transparent text-hi border border-line hover:border-mint hover:text-mint",
  ghost: "bg-transparent text-mid hover:text-hi hover:bg-surface-2 border border-transparent",
  danger: "bg-bad text-[#1a0808] hover:brightness-110 font-bold",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-(--control-h) px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
  xl: "h-14 px-8 text-lg gap-2.5 rounded-xl",
};

type Shared = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** A slow sheen across the face. Reserve for the single hero CTA. */
  shine?: boolean;
  fullWidth?: boolean;
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & Shared & {
  /** Renders a Link styled as a button. A <button> must never wrap an <a>. */
  href?: string;
};

function classes({ variant = "solid", size = "md", fullWidth = false }: Shared, className?: string) {
  return cn(
    "relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap font-semibold",
    "transition-all duration-(--dur-1) ease-out active:scale-[0.975]",
    "disabled:pointer-events-none disabled:opacity-40",
    fullWidth && "w-full",
    SIZES[size],
    VARIANTS[variant],
    className,
  );
}

export function Button({
  variant = "solid", size = "md", loading = false, shine = false,
  fullWidth = false, className, children, disabled, href, ...props
}: ButtonProps) {
  const inner = (
    <>
      {shine && !disabled && <span className="sheen-run pointer-events-none" aria-hidden="true" />}
      {loading && <Spinner />}
      <span className="relative">{children}</span>
    </>
  );
  const cls = classes({ variant, size, fullWidth }, className);

  if (href) {
    return <Link href={href} className={cls}>{inner}</Link>;
  }

  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={cls}>
      {inner}
    </button>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="relative size-4 animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
