import * as React from "react";
import { cn } from "@/lib/cn";

/** Inputs, dark. Taller and rounder than v1 — these are touched on a phone. */
export function Field({
  label, hint, error, required, htmlFor, className, children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-mid">
        {label}
        {required && <span className="text-coral" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-micro font-semibold text-bad">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-micro text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL = [
  "w-full rounded-lg border bg-surface-2 px-3.5 text-base text-hi",
  "placeholder:text-faint",
  "transition-colors duration-(--dur-1)",
  "hover:border-line focus:border-mint focus:bg-surface-3",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  numeric?: boolean;
};

export function Input({ className, invalid, numeric, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-(--field-h)", numeric && "mono text-right",
        invalid ? "border-bad" : "border-line", className)}
    />
  );
}

export function Select({
  className, invalid, children, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        {...props}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, "h-(--field-h) appearance-none pr-10",
          invalid ? "border-bad" : "border-line", className)}
      >
        {children}
      </select>
      <svg viewBox="0 0 12 12" aria-hidden="true"
           className="pointer-events-none absolute end-3.5 top-1/2 size-3 -translate-y-1/2 text-mid">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function MoneyInput({ className, ...props }: InputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 mono text-base text-mid">$</span>
      <Input {...props} numeric className={cn("ps-8", className)} inputMode="decimal" />
    </div>
  );
}

export function Textarea({
  className, ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, "py-2.5", className)} />;
}
