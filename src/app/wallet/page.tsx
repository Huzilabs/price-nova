import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import * as settings from "@/server/services/settings";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHead, Card, EmptyState } from "@/components/primitives/Card";
import { Badge, StatusBadge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { ProgressBar } from "@/components/primitives/Progress";
import { DepositPanel } from "@/components/wallet/DepositPanel";
import { WithdrawPanel } from "@/components/wallet/WithdrawPanel";
import { getMovements } from "@/server/queries/activity";
import { MovementRow } from "@/components/wallet/MovementRow";
import { formatMoney, splitMoney } from "@/lib/money";
import { formatDayMonth, formatDate, daysUntil } from "@/lib/format";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

/**
 * The wallet.
 *
 * The one screen that is allowed to be calm. It still is not a banking app —
 * balances are big and plain-spoken, each one says what it is *for* rather
 * than what accounting bucket it belongs to, and a locked balance shows the
 * date it frees up instead of just sitting there greyed out.
 */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await requireUser();
  const { welcome } = await searchParams;

  const [user, entries, windows, payoutMethods] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        wallet: true,
        participations: { where: { status: "ACTIVE" }, include: { plan: true }, take: 1 },
        deposits: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 5 },
        withdrawals: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
    getMovements(session.id, 8),
    Promise.all((["COMMISSION", "PRIZE", "BUMPER", "PRINCIPAL"] as const).map(
      async (kind) => ({ kind, ...(await settings.isWithdrawalWindowOpen(kind)) }),
    )),
    // Payout rails are not checkout rails: you can pay by card but you cannot
    // be paid out to one here, so withdrawals get their own list.
    settings.get<string[]>("payout.methods", ["USDT_TRC20", "USDT_ERC20", "EASYPAISA", "JAZZCASH"]),
  ]);

  const wallet = user.wallet;
  const participation = user.participations[0] ?? null;
  const available = wallet?.available ?? 0n;
  const { whole, cents } = splitMoney(available);
  const anyWindowOpen = windows.some((w) => w.open);

  return (
    <AppShell session={session} balance={formatMoney(available, { compactCents: true })}>
      {welcome && (
        <Card tone="mint" className="mb-5 p-4">
          <div className="text-sm font-bold text-hi">Account created 🎉</div>
          <p className="mt-1 text-sm leading-relaxed text-mid">
            One deposit activates your participation and puts you in this month&rsquo;s draw.
          </p>
        </Card>
      )}

      {/* ---- Balance ----------------------------------------------------- */}
      <section className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <div className="tag text-faint">Available to use</div>
        <div className="mt-2 font-display text-mega font-extrabold tracking-[-0.04em] text-hi">
          <span className="text-[0.42em] align-[0.55em] text-mid">$</span>
          {whole}
          <span className="text-[0.5em] text-mid">.{cents}</span>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-line border-y border-line">
          {[
            ["Locked", formatMoney(wallet?.locked ?? 0n, { compactCents: true }), "text-gold"],
            ["Pending", formatMoney(wallet?.pending ?? 0n, { compactCents: true }), "text-mid"],
            ["Earned", formatMoney(wallet?.lifetimeEarned ?? 0n, { compactCents: true }), "text-mint"],
          ].map(([label, value, tone]) => (
            <div key={label} className="px-2 py-3">
              <div className={`num text-lg font-bold ${tone}`}>{value}</div>
              <div className="tag mt-0.5 text-faint">{label}</div>
            </div>
          ))}
        </div>

        {participation?.principalUnlocksAt && (wallet?.locked ?? 0n) > 0n && (
          <div className="mt-4 text-start">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-mid">Principal unlocks</span>
              <span className="font-bold text-hi">
                {formatDayMonth(participation.principalUnlocksAt)}
                <span className="ms-1.5 text-mid">
                  ({daysUntil(participation.principalUnlocksAt)} days)
                </span>
              </span>
            </div>
            <ProgressBar
              value={Math.max(0, participation.plan.lockPeriodDays - daysUntil(participation.principalUnlocksAt))}
              target={participation.plan.lockPeriodDays}
              tone="gold"
            />
          </div>
        )}
      </section>

      {/* ---- Actions ------------------------------------------------------ */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DepositPanel hasParticipation={Boolean(participation)} />
        <WithdrawPanel
          available={formatMoney(available)}
          availableMinor={available.toString()}
          windows={windows}
          methods={payoutMethods}
          anyOpen={anyWindowOpen}
        />
      </div>

      {/* ---- Withdrawal windows ------------------------------------------- */}
      <section className="mt-8">
        <SectionHead kicker="Timing" title="When you can withdraw" />
        <Card className="divide-y divide-line-soft">
          {windows.map((w) => (
            <div key={w.kind} className="flex items-center justify-between gap-4 p-3.5">
              <div className="min-w-0">
                <div className="text-sm font-bold text-hi">{titleFor(w.kind)}</div>
                <div className="mt-0.5 text-micro text-faint">{w.reason}</div>
              </div>
              <Badge tone={w.open ? "mint" : "neutral"} dot={w.open}>
                {w.open ? "Open" : "Closed"}
              </Badge>
            </div>
          ))}
        </Card>
      </section>

      {/* ---- Activity ------------------------------------------------------ */}
      <section className="mt-8">
        <SectionHead
          kicker="Records"
          title="Recent movements"
          action={<Button href="/activity" variant="ghost" size="sm">View all</Button>}
        />
        {entries.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Deposits, commission and prizes appear here the moment they are recorded in the ledger."
          />
        ) : (
          <div className="space-y-2">
            {entries.map((movement) => <MovementRow key={movement.id} movement={movement} />)}
          </div>
        )}
      </section>

      {(user.deposits.length > 0 || user.withdrawals.length > 0) && (
        <section className="mt-8">
          <SectionHead kicker="Requests" title="Deposits & withdrawals" />
          <div className="space-y-2">
            {user.deposits.map((d) => (
              <Card key={d.id} tone="raised" className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 grow">
                  <div className="text-sm font-bold text-hi">Deposit · {d.plan.name}</div>
                  <div className="text-micro text-faint">
                    {d.method.replace(/_/g, " ")} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <StatusBadge status={d.status} />
                <span className="num shrink-0 text-sm font-bold text-hi">{formatMoney(d.amount)}</span>
              </Card>
            ))}
            {user.withdrawals.map((w) => (
              <Card key={w.id} tone="raised" className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 grow">
                  <div className="text-sm font-bold text-hi">Withdrawal · {w.sourceKind}</div>
                  <div className="text-micro text-faint">
                    {w.method.replace(/_/g, " ")} · {formatDate(w.createdAt)}
                  </div>
                </div>
                <StatusBadge status={w.status} />
                <span className="num shrink-0 text-sm font-bold text-mid">{formatMoney(w.amount)}</span>
              </Card>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function titleFor(kind: string): string {
  return {
    COMMISSION: "Referral commission",
    PRIZE: "Draw prizes",
    BUMPER: "Bumper rewards",
    PRINCIPAL: "Your deposit",
  }[kind] ?? kind;
}

