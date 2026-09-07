import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Tables.
 *
 * These survive from v1 largely intact because the admin console genuinely
 * needs them — but they are now dark, and the user-facing app uses cards and
 * tickets instead. "Boring tables everywhere" was the thing to avoid; a dense
 * table in a back office is not that.
 */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <table className={cn("w-full min-w-[34rem] border-collapse text-sm", className)}>{children}</table>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-base">{children}</thead>;
}

export function TH({
  align = "left", className, children, ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      {...props}
      className={cn(
        "border-b border-line px-(--cell-x) pb-2 pt-1 first:ps-0 last:pe-0",
        "text-micro font-bold uppercase tracking-[0.08em] text-faint whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TR({
  className, interactive = false, children, ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      {...props}
      className={cn(
        "border-b border-line-soft last:border-b-0",
        interactive && "cursor-pointer transition-colors duration-(--dur-1) hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  align = "left", numeric = false, className, children, ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  numeric?: boolean;
}) {
  return (
    <td
      {...props}
      className={cn(
        "h-(--row-h) px-(--cell-x) py-(--cell-y) align-middle text-hi first:ps-0 last:pe-0",
        numeric && "mono",
        (align === "right" || numeric) && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function CellStack({
  primary, secondary,
}: { primary: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-hi">{primary}</div>
      {secondary && <div className="truncate text-micro text-faint">{secondary}</div>}
    </div>
  );
}
