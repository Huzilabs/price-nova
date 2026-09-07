"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestPasswordReset, type AccountState } from "@/server/actions/account";
import { Field, Input } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";

export function ForgotForm() {
  const [state, action] = useActionState<AccountState, FormData>(requestPasswordReset, {});

  if (state.ok) {
    return (
      <p className="rounded-lg border border-mint/30 bg-mint-tint px-4 py-3 text-sm leading-relaxed text-mint">
        {state.ok}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      {state.error && <p className="text-micro text-bad">{state.error}</p>}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
      Send reset link
    </Button>
  );
}
