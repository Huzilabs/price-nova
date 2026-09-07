"use client";

import * as React from "react";
import { DepositFlow, type FlowAccount } from "@/components/payments/DepositFlow";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { cn } from "@/lib/cn";

type Plan = {
  id: string; name: string; description: string | null;
  /** Display form, e.g. "$10". */
  amount: string;
  /** Raw decimal for prefilling the amount input, e.g. "10.00". */
  amountValue: string;
  lockDays: number; commission: string; drawEligible: boolean;
};

/**
 * Pick a plan, then pick how to pay.
 *
 * Two steps, in that order, because the amount has to be settled before a
 * provider charge can be opened. The old single form asked for a plan and a
 * TXID at once; the TXID field is gone from every automated method — the
 * provider tells us when payment lands, the user does not.
 */
export function JoinForm({
  drawId, plans, accounts, emailVerified, phoneVerified,
}: {
  drawId: string | null;
  plans: Plan[];
  accounts: FlowAccount[];
  emailVerified: boolean;
  phoneVerified: boolean;
}) {
  const [planId, setPlanId] = React.useState(plans[0]?.id ?? "");
  const selected = plans.find((p) => p.id === planId);

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        {plans.map((plan) => (
          <label
            key={plan.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-(--dur-1)",
              planId === plan.id ? "border-gold bg-gold-tint" : "border-line bg-surface hover:border-mid",
            )}
          >
            <input
              type="radio" name="planChoice" value={plan.id}
              checked={planId === plan.id}
              onChange={() => setPlanId(plan.id)}
              className="sr-only"
            />
            <span className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
              planId === plan.id ? "border-gold" : "border-line",
            )}>
              {planId === plan.id && <span className="size-2.5 rounded-full bg-gold" />}
            </span>

            <span className="min-w-0 grow">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-base font-bold text-hi">{plan.name}</span>
                <span className="prize shrink-0 text-title text-gold">{plan.amount}</span>
              </span>
              {plan.description && (
                <span className="mt-1 block text-sm leading-relaxed text-mid">{plan.description}</span>
              )}
              <span className="mt-2 flex flex-wrap gap-1.5">
                {plan.drawEligible && <Badge tone="mint">Draw entry</Badge>}
                <Badge tone="neutral">{plan.lockDays}-day lock</Badge>
                <Badge tone="neutral">{plan.commission} per referral</Badge>
              </span>
            </span>
          </label>
        ))}
      </div>

      {(!emailVerified || !phoneVerified) && (
        <Card tone="raised" className="p-4">
          <div className="text-sm font-bold text-hi">Finish verifying your account</div>
          <p className="mt-1 text-sm leading-relaxed text-mid">
            {!emailVerified && !phoneVerified
              ? "Your email and phone are not verified yet."
              : !emailVerified ? "Your email is not verified yet."
              : "Your phone is not verified yet."}{" "}
            Verification may be required before withdrawing.
          </p>
          <Button href="/profile" variant="outline" size="md" className="mt-3">Verify now</Button>
        </Card>
      )}

      {selected && (
        <DepositFlow
          planName={selected.name}
          planAmountLabel={selected.amount}
          planAmountValue={selected.amountValue}
          lockDays={selected.lockDays}
          accounts={accounts}
          drawId={drawId}
        />
      )}
    </div>
  );
}
