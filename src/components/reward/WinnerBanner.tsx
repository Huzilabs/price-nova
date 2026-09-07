"use client";

import * as React from "react";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";

/**
 * The winner state.
 *
 * Rendered only when the server has confirmed a DrawWinner row for this user —
 * there is no client-side path to this component. The confetti is CSS-driven,
 * runs once, respects prefers-reduced-motion via the global rule, and is
 * deliberately sparse: twenty pieces, gold and mint only, no sound, no loop.
 */
export function WinnerBanner({
  drawId, drawName, prize,
}: {
  drawId: string;
  drawName: string;
  prize: string;
}) {
  const pieces = React.useMemo(
    () => Array.from({ length: 20 }, (_, i) => ({
      left: `${(i * 4.7 + (i % 3) * 6) % 96 + 2}%`,
      delay: `${(i % 7) * 0.18}s`,
      duration: `${2.4 + (i % 4) * 0.4}s`,
      gold: i % 3 !== 0,
      rotate: `${(i * 37) % 360}deg`,
    })),
    [],
  );

  return (
    <Card tone="gold" className="animate-pop relative overflow-hidden p-6 text-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {pieces.map((piece, i) => (
          <span
            key={i}
            className="absolute -top-3 size-2 rounded-[1px]"
            style={{
              left: piece.left,
              background: piece.gold ? "var(--color-gold)" : "var(--color-mint)",
              transform: `rotate(${piece.rotate})`,
              animation: `pn-fall ${piece.duration} linear ${piece.delay} 1 forwards`,
            }}
          />
        ))}
      </div>

      <div className="relative">
        <div className="text-4xl" aria-hidden="true">🎉</div>
        <div className="tag mt-2 text-gold">Congratulations</div>
        <h2 className="font-display mt-1 text-h1 font-extrabold tracking-[-0.03em] text-hi">
          You won!
        </h2>
        <div className="prize mt-2 text-prize text-gold">{prize}</div>
        <p className="mt-2 text-sm text-mid">{drawName}</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button href="/rewards" variant="gold" size="lg" fullWidth>View reward</Button>
          <Button href={`/draws/${drawId}`} variant="outline" size="lg" fullWidth>The draw</Button>
        </div>
      </div>
    </Card>
  );
}
