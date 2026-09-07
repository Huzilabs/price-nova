import { db } from "@/lib/db";
import { PageHeader } from "@/components/primitives/PageHeader";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await db.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { participations: true } } },
  });

  return (
    <>
      <PageHeader
        title="Plans"
        description="Plan 1 is defined by the handwritten notes. Plans 2–5 are drafts awaiting values — a draft plan is not selectable by participants."
      />

      <div className="space-y-2">
        {plans.map((plan) => (
          <PlanEditor
            key={plan.id}
            plan={{
              id: plan.id,
              name: plan.name,
              status: plan.status,
              depositAmount: formatMoney(plan.depositAmount, { symbol: false }),
              commissionAmount: formatMoney(plan.commissionAmount, { symbol: false }),
              lockPeriodDays: plan.lockPeriodDays,
              drawEligible: plan.drawEligible,
              requiresPrincipal: plan.commissionRequiresActivePrincipal,
              participations: plan._count.participations,
            }}
          />
        ))}
      </div>
    </>
  );
}
