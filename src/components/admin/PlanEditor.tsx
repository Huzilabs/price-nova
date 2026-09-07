"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updatePlan, type ActionState } from "@/server/actions/admin";
import { Field, Input, MoneyInput, Select } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";
import { StatusBadge } from "@/components/primitives/Badge";

type Plan = {
  id: string; name: string; status: string;
  depositAmount: string; commissionAmount: string;
  lockPeriodDays: number; drawEligible: boolean;
  requiresPrincipal: boolean; participations: number;
};

/**
 * Plans are configuration, so they are edited in place rather than behind a
 * separate form page. Collapsed by default: an operator scanning the list
 * usually wants the values, not the inputs.
 */
export function PlanEditor({ plan }: { plan: Plan }) {
  const [state, action] = useActionState<ActionState, FormData>(updatePlan, {});
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-b border-line-soft pb-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
        <div className="min-w-[9rem]">
          <div className="text-sm font-medium text-hi">{plan.name}</div>
          <div className="text-micro text-mid">{plan.participations} participation(s)</div>
        </div>
        <StatusBadge status={plan.status} />
        <span className="num text-sm text-hi">
          ${plan.depositAmount}
          <span className="ms-1 text-micro text-mid">deposit</span>
        </span>
        <span className="num text-sm text-hi">
          ${plan.commissionAmount}
          <span className="ms-1 text-micro text-mid">commission</span>
        </span>
        <span className="num text-sm text-hi">
          {plan.lockPeriodDays}
          <span className="ms-1 text-micro text-mid">day lock</span>
        </span>
        {plan.drawEligible && <span className="text-micro text-mid">Draw eligible</span>}
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      {open && (
        <form action={action} className="mb-3 grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
          <input type="hidden" name="planId" value={plan.id} />

          <Field label="Name" htmlFor={`name-${plan.id}`}>
            <Input id={`name-${plan.id}`} name="name" defaultValue={plan.name} />
          </Field>
          <Field label="Deposit amount" htmlFor={`deposit-${plan.id}`}>
            <MoneyInput id={`deposit-${plan.id}`} name="depositAmount" defaultValue={plan.depositAmount} />
          </Field>
          <Field label="Commission per referral" htmlFor={`commission-${plan.id}`}>
            <MoneyInput id={`commission-${plan.id}`} name="commissionAmount" defaultValue={plan.commissionAmount} />
          </Field>
          <Field label="Lock period (days)" htmlFor={`lock-${plan.id}`} hint="Rule (ii) sets this to 40 for Plan 1.">
            <Input id={`lock-${plan.id}`} name="lockPeriodDays" type="number" min={0} defaultValue={plan.lockPeriodDays} numeric />
          </Field>
          <Field label="Status" htmlFor={`status-${plan.id}`}>
            <Select id={`status-${plan.id}`} name="status" defaultValue={plan.status}>
              <option value="DRAFT">Draft — not selectable</option>
              <option value="ACTIVE">Active</option>
              <option value="RETIRED">Retired</option>
            </Select>
          </Field>

          <div className="flex flex-col justify-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="drawEligible" defaultChecked={plan.drawEligible} className="accent-[var(--color-mint)]" />
              Includes draw entry
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresPrincipal" defaultChecked={plan.requiresPrincipal} className="accent-[var(--color-mint)]" />
              Commission needs active principal
            </label>
          </div>

          <div className="sm:col-span-3">
            <p className="mb-2 text-micro text-mid">
              Changing these values affects new participations. Existing participations keep the
              terms they were created under, and the change is written to the audit log.
            </p>
            {state.error && <p className="mb-2 text-micro text-bad">{state.error}</p>}
            {state.ok && <p className="mb-2 text-micro text-mint">{state.ok}</p>}
            <Save />
          </div>
        </form>
      )}
    </div>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" loading={pending}>Save plan</Button>;
}
