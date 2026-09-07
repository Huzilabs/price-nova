import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getPublicHome, getMemberHome } from "@/server/queries/home";
import { DrawHero, DrawHeroEmpty } from "@/components/draw/DrawHero";
import { categorise } from "@/server/services/draw";
import { SectionHead, Card, EmptyState } from "@/components/primitives/Card";
import { RewardCard, type RewardState } from "@/components/reward/RewardCard";
import { WinnerCard } from "@/components/reward/WinnerCard";
import { WinnerBanner } from "@/components/reward/WinnerBanner";
import { MovementRow } from "@/components/wallet/MovementRow";
import { getMovements } from "@/server/queries/activity";
import { ProgressBar, Fraction } from "@/components/primitives/Progress";
import { Button } from "@/components/primitives/Button";
import { LevelBadge } from "@/components/primitives/Badge";
import { AppShell } from "@/components/shell/AppShell";
import { formatMoney } from "@/lib/money";
import { formatDayMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionUser();
  const pub = await getPublicHome();
  const me = session ? await getMemberHome(session.id) : null;

  const myEntries = pub.draw && session
    ? await db.drawEntry.count({ where: { drawId: pub.draw.id, userId: session.id } })
    : 0;

  const topTier = pub.draw?.prizeTiers[0] ?? null;
  const isParticipating = Boolean(me?.participation);
  const qualifying = me?.qualifying ?? 0;

  // Grouped movements for the activity strip; empty for a brand-new account.
  const movements = session ? await getMovements(session.id, 4) : [];

  return (
    <AppShell session={session} balance={me?.wallet ? formatMoney(me.wallet.available, { compactCents: true }) : undefined}>
      {/* ---- 0. A confirmed win outranks everything else on the page. --- */}
      {me?.latestWin && (
        <div className="mb-5">
          <WinnerBanner
            drawId={me.latestWin.drawId}
            drawName={me.latestWin.draw.name}
            prize={formatMoney(me.latestWin.prizeTier.prizeAmount, { compactCents: true })}
          />
        </div>
      )}

      {/* ---- 1. The prize and the clock. Always first. ------------------ */}
      {pub.draw ? (
        <DrawHero
          id={pub.draw.id}
          name={pub.draw.name}
          description={pub.draw.description}
          imageUrl={pub.draw.imageUrl}
          prize={topTier?.prizeAmount ?? null}
          startsAt={pub.draw.startsAt}
          drawAt={pub.draw.drawAt}
          entryCutoffAt={pub.draw.entryCutoffAt}
          participants={pub.draw._count.entries}
          myEntries={myEntries}
          isSignedIn={Boolean(session)}
          isParticipating={isParticipating}
          upcoming={categorise(pub.draw) === "UPCOMING"}
        />
      ) : (
        <DrawHeroEmpty otherDraws={pub.otherDraws.length} />
      )}

      {/* Every other draw lives one tap away. */}
      {pub.otherDraws.length > 0 && (
        <div className="mt-4">
          <Button href="/draws" variant="outline" size="lg" fullWidth>
            See other draws
            <span className="ms-2 rounded-full bg-surface-3 px-2 py-0.5 text-micro font-bold text-mid">
              {pub.otherDraws.length}
            </span>
          </Button>
        </div>
      )}

      {/* ---- 2. Your progress. Only for members. ------------------------ */}
      {me && (
        <section className="mt-8">
          <SectionHead
            kicker="Your progress"
            title="Team & rewards"
            action={<LevelBadge referrals={qualifying} />}
          />

          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="tag text-faint">Team size</div>
                <div className="font-display mt-1 text-h1 font-extrabold tracking-[-0.03em] text-hi">
                  {qualifying.toLocaleString()}
                  <span className="ms-2 text-lg font-bold text-faint">
                    {qualifying === 1 ? "player" : "players"}
                  </span>
                </div>
              </div>
              <div className="text-end">
                <div className="tag text-faint">Commission earned</div>
                <div className="prize mt-1 text-h2 text-mint">
                  {formatMoney(me.commissionEarned, { compactCents: true })}
                </div>
              </div>
            </div>

            {(() => {
              const next = pub.bumpers.find((b) => b.threshold > qualifying);
              if (!next) {
                return (
                  <p className="mt-4 text-sm text-mid">
                    Every milestone unlocked. Nicely done.
                  </p>
                );
              }
              const remaining = next.threshold - qualifying;
              return (
                <>
                  <div className="mt-5 mb-2 flex items-baseline justify-between">
                    <Fraction value={qualifying} target={next.threshold} className="text-sm" />
                    <span className="text-sm font-bold text-gold">
                      {formatMoney(next.prizeAmount, { compactCents: true })}
                      {next.itemName ? ` or ${next.itemName}` : ""}
                    </span>
                  </div>
                  <ProgressBar value={qualifying} target={next.threshold} tone="mint" size="lg" />
                  <p className="mt-3 text-sm text-mid">
                    <span className="font-bold text-hi">{remaining} more</span>{" "}
                    {remaining === 1 ? "player" : "players"} to unlock the {next.name} reward.
                  </p>
                  <Button href="/referrals" variant="primary" size="lg" fullWidth className="mt-4">
                    Invite friends
                  </Button>
                </>
              );
            })()}
          </Card>
        </section>
      )}

      {/* ---- 3. Rewards ladder ------------------------------------------ */}
      <section className="mt-8">
        <SectionHead
          kicker="Rewards"
          title="What you can unlock"
          action={session ? <Button href="/referrals" variant="ghost" size="sm">Details</Button> : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {pub.bumpers.map((bumper) => {
            const claimed = me?.awards.some(
              (a) => a.bumperEventId === bumper.id && a.status === "ISSUED",
            );
            const ready = me?.awards.some(
              (a) => a.bumperEventId === bumper.id && a.status !== "ISSUED",
            );
            const state: RewardState = claimed ? "claimed" : ready ? "ready" : qualifying > 0 ? "in-progress" : "locked";

            return (
              <RewardCard
                key={bumper.id}
                title={bumper.name}
                prize={
                  bumper.itemName
                    ? `${bumper.itemName} or ${formatMoney(bumper.prizeAmount, { compactCents: true })}`
                    : formatMoney(bumper.prizeAmount, { compactCents: true })
                }
                requirement={`Bring ${bumper.threshold.toLocaleString()} people who complete a qualifying deposit.`}
                value={qualifying}
                target={bumper.threshold}
                state={state}
                href={session ? "/referrals" : "/signup"}
                ctaLabel={session ? "Invite friends" : "Get started"}
                note={bumper.winnerChooses ? "You choose the bike or the cash." : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* ---- 3b. Your recent activity ----------------------------------- */}
      {session && (
        <section className="mt-8">
          <SectionHead
            kicker="Records"
            title="Recent activity"
            action={<Button href="/activity" variant="ghost" size="sm">View all</Button>}
          />
          {movements.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Your deposits, commission and prizes appear here as soon as they are recorded."
              action={<Button href="/join" variant="primary">Participate</Button>}
            />
          ) : (
            <div className="space-y-2">
              {movements.map((movement) => (
                <MovementRow key={movement.id} movement={movement} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---- 4. Recent winners — the proof ------------------------------ */}
      <section className="mt-8">
        <SectionHead
          kicker="Proof"
          title="Recent winners"
          action={<Button href="/draws" variant="ghost" size="sm">All draws</Button>}
        />
        {pub.winners.length === 0 ? (
          <EmptyState
            title="No winners yet"
            description="The first monthly draw has not run. Winners appear here with their prize the moment one is announced."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pub.winners.map((winner) => (
              <WinnerCard
                key={winner.id}
                name={winner.name}
                prize={formatMoney(winner.prize, { compactCents: true })}
                drawName={winner.drawName}
                date={formatDayMonth(winner.date)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---- 5. Platform proof, for visitors ---------------------------- */}
      {!session && (
        <section className="mt-8">
          <Card tone="raised" className="grid grid-cols-3 divide-x divide-line">
            {[
              ["Active players", pub.stats.activeParticipants.toLocaleString()],
              ["Prizes paid", formatMoney(pub.stats.prizesPaid, { compactCents: true })],
              ["Commission paid", formatMoney(pub.stats.commissionPaid, { compactCents: true })],
            ].map(([label, value]) => (
              <div key={label} className="px-3 py-5 text-center">
                <div className="font-display text-title font-extrabold tracking-[-0.02em] text-hi">{value}</div>
                <div className="tag mt-1 text-faint">{label}</div>
              </div>
            ))}
          </Card>

          <Card tone="gold" className="mt-4 p-6 text-center">
            <h2 className="font-display text-h2 font-extrabold tracking-[-0.025em] text-hi">
              Ready to join?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mid">
              One deposit enters you in every monthly draw and starts your team. Every
              payment is recorded in an auditable ledger you can inspect.
            </p>
            <Button href="/signup" variant="gold" size="xl" shine className="mt-5 w-full sm:w-auto sm:min-w-64">
              Create your account
            </Button>
            <p className="mt-3 text-micro text-faint">
              Takes a minute. No payment until you choose a plan.
            </p>
          </Card>
        </section>
      )}
    </AppShell>
  );
}
