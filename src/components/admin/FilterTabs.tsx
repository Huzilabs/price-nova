import Link from "next/link";
import { cn } from "@/lib/cn";
import { SearchBox } from "./SearchBox";

/**
 * Status filter as a row of tabs above the table, with counts.
 *
 * A row of links rather than a select: an operator working a queue needs to
 * see how much is waiting without opening a dropdown.
 */
export function FilterTabs({
  basePath, current, query, tabs, searchPlaceholder,
}: {
  basePath: string;
  current: string;
  query?: string;
  tabs: Array<{ key: string; label: string; count?: number }>;
  searchPlaceholder?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => {
          const active = tab.key === current;
          const href = `${basePath}?status=${tab.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-sm transition-colors duration-(--dur-1)",
                active
                  ? "border-line bg-surface font-medium text-hi"
                  : "border-transparent text-mid hover:bg-surface-2 hover:text-hi",
              )}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span className={cn("num text-micro", active ? "text-mid" : "text-faint")}>
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <SearchBox basePath={basePath} status={current} defaultValue={query ?? ""} placeholder={searchPlaceholder} />
    </div>
  );
}
