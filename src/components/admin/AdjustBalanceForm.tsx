"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { adjustBalance, type ActionState } from "@/server/actions/admin";
import { Field, MoneyInput, Select } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";

/**
 * Section 14: adjustments never edit history. This posts a new, signed ledger
 * transaction attributed to the admin, with the reason stored alongside it.
 */
export function AdjustBalanceForm({ userId, userName }: { userId: string; userName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(adjustBalance, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Direction" htmlFor="direction">
          <Select id="direction" name="direction" defaultValue="credit">
            <option value="credit">Credit (increase)</option>
            <option value="debit">Debit (decrease)</option>
          </Select>
        </Field>
        <Field label="Amount" htmlFor="amount">
          <MoneyInput id="amount" name="amount" placeholder="0.00" required />
        </Field>
      </div>

      <Field label="Reason" htmlFor="reason" required hint="Stored in the ledger and the audit log.">
        <textarea
          id="reason" name="reason" rows={2} required
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-base transition-colors duration-(--dur-1) focus:border-mint focus:bg-surface"
          placeholder="e.g. Goodwill credit for delayed payout #1043"
        />
      </Field>

      <p className="text-micro leading-relaxed text-mid">
        This posts a new transaction against {userName}&rsquo;s available balance. Historical
        entries are never modified.
      </p>

      {state.error && <p className="text-micro text-bad">{state.error}</p>}
      {state.ok && <p className="text-micro text-mint">{state.ok}</p>}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="solid" loading={pending}>Post adjustment</Button>;
}
