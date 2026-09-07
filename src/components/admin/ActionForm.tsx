"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/primitives/Button";
import type { ActionState } from "@/server/actions/admin";

/**
 * A financial action with its consequence stated before it fires.
 *
 * Section 45: approving a payout or selecting a winner moves real money, so
 * the button opens a confirmation naming the user, the amount and the effect —
 * rather than firing on a single click.
 */
export function ActionForm({
  action, hidden, label, variant = "solid", size = "sm",
  confirm, reasonRequired = false, disabled,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  confirm?: React.ReactNode;
  reasonRequired?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => { if (state.ok) setOpen(false); }, [state.ok]);

  if (!confirm && !reasonRequired) {
    return (
      <form action={formAction} className="inline-flex items-center">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Submit label={label} variant={variant} size={size} disabled={disabled} />
        <Feedback state={state} />
      </form>
    );
  }

  return (
    <>
      <Button size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {state.error && !open && <p className="mt-1 text-micro text-bad">{state.error}</p>}
      {state.ok && !open && <p className="mt-1 text-micro text-mint">{state.ok}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-lift">
            <h2 className="text-lg font-semibold text-hi">{label}</h2>
            <div className="mt-3 text-sm leading-relaxed text-mid">{confirm}</div>

            <form action={formAction} className="mt-4">
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              {reasonRequired && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-mid">
                    Reason <span className="text-bad">*</span>
                  </span>
                  <textarea
                    name="reason" required rows={3}
                    className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-base transition-colors duration-(--dur-1) focus:border-mint focus:bg-surface"
                    placeholder="Recorded in the audit log against your account."
                  />
                </label>
              )}
              {state.error && <p className="mt-2 text-micro text-bad">{state.error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>Cancel</Button>
                <Submit label={label} variant={variant} size="md" />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Submit({ label, variant, size, disabled }: {
  label: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending} disabled={disabled}>
      {label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <span className="ms-2 text-micro text-bad">{state.error}</span>;
  if (state.ok) return <span className="ms-2 text-micro text-mint">{state.ok}</span>;
  return null;
}
