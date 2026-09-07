"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type SignUpState } from "@/server/actions/auth";
import { Field, Input } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";

export function SignUpForm({
  defaultCode, lockedReferrer,
}: { defaultCode: string; lockedReferrer: boolean }) {
  const [state, action] = useActionState<SignUpState, FormData>(signUp, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="Your name" htmlFor="fullName" error={state.field === "fullName" ? state.error : undefined}>
        <Input id="fullName" name="fullName" autoComplete="name" required autoFocus placeholder="Ayesha Khan" />
      </Field>

      <Field label="Email" htmlFor="email" error={state.field === "email" ? state.error : undefined}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.field === "password" ? state.error : undefined}
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>

      <Field
        label="Referral code"
        htmlFor="referralCode"
        hint={lockedReferrer ? undefined : "Optional — if a friend invited you."}
        error={state.field === "referralCode" ? state.error : undefined}
      >
        {lockedReferrer ? (
          <div className="flex items-center gap-2">
            <Input id="referralCode" name="referralCode" defaultValue={defaultCode} readOnly className="mono" />
            <Badge tone="mint" dot>Applied</Badge>
          </div>
        ) : (
          <Input
            id="referralCode" name="referralCode" defaultValue={defaultCode}
            className="mono uppercase" placeholder="PN-XXXXXX" autoCapitalize="characters"
          />
        )}
      </Field>

      {state.error && !state.field && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}

      <Submit />

      <p className="text-micro leading-relaxed text-faint">
        By creating an account you agree to the terms of participation. PriceNova does
        not guarantee returns; prizes depend on draws and referral milestones.
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
      {pending ? "Creating account" : "Create account"}
    </Button>
  );
}
