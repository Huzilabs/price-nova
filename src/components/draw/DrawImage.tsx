import { formatMoney, type Minor } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * A draw's image.
 *
 * When the admin has not set one, this does NOT render a stock photo or a
 * decorative shape — it renders the prize, large, on a warm ground. The
 * fallback carries real information instead of pretending an image exists.
 */
export function DrawImage({
  src, name, prize, className,
}: {
  src: string | null;
  name: string;
  prize: Minor | null;
  className?: string;
}) {
  if (src) {
    return (
      // A plain <img>: draw images are admin-supplied URLs on arbitrary hosts,
      // which next/image would need configured remote patterns for.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("w-full object-cover", className)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden border-b border-line bg-surface-2",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 halo-gold" />
      {prize !== null ? (
        <span className="prize relative text-h1 text-gold/85">
          {formatMoney(prize, { compactCents: true })}
        </span>
      ) : (
        <span className="tag relative text-faint">No prize set</span>
      )}
    </div>
  );
}
