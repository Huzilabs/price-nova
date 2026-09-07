import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getDraw, getMainDraw, categorise } from "@/server/services/draw";
import { AppShell } from "@/components/shell/AppShell";
import { Card, SectionHead, EmptyState } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { JoinForm } from "./JoinForm";
import { publicAccounts } from "@/server/payments/accounts";
import { formatMoney } from "@/lib/money";
import { formatDayMonth } from "@/lib/format";

export const metadata = { title: "Participate" };
export const dynamic = "force-dynamic";

/**
 * The participate flow.
 *
 * This page exists because the previous build had none: entering a draw meant
 * finding a page called "Wallet", spotting a card called "Deposit" and opening
 * a sheet. Three hops, and the word "participate" appeared nowhere. Now every
 * draw CTA lands here, the draw being entered is named at the top, and the
 * plan choice is the only decision on screen.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ draw?: string }>;
}) {
  const session = await getSessionUser();
  const { draw: drawId } = await searchParams;

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/join${drawId ? `?draw=${drawId}` : ""}`)}`);
  }

  const [draw, plans, methods, participation, user] = await Promise.all([
    drawId ? getDraw(drawId) : getMainDraw(),
    db.plan.findMany({ where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } }),
    publicAccounts(),
    db.participation.findFirst({
      where: { userId: session.id, status: "ACTIVE" },
      include: { plan: true },
    }),
    db.user.findUniqueOrThrow({
      where: { id: session.id },
      select: { emailVerifiedAt: true, phoneVerifiedAt: true },
    }),
  ]);

  const pendingDeposit = await db.deposit.findFirst({
    where: { userId: session.id, status: "PENDING" },
    include: { plan: true },
  });

  const topTier = draw?.prizeTiers[0];
  const category = draw ? categorise(draw) : null;

  return (
    <AppShell session={session}>
      <div className="tag text-faint">Participate</div>
      <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">
        {draw ? "Enter this draw" : "Start participating"}
      </h1>

      {draw && topTier && (
        <Card tone="gold" className="mt-4 flex items-center gap-4 p-4">
          <div className="min-w-0 grow">
            <div className="tag text-gold">{category === "UPCOMING" ? "Opens soon" : "Entering"}</div>
            <div className="mt-1 truncate text-lg font-bold text-hi">{draw.name}</div>
            <div className="mt-0.5 text-sm text-mid">
              Entries close {formatDayMonth(draw.entryCutoffAt)}
            </div>
          </div>
          <div className="prize shrink-0 text-h2 text-gold">
            {formatMoney(topTier.prizeAmount, { compactCents: true })}
          </div>
        </Card>
      )}

      {pendingDeposit ? (
        <Card className="mt-5 p-5">
          <Badge tone="warn" dot>Awaiting confirmation</Badge>
          <h2 className="mt-3 font-display text-title font-extrabold text-hi">
            Your deposit is being checked
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mid">
            You submitted {formatMoney(pendingDeposit.amount)} for {pendingDeposit.plan.name}.
            The moment our team confirms the payment your participation activates and you are
            entered in the draw. Nothing else is needed from you.
          </p>
          <Button href="/wallet" variant="solid" size="lg" fullWidth className="mt-4">
            View wallet
          </Button>
        </Card>
      ) : participation ? (
        <Card tone="mint" className="mt-5 p-5">
          <Badge tone="mint" dot>You are in</Badge>
          <h2 className="mt-3 font-display text-title font-extrabold text-hi">
            {participation.plan.name} is active
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mid">
            You are entered in every draw that opens while this participation is active.
            Your entry number is issued when entries close.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button href={draw ? `/draws/${draw.id}` : "/draws"} variant="primary" size="lg" fullWidth>
              {draw ? "View the draw" : "Browse draws"}
            </Button>
            <Button href="/referrals" variant="outline" size="lg" fullWidth>
              Invite friends
            </Button>
          </div>
        </Card>
      ) : plans.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="No plans available"
          description="Participation plans have not been published yet. Check back shortly."
        />
      ) : (
        <div className="mt-5">
          <SectionHead kicker="Step 1" title="Choose your plan" />
          <JoinForm
            drawId={draw?.id ?? null}
            plans={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              description: plan.description,
              amount: formatMoney(plan.depositAmount, { compactCents: true }),
              amountValue: formatMoney(plan.depositAmount, { symbol: false }),
              lockDays: plan.lockPeriodDays,
              commission: formatMoney(plan.commissionAmount, { compactCents: true }),
              drawEligible: plan.drawEligible,
            }))}
            accounts={methods}
            emailVerified={Boolean(user.emailVerifiedAt)}
            phoneVerified={Boolean(user.phoneVerifiedAt)}
          />
        </div>
      )}
    </AppShell>
  );
}
