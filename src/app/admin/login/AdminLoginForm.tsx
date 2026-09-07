"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { adminSignIn, type SignInState } from "@/server/actions/auth";
import { Field, Input } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";

export function AdminLoginForm() {
  const [state, action] = useActionState<SignInState, FormData>(adminSignIn, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="Administrator email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username"
               required autoFocus invalid={Boolean(state.error)} />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password"
               autoComplete="current-password" required invalid={Boolean(state.error)} />
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
    <Button type="submit" variant="gold" size="lg" fullWidth loading={pending}>
      {pending ? "Verifying" : "Enter console"}
    </Button>
  );
}
