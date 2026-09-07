import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHead, Card, EmptyState } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { MovementRow } from "@/components/wallet/MovementRow";
import { getMovements, type Movement } from "@/server/queries/activity";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

/** Grouped by day, because "when" is how people look for a transaction. */
export default async function ActivityPage() {
  const session = await requireUser();

  const [movements, notifications] = await Promise.all([
    getMovements(session.id, 100),
    db.notification.findMany({
      where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 20,
    }),
  ]);

  const days = new Map<string, Movement[]>();
  for (const movement of movements) {
    const key = formatDate(movement.at);
    const list = days.get(key);
    if (list) list.push(movement);
    else days.set(key, [movement]);
  }

  return (
    <AppShell session={session}>
      <div className="tag text-faint">Records</div>
      <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">Activity</h1>
      <p className="mt-2 text-sm leading-relaxed text-mid">
        Every movement of money on your account. Transfers between your own balances
        are shown as one entry, not two.
      </p>

      {notifications.length > 0 && (
        <section className="mt-7">
          <SectionHead kicker="Updates" title="Notifications" />
          <div className="space-y-2">
            {notifications.slice(0, 5).map((n) => (
              <Card key={n.id} tone={n.readAt ? "default" : "raised"} className="p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-hi">{n.title}</span>
                  <span className="shrink-0 text-micro text-faint">{formatDate(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-mid">{n.body}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionHead kicker="Ledger" title="All movements" />
        {movements.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Your deposits, commission and prizes appear here the moment they are recorded."
            action={<Button href="/wallet" variant="primary">Make a deposit</Button>}
          />
        ) : (
          <div className="space-y-6">
            {[...days.entries()].map(([day, rows]) => (
              <div key={day}>
                <div className="tag mb-2 text-faint">{day}</div>
                <div className="space-y-2">
                  {rows.map((movement) => <MovementRow key={movement.id} movement={movement} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
