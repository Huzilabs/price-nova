import * as React from "react";

/** Admin page head: title, one line of context, actions. No hero, no card. */
export function PageHeader({
  title, description, action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="font-display text-h1 leading-tight tracking-[-0.015em] text-hi">{title}</h1>
        {description && <p className="mt-1 text-sm text-mid">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
