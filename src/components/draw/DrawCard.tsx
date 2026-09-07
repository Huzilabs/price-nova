import Link from "next/link";
import { Card } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Countdown } from "@/components/primitives/Countdown";
import { DrawImage } from "./DrawImage";
import { formatMoney, type Minor } from "@/lib/money";
import { formatDayMonth } from "@/lib/format";
import type { DrawCategory } from "@/server/services/draw";

/**
 * One draw, as a card.
 *
 * Everything on it comes from the draw row. Where a field is empty the card
 * omits that line rather than substituting filler — a draw with no description
 * shows no description, not a lorem sentence.
 */
export function DrawCard({
  id, name, imageUrl, prize, tierCount, entries, myEntries,
  startsAt, entryCutoffAt, drawAt, category, isMain,
}: {
  id: string;
  name: string;
  imageUrl: string | null;
  prize: Minor | null;
  tierCount: number;
  entries: number;
  myEntries: number;
  startsAt: Date;
  entryCutoffAt: Date;
  drawAt: Date;
  category: DrawCategory;
  isMain: boolean;
}) {
  const upcoming = category === "UPCOMING";
  const done = category === "COMPLETED";
  const countdownTo = upcoming ? startsAt : entryCutoffAt;

  return (
    <Card interactive={!done} className="flex flex-col overflow-hidden p-0">
      <Link href={`/draws/${id}`} className="block">
        <DrawImage src={imageUrl} name={name} prize={prize} className="h-36" />
      </Link>

      <div className="flex grow flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {isMain && <Badge tone="gold" dot>Main draw</Badge>}
          <Badge tone={done ? "neutral" : upcoming ? "info" : "mint"} dot={!done}>
            {done ? "Completed" : upcoming ? "Upcoming" : "Live"}
          </Badge>
          {!done && <Badge tone="neutral">{entries.toLocaleString()} entries</Badge>}
        </div>

        <Link href={`/draws/${id}`} className="mt-2.5 block">
          <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.02em] text-hi">
            {name}
          </h3>
        </Link>

        {prize !== null && (
          <div className="prize mt-1 text-h2 text-gold">
            {formatMoney(prize, { compactCents: true })}
            {tierCount > 1 && (
              <span className="ms-2 text-sm font-bold text-mid">
                +{tierCount - 1} more {tierCount === 2 ? "tier" : "tiers"}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 grow">
          {done ? (
            <div className="text-sm text-mid">Drawn {formatDayMonth(drawAt)}</div>
          ) : (
            <>
              <div className="tag mb-1.5 text-faint">
                {upcoming ? "Opens in" : "Entries close in"}
              </div>
              <Countdown target={countdownTo} size="sm" />
            </>
          )}
        </div>

        {myEntries > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-sm">
            <span className="font-bold text-mint">{myEntries}</span>
            <span className="text-mid">{myEntries === 1 ? "entry" : "entries"} yours</span>
          </div>
        )}

        <Button
          href={`/draws/${id}`}
          variant={done ? "outline" : "solid"}
          size="md"
          fullWidth
          className="mt-4"
        >
          {done ? "See result" : "View draw"}
        </Button>
      </div>
    </Card>
  );
}
