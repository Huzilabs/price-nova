import { Countdown } from "@/components/primitives/Countdown";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { TicketCount } from "@/components/primitives/Ticket";
import { DrawImage } from "./DrawImage";
import { formatMoney, type Minor } from "@/lib/money";
import { formatDayMonth, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The hero. Every screen answers "what can I win and when" before anything
 * else, and this is where it answers it.
 *
 * Reading order is deliberate and never varies: kicker → prize → clock →
 * your entries → action. The prize is the largest thing on the page by a wide
 * margin; the clock is second. Everything else is smaller than both.
 */
export function DrawHero({
  id, name, description, imageUrl, prize, startsAt, drawAt, entryCutoffAt,
  participants, myEntries, isSignedIn, isParticipating, upcoming,
}: {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  prize: Minor | null;
  startsAt: Date;
  drawAt: Date;
  entryCutoffAt: Date;
  participants: number;
  myEntries: number;
  isSignedIn: boolean;
  isParticipating: boolean;
  upcoming: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold/25 bg-surface shadow-gold">
      {/* The light on the prize. One radial wash, no gradient blobs. */}
      <div className="pointer-events-none absolute inset-0 halo-gold" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgb(245 196 81 / 0.35), transparent)" }}
        aria-hidden="true"
      />

      {imageUrl && <DrawImage src={imageUrl} name={name} prize={prize} className="relative h-44 sm:h-56" />}

      <div className="relative px-5 py-7 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="gold" dot>Main draw</Badge>
          {participants > 0 && (
            <Badge tone="neutral">{participants.toLocaleString()} in the draw</Badge>
          )}
        </div>

        <h1 className="font-display mt-4 text-center text-h2 font-extrabold leading-tight tracking-[-0.03em] text-hi">
          {name}
        </h1>
        {description && (
          <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-mid">
            {description}
          </p>
        )}

        {prize !== null && (
          <div className="mt-5 text-center">
            <div className="tag text-gold">Top prize</div>
            <div className="prize mt-1.5 text-prize text-gold sm:text-[5.5rem]">
              {formatMoney(prize, { compactCents: true })}
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col items-center">
          <div className="tag mb-2.5 text-mid">
            {upcoming ? "Opens in" : "Entries close in"}
          </div>
          <Countdown target={upcoming ? startsAt : entryCutoffAt} size="lg" />
          <p className="mt-3 text-sm text-mid">
            {upcoming
              ? `Opens ${formatDate(startsAt)}`
              : `Entries close ${formatDayMonth(entryCutoffAt)} · drawn ${formatDayMonth(drawAt)}`}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          {isParticipating ? (
            <>
              <TicketCount count={myEntries} />
              <Button href={`/draws/${id}`} variant="gold" size="lg" shine className="w-full sm:w-auto sm:min-w-56">
                View the draw
              </Button>
            </>
          ) : isSignedIn ? (
            <>
              <p className="max-w-sm text-center text-sm text-mid">
                You are not in this draw yet. One deposit puts you in every monthly draw
                while your participation stays active.
              </p>
              <Button href={`/join?draw=${id}`} variant="primary" size="xl" shine className="w-full sm:w-auto sm:min-w-64">
                Participate now
              </Button>
            </>
          ) : (
            <>
              <p className="max-w-sm text-center text-sm text-mid">
                Create an account to enter this draw and start building your team.
              </p>
              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
                <Button href={`/signup`} variant="primary" size="xl" shine className="sm:min-w-56">
                  Join the draw
                </Button>
                <Button href="/login" variant="outline" size="xl">
                  I have an account
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* How it works, folded into the hero so nobody has to hunt for it. */}
      <div className="relative grid grid-cols-3 divide-x divide-line border-t border-line bg-base/40 text-center">
        {[
          ["1", "Deposit", "Activates your participation"],
          ["2", "Get entries", "One per active participation"],
          ["3", "Draw day", "Winners announced and paid"],
        ].map(([step, title, detail]) => (
          <div key={step} className="px-3 py-4">
            <div className="mx-auto mb-1.5 flex size-5 items-center justify-center rounded-full bg-surface-3 text-micro font-bold text-gold">
              {step}
            </div>
            <div className="text-sm font-bold text-hi">{title}</div>
            <div className="mt-0.5 text-micro leading-snug text-faint">{detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * No draw is designated as the main draw.
 *
 * This says exactly that rather than inventing a placeholder prize. If other
 * draws exist it points at them, because "nothing is featured" is not the same
 * as "nothing is running".
 */
export function DrawHeroEmpty({ otherDraws = 0, className }: {
  otherDraws?: number;
  className?: string;
}) {
  return (
    <section className={cn("relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-12 text-center", className)}>
      <div className="tag text-faint">Main draw</div>
      <h2 className="font-display mt-2 text-h2 font-extrabold tracking-[-0.02em] text-hi">
        No featured draw right now
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-mid">
        {otherDraws > 0
          ? `Nothing is featured at the moment, but ${otherDraws} ${otherDraws === 1 ? "draw is" : "draws are"} listed.`
          : "When a draw is published and featured it appears here with its prize and countdown."}
      </p>
      {otherDraws > 0 && (
        <Button href="/draws" variant="primary" size="lg" className="mt-6">
          See all draws
        </Button>
      )}
    </section>
  );
}
