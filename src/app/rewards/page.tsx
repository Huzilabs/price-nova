import { requireUser } from "@/lib/guards";
import { getRewardsOverview } from "@/server/queries/achievements";
import { AppShell } from "@/components/shell/AppShell";
import { Card, SectionHead, EmptyState } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { ProgressBar, ProgressRing, Fraction } from "@/components/primitives/Progress";
import { StatusBadge } from "@/components/primitives/Badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Rewards" };
export const dynamic = "force-dynamic";

/**
 * Rewards.
 *
 * Three things in priority order: what you have won, what you are closest to
 * winning, and what you have proven. Every number is a query — a milestone
 * with no progress shows zero, not a flattering placeholder.
 */
export default async function RewardsPage() {
  const session = await requireUser();
  const { qualified, bumpers, awards, prizes, achievements } = await getRewardsOverview(session.id);

  const next = bumpers.find((b) => b.threshold > qualified) ?? null;
  const earned = achievements.filter((a) => a.earned);
  const totalWon = prizes.reduce((sum, prize) => sum + prize.amount, 0n);

  return (
    <AppShell session={session}>
      <div className="tag text-faint">Rewards</div>
      <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">
        What you&rsquo;ve unlocked
      </h1>

      {/* ---- Headline counters ------------------------------------------ */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          ["Won", formatMoney(totalWon, { compactCents: true }), "text-gold"],
          ["Team", qualified.toLocaleString(), "text-hi"],
          ["Badges", `${earned.length}/${achievements.length}`, "text-mint"],
        ].map(([label, value, tone]) => (
          <Card key={label} tone="raised" className="px-3 py-4 text-center">
            <div className={cn("font-display text-title font-extrabold tracking-[-0.02em]", tone)}>
              {value}
            </div>
            <div className="tag mt-1 text-faint">{label}</div>
          </Card>
        ))}
      </div>

      {/* ---- Prizes actually won ---------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Yours" title="Prizes won" />
        {prizes.length === 0 ? (
          <EmptyState
            title="No prizes yet"
            description="Draw prizes and referral milestone rewards appear here the moment they're credited."
            action={<Button href="/draws" variant="primary">See the draws</Button>}
          />
        ) : (
          <div className="space-y-2.5">
            {prizes.map((prize) => (
              <Card key={prize.id} tone="gold" className="flex items-center gap-4 p-4">
                <span className="text-2xl" aria-hidden="true">🏆</span>
                <div className="min-w-0 grow">
                  <div className="truncate text-base font-bold text-hi">
                    {prize.itemName ?? (prize.sourceType === "DRAW" ? "Draw prize" : "Bumper reward")}
                  </div>
                  <div className="mt-0.5 text-micro text-faint">
                    {formatDate(prize.createdAt)} · {prize.prizeType.toLowerCase()}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="prize text-h2 text-gold">
                    {formatMoney(prize.amount, { compactCents: true })}
                  </div>
                  <StatusBadge status={prize.status} className="mt-1" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---- The ladder ------------------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Ladder" title="Milestone rewards" />

        {next && (
          <Card className="mb-3 p-5">
            <div className="flex items-center gap-5">
              <ProgressRing value={qualified} target={next.threshold} size={78} tone="gold">
                <div className="text-center">
                  <div className="num font-display text-lg font-extrabold leading-none text-hi">
                    {qualified}
                  </div>
                  <div className="text-[0.5rem] font-bold uppercase tracking-wider text-faint">of {next.threshold}</div>
                </div>
              </ProgressRing>
              <div className="min-w-0 grow">
                <div className="tag text-faint">Next reward</div>
                <div className="prize mt-1 text-h2 text-gold">
                  {formatMoney(next.prizeAmount, { compactCents: true })}
                </div>
                {next.itemName && (
                  <div className="mt-0.5 text-sm text-mid">or a {next.itemName} — your choice</div>
                )}
                <p className="mt-1.5 text-sm text-mid">
                  <span className="font-bold text-hi">{next.threshold - qualified} more</span>{" "}
                  {next.threshold - qualified === 1 ? "person" : "people"} to unlock
                </p>
              </div>
            </div>
            <Button href="/referrals" variant="primary" size="lg" fullWidth className="mt-4">
              Invite people
            </Button>
          </Card>
        )}

        <div className="space-y-2.5">
          {bumpers.map((bumper) => {
            const award = awards.find((a) => a.bumperEventId === bumper.id);
            const done = qualified >= bumper.threshold;
            return (
              <Card key={bumper.id} tone={done ? "gold" : "default"} className="p-4">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-micro font-extrabold",
                    done ? "bg-gold text-[#1a1206]" : "bg-surface-3 text-mid",
                  )} aria-hidden="true">
                    {done ? "✓" : bumper.threshold}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-bold text-hi">{bumper.name}</span>
                      <span className={cn("prize shrink-0 text-lg", done ? "text-gold" : "text-mid")}>
                        {formatMoney(bumper.prizeAmount, { compactCents: true })}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={qualified} target={bumper.threshold}
                                   tone={done ? "gold" : "mint"} size="sm" />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <Fraction value={qualified} target={bumper.threshold} className="text-micro" />
                      {award && <StatusBadge status={award.status} />}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---- Achievements ----------------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Proof" title={`Achievements (${earned.length}/${achievements.length})`} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {achievements.map((achievement) => (
            <Card
              key={achievement.key}
              tone={achievement.earned ? "mint" : "default"}
              className={cn("p-4", !achievement.earned && "opacity-70")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-hi">{achievement.title}</div>
                  <div className="mt-0.5 text-micro leading-relaxed text-mid">
                    {achievement.description}
                  </div>
                </div>
                {achievement.earned
                  ? <Badge tone="mint" dot>Earned</Badge>
                  : <Badge tone="neutral">Locked</Badge>}
              </div>

              {achievement.progress && (
                <div className="mt-3">
                  <ProgressBar value={achievement.progress.value} target={achievement.progress.target}
                               tone="mint" size="sm" />
                  <div className="mt-1.5">
                    <Fraction value={achievement.progress.value} target={achievement.progress.target}
                              className="text-micro" />
                  </div>
                </div>
              )}
              {achievement.earned && achievement.earnedAt && (
                <div className="mt-2 text-micro text-faint">{formatDate(achievement.earnedAt)}</div>
              )}
            </Card>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
