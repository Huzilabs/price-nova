import { Card } from "@/components/primitives/Card";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { MOVEMENT_LABELS, type Movement } from "@/server/queries/activity";

/**
 * One money movement. Three visual states, because "money arrived", "money
 * left" and "money moved between your own buckets" are three different
 * things and must never look alike.
 */
export function MovementRow({ movement }: { movement: Movement }) {
  const { direction } = movement;
  const style = {
    in: { chip: "bg-mint-tint text-mint", glyph: "↓", amount: "text-mint", sign: "+" },
    out: { chip: "bg-surface-3 text-mid", glyph: "↑", amount: "text-mid", sign: "−" },
    moved: { chip: "bg-surface-3 text-gold", glyph: "⇄", amount: "text-mid", sign: "" },
  }[direction];

  return (
    <Card tone="raised" className="flex items-center gap-3 p-3.5">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${style.chip}`}
        aria-hidden="true"
      >
        {style.glyph}
      </span>

      <div className="min-w-0 grow">
        <div className="truncate text-sm font-bold text-hi">
          {MOVEMENT_LABELS[movement.type] ?? movement.type.replace(/_/g, " ")}
        </div>
        <div className="truncate text-micro text-faint">
          {formatDate(movement.at)}
          {movement.movedTo && <span> · {movement.movedTo}</span>}
        </div>
      </div>

      <div className={`num shrink-0 text-sm font-bold ${style.amount}`}>
        {style.sign}{formatMoney(movement.amount)}
      </div>
    </Card>
  );
}
