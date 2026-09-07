import * as React from "react";
import { Card } from "@/components/primitives/Card";
import { cn } from "@/lib/cn";

/**
 * A recent winner.
 *
 * Social proof is the reason this section exists, so it shows a real person
 * and a real amount. Names are shortened to a first name and an initial —
 * enough to feel like someone, not enough to expose a participant.
 */
export function WinnerCard({
  name, prize, drawName, date, entryNumber, className,
}: {
  name: string;
  prize: string;
  drawName: string;
  date: string;
  entryNumber?: string;
  className?: string;
}) {
  return (
    <Card tone="raised" className={cn("flex items-center gap-3.5 p-3.5", className)}>
      <Avatar name={name} />
      <div className="min-w-0 grow">
        <div className="truncate text-sm font-bold text-hi">{name}</div>
        <div className="truncate text-micro text-faint">
          {drawName} · {date}
          {entryNumber && <span className="mono"> · {entryNumber}</span>}
        </div>
      </div>
      <div className="prize shrink-0 text-lg text-gold">{prize}</div>
    </Card>
  );
}

/** Initials on a hue derived from the name — stable, and no image to load. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-[#0b1210]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${hash} 55% 68%), hsl(${(hash + 40) % 360} 60% 52%))`,
      }}
    >
      {initials}
    </span>
  );
}

/** Shorten "Ayesha Khan" to "Ayesha K." for public display. */
export function publicName(fullName: string): string {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : (first ?? "Someone");
}
