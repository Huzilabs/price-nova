"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type SignInState } from "@/server/actions/auth";
import { Field, Input } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email"
               required autoFocus placeholder="you@example.com" invalid={Boolean(state.error)} />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password"
               autoComplete="current-password" required invalid={Boolean(state.error)} />
      </Field>

      <div className="text-end">
        <a href="/forgot" className="text-sm font-semibold text-mint hover:underline">
          Forgot your password?
        </a>
      </div>

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
      {pending ? "Signing in" : "Sign in"}
    </Button>
  );
}
