"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile, changePassword, type AccountState } from "@/server/actions/account";
import { Field, Input } from "@/components/primitives/Field";
import { Button } from "@/components/primitives/Button";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name" htmlFor="fullName" required>
        <Input id="fullName" name="fullName" defaultValue={fullName} required />
      </Field>
      <Field label="Email" htmlFor="email" hint="Contact support to change your email address.">
        <Input id="email" defaultValue={email} readOnly disabled />
      </Field>
      {state.error && <p className="text-micro text-bad">{state.error}</p>}
      {state.ok && <p className="text-micro text-mint">{state.ok}</p>}
      <Save label="Save changes" />
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Current password" htmlFor="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password"
               autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters.">
        <Input id="newPassword" name="newPassword" type="password"
               autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <Input id="confirmPassword" name="confirmPassword" type="password"
               autoComplete="new-password" required minLength={8} />
      </Field>
      <p className="text-micro text-faint">Changing your password signs you out everywhere.</p>
      {state.error && <p className="text-micro text-bad">{state.error}</p>}
      <Save label="Change password" />
    </form>
  );
}

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" size="lg" loading={pending}>{label}</Button>;
}
