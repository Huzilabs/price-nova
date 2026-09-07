"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Line chart — one series, sometimes two.
 *
 * Deliberate omissions: no gradient fill (a flat 7% tint instead), no rounded
 * "bubbly" markers, no drop shadow, no dual axis — ever. The grid is hairline
 * and horizontal only, so the marks are the darkest thing in the frame.
 *
 * Colours come from the validated --color-series-* tokens, assigned in fixed
 * order. See the note in globals.css for why they are not the brand colours.
 */

export type Point = { label: string; value: number };
export type Series = { name: string; points: Point[] };

const PAD = { top: 14, right: 18, bottom: 24, left: 48 } as const;
const SERIES_VARS = ["--color-series-1", "--color-series-2", "--color-series-3"] as const;

export function LineChart({
  series,
  height = 190,
  formatValue = (v: number) => v.toLocaleString(),
  formatTick = formatValue,
  integerTicks = false,
  caption,
  className,
}: {
  series: Series[];
  height?: number;
  formatValue?: (v: number) => string;
  formatTick?: (v: number) => string;
  /** Counts of things (people, entries) must not tick at 12.5. */
  integerTicks?: boolean;
  /** Names the data for screen readers and print. */
  caption: string;
  className?: string;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = series[0]?.points ?? [];
  const count = points.length;
  if (count === 0) return null;

  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const rawMax = Math.max(...allValues);
  const max = niceCeil(rawMax, integerTicks);
  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (count === 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const ticks = [...new Set([0, max / 2, max])];

  return (
    <figure className={cn("m-0", className)}>
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={caption}
          className="block touch-none select-none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const rel = event.clientX - rect.left - PAD.left;
            const idx = Math.round((rel / plotW) * (count - 1));
            setHover(Math.min(Math.max(idx, 0), count - 1));
          }}
        >
          {/* Grid — horizontal only, hairline, behind everything. */}
          {ticks.map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-grid)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ))}

          {/* Y ticks, tabular mono so the column edge stays straight. */}
          {ticks.map((t) => (
            <text
              key={t}
              x={PAD.left - 10}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="num"
              fontSize={11}
              fill="var(--color-ink-faint)"
            >
              {formatTick(t)}
            </text>
          ))}

          {/* X labels — first, middle, last only. Never all of them. */}
          {[0, Math.floor((count - 1) / 2), count - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"}
                fontSize={11}
                fill="var(--color-ink-faint)"
              >
                {points[i]?.label}
              </text>
            ))}

          {series.map((s, si) => {
            const stroke = `var(${SERIES_VARS[si % SERIES_VARS.length]})`;
            const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
            const area = `${d} L${x(s.points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
            return (
              <g key={s.name}>
                {series.length === 1 && <path d={area} fill={stroke} fillOpacity={0.07} />}
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Final point carries a marker; a surface ring keeps it
                    legible where two series cross. */}
                <circle
                  cx={x(s.points.length - 1)}
                  cy={y(s.points[s.points.length - 1]?.value ?? 0)}
                  r={4}
                  fill={stroke}
                  stroke="var(--color-base)"
                  strokeWidth={2}
                />
              </g>
            );
          })}

          {/* Hover crosshair. */}
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--color-axis)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((s, si) => (
                <circle
                  key={s.name}
                  cx={x(hover)}
                  cy={y(s.points[hover]?.value ?? 0)}
                  r={4.5}
                  fill={`var(${SERIES_VARS[si % SERIES_VARS.length]})`}
                  stroke="var(--color-base)"
                  strokeWidth={2}
                />
              ))}
            </>
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-card"
            style={{ left: x(hover), top: 0 }}
          >
            <div className="text-micro font-medium text-mid">{points[hover]?.label}</div>
            {series.map((s, si) => (
              <div key={s.name} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className="size-1.5 rounded-xs"
                  style={{ background: `var(${SERIES_VARS[si % SERIES_VARS.length]})` }}
                  aria-hidden="true"
                />
                {series.length > 1 && (
                  <span className="text-micro text-mid">{s.name}</span>
                )}
                <span className="num text-sm font-medium text-hi">
                  {formatValue(s.points[hover]?.value ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend appears only for >= 2 series; a single series is named by the
          section title, so a one-item legend would be pure decoration. */}
      {series.length > 1 && (
        <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s, si) => (
            <span key={s.name} className="flex items-center gap-1.5 text-micro text-mid">
              <span
                className="h-0.5 w-3 rounded-xs"
                style={{ background: `var(${SERIES_VARS[si % SERIES_VARS.length]})` }}
                aria-hidden="true"
              />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}

      {/* Identity is never colour-alone: the same numbers, as a table. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.name} scope="col">{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              {series.map((s) => (
                <td key={s.name}>{formatValue(s.points[i]?.value ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Round an axis maximum up to a readable step so ticks are not 3,847.33. */
function niceCeil(value: number, integer = false): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  // Finer than the usual 1/2/5/10 ladder: a max of 24 snapping to an axis of
  // 50 wastes half the plot and makes a healthy trend look flat.
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((candidate) => normalised <= candidate) ?? 10;
  const max = step * magnitude;
  // With a midpoint tick, an integer axis needs an even maximum, or the
  // middle label lands on 12.5 people.
  if (integer && !Number.isInteger(max / 2)) return Math.ceil(max / 2) * 2;
  return max;
}
