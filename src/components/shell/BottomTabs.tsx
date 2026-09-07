"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Bottom tab bar — the primary navigation on a phone.
 *
 * Five destinations, no more: anything that does not earn a permanent slot
 * lives inside one of these. Icons are drawn inline so there is no icon
 * dependency and each one can be tuned to sit on the same optical weight.
 */
const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/draws", label: "Draws", icon: TicketIcon },
  { href: "/entries", label: "Entries", icon: EntryIcon },
  { href: "/rewards", label: "Rewards", icon: TrophyIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
] as const;

export function BottomTabs({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-[32rem]">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={isSignedIn || tab.href === "/" || tab.href === "/draws" ? tab.href : "/login"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2.5 transition-colors duration-(--dur-1)",
                  active ? "text-mint" : "text-faint hover:text-mid",
                )}
              >
                <Icon active={active} />
                <span className="text-[0.625rem] font-bold uppercase tracking-wide">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1Z" {...S}
            fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.16 : 0} />
    </svg>
  );
}
function TicketIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h12a1.5 1.5 0 0 1 1.5 1.5v1.8a2 2 0 0 0 0 3.4v1.8A1.5 1.5 0 0 1 16 15H4a1.5 1.5 0 0 1-1.5-1.5v-1.8a2 2 0 0 0 0-3.4Z" {...S}
            fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.16 : 0} />
    </svg>
  );
}
function WalletIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="10.5" rx="2.2" {...S}
            fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.16 : 0} />
      <path d="M13.6 10.2h2.4" {...S} />
    </svg>
  );
}
function EntryIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M4 3.5h9.5L16.5 6.5V16a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" {...S}
            fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.16 : 0} />
      <path d="M6.5 9.5h7M6.5 12.5h4.5" {...S} />
    </svg>
  );
}
function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <path d="M6.5 3.5h7v3.2a3.5 3.5 0 0 1-7 0Z" {...S}
            fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.16 : 0} />
      <path d="M6.5 4.5H4.2v1a2.3 2.3 0 0 0 2.3 2.3M13.5 4.5h2.3v1a2.3 2.3 0 0 1-2.3 2.3" {...S} />
      <path d="M10 10.2v3.3M7 16.5h6" {...S} />
    </svg>
  );
}
