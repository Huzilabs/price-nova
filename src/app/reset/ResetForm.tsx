"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { completePasswordReset, type AccountState } from "@/server/actions/account";
import { Field, Input } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<AccountState, FormData>(completePasswordReset, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" required hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password"
               required minLength={8} autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" required>
        <Input id="confirmPassword" name="confirmPassword" type="password"
               autoComplete="new-password" required minLength={8} />
      </Field>
      {state.error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
      Set new password
    </Button>
  );
}
