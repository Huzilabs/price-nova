import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHead, Card, EmptyState } from "@/components/primitives/Card";
import { ProgressBar, ProgressRing, Fraction } from "@/components/primitives/Progress";
import { Badge, LevelBadge } from "@/components/primitives/Badge";
import { Avatar } from "@/components/reward/WinnerCard";
import { ShareBlock } from "@/components/reward/ShareBlock";
import { Button } from "@/components/primitives/Button";
import { formatMoney } from "@/lib/money";
import { formatDayMonth } from "@/lib/format";

export const metadata = { title: "Your team" };
export const dynamic = "force-dynamic";

/**
 * The team page.
 *
 * Framed as building a squad rather than administering a referral programme —
 * a roster, a ladder and one obvious action. What it deliberately is *not* is a
 * genealogy tree with downlines and levels: that is the visual language of the
 * schemes this product needs to not resemble, and it would also be a lie here,
 * because commission is single-level by design.
 */
export default async function ReferralsPage() {
  const session = await requireUser();

  const [user, referrals, bumpers, commissions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.id }, include: { wallet: true } }),
    db.referral.findMany({
      where: { referrerId: session.id },
      include: { referred: { include: { participations: { where: { status: "ACTIVE" }, take: 1 } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.bumperEvent.findMany({ where: { status: "ACTIVE" }, orderBy: { threshold: "asc" } }),
    db.commission.findMany({ where: { userId: session.id } }),
  ]);

  const qualifying = referrals.filter((r) => r.qualified).length;
  const pending = referrals.length - qualifying;
  const earned = commissions.reduce((total, c) => total + c.amount, 0n);
  const next = bumpers.find((b) => b.threshold > qualifying);
  const remaining = next ? next.threshold - qualifying : 0;

  return (
    <AppShell session={session}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="tag text-faint">Your team</div>
          <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">
            Build your squad
          </h1>
        </div>
        <LevelBadge referrals={qualifying} />
      </div>

      {/* ---- The ladder ------------------------------------------------- */}
      <Card className="mt-5 p-5">
        <div className="flex items-center gap-5">
          <ProgressRing value={qualifying} target={next?.threshold ?? qualifying} size={82} tone="mint">
            <div className="text-center">
              <div className="num font-display text-title font-extrabold leading-none text-hi">{qualifying}</div>
              <div className="text-[0.5rem] font-bold uppercase tracking-wider text-faint">players</div>
            </div>
          </ProgressRing>

          <div className="min-w-0 grow">
            {next ? (
              <>
                <div className="text-sm text-mid">
                  <span className="font-bold text-hi">{remaining} more</span>{" "}
                  {remaining === 1 ? "player" : "players"} to unlock
                </div>
                <div className="prize mt-1 text-h2 text-gold">
                  {formatMoney(next.prizeAmount, { compactCents: true })}
                </div>
                {next.itemName && (
                  <div className="mt-0.5 text-sm text-mid">or a {next.itemName} — your choice</div>
                )}
              </>
            ) : (
              <div className="text-sm text-mid">
                Every milestone unlocked. You are earning{" "}
                <span className="font-bold text-mint">
                  {formatMoney(earned, { compactCents: true })}
                </span>{" "}
                in commission.
              </div>
            )}
          </div>
        </div>

        {next && (
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <Fraction value={qualifying} target={next.threshold} className="text-sm" />
              <span className="tag text-faint">{next.name}</span>
            </div>
            <ProgressBar value={qualifying} target={next.threshold} tone="mint" size="lg" />
          </div>
        )}
      </Card>

      {/* ---- Share -------------------------------------------------------- */}
      <section className="mt-6">
        <SectionHead kicker="Grow" title="Invite friends" />
        <ShareBlock code={user.referralCode} />
      </section>

      {/* ---- Counters ------------------------------------------------------ */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          ["Qualifying", qualifying.toLocaleString(), "text-hi"],
          ["Pending", pending.toLocaleString(), "text-gold"],
          ["Earned", formatMoney(earned, { compactCents: true }), "text-mint"],
        ].map(([label, value, tone]) => (
          <Card key={label} tone="raised" className="px-3 py-4 text-center">
            <div className={`font-display text-title font-extrabold tracking-[-0.02em] ${tone}`}>{value}</div>
            <div className="tag mt-1 text-faint">{label}</div>
          </Card>
        ))}
      </div>

      {/* ---- Milestones ---------------------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Ladder" title="Milestones" />
        <div className="space-y-2.5">
          {bumpers.map((bumper) => {
            const done = qualifying >= bumper.threshold;
            const pct = Math.min(100, (qualifying / bumper.threshold) * 100);
            return (
              <Card key={bumper.id} tone={done ? "gold" : "default"} className="p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full text-micro font-extrabold ${
                      done ? "bg-gold text-[#1a1206]" : "bg-surface-3 text-mid"
                    }`}
                    aria-hidden="true"
                  >
                    {done ? "✓" : bumper.threshold}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-bold text-hi">{bumper.name}</span>
                      <span className={`prize shrink-0 text-lg ${done ? "text-gold" : "text-mid"}`}>
                        {formatMoney(bumper.prizeAmount, { compactCents: true })}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={qualifying} target={bumper.threshold} tone={done ? "gold" : "mint"} size="sm" />
                    </div>
                    <div className="mt-1.5 num text-micro text-faint">{Math.round(pct)}%</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---- Roster --------------------------------------------------------- */}
      <section className="mt-8">
        <SectionHead
          kicker="Roster"
          title={`${referrals.length} ${referrals.length === 1 ? "player" : "players"}`}
        />
        {referrals.length === 0 ? (
          <EmptyState
            title="Your team is empty"
            description="Share your code. When someone joins and makes a qualifying deposit, they join your roster and you earn commission."
            action={<Button href="#" variant="primary">Copy your link above</Button>}
          />
        ) : (
          <div className="space-y-2">
            {referrals.map((referral) => (
              <Card key={referral.id} tone="raised" className="flex items-center gap-3 p-3">
                <Avatar name={referral.referred.fullName} size={36} />
                <div className="min-w-0 grow">
                  <div className="truncate text-sm font-bold text-hi">{referral.referred.fullName}</div>
                  <div className="text-micro text-faint">Joined {formatDayMonth(referral.createdAt)}</div>
                </div>
                {referral.qualified ? (
                  <Badge tone="mint" dot>+{formatMoney(3_00n, { compactCents: true })}</Badge>
                ) : (
                  <Badge tone="neutral">Awaiting deposit</Badge>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-micro leading-relaxed text-faint">
        Commission is paid once per person, when they complete a qualifying deposit,
        and requires your own participation to stay active. Withdrawing your principal
        ends future commission.
      </p>
    </AppShell>
  );
}
