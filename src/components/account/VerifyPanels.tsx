"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestEmailVerification, requestPhoneOtp, confirmPhoneOtp, type AccountState,
} from "@/server/actions/account";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { Field, Input } from "@/components/primitives/Field";

export function VerifyEmailPanel({ email, verifiedAt }: { email: string; verifiedAt: string | null }) {
  const [state, setState] = React.useState<AccountState>({});
  const [pending, start] = React.useTransition();

  return (
    <Card tone={verifiedAt ? "mint" : "default"} className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-hi">Email</div>
          <div className="mt-0.5 truncate text-sm text-mid">{email}</div>
        </div>
        {verifiedAt ? <Badge tone="mint" dot>Verified</Badge> : <Badge tone="warn" dot>Not verified</Badge>}
      </div>

      {!verifiedAt && (
        <>
          <p className="mt-2.5 text-sm leading-relaxed text-mid">
            We&rsquo;ll send a link. Opening it confirms the address.
          </p>
          <Button
            variant="outline" size="md" className="mt-3" loading={pending}
            onClick={() => start(async () => setState(await requestEmailVerification()))}
          >
            Send verification email
          </Button>
        </>
      )}

      {state.error && <p className="mt-2 text-micro text-bad">{state.error}</p>}
      {state.ok && <p className="mt-2 text-micro text-mint">{state.ok}</p>}
    </Card>
  );
}

export function VerifyPhonePanel({ phone, verifiedAt }: { phone: string | null; verifiedAt: string | null }) {
  const [sendState, sendAction] = useActionState<AccountState, FormData>(requestPhoneOtp, {});
  const [codeState, codeAction] = useActionState<AccountState, FormData>(confirmPhoneOtp, {});
  const awaitingCode = Boolean(sendState.ok) && !codeState.ok;

  return (
    <Card tone={verifiedAt ? "mint" : "default"} className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-hi">Phone</div>
          <div className="mt-0.5 truncate text-sm text-mid">{phone ?? "Not added"}</div>
        </div>
        {verifiedAt ? <Badge tone="mint" dot>Verified</Badge> : <Badge tone="warn" dot>Not verified</Badge>}
      </div>

      {!verifiedAt && (
        <div className="mt-3 space-y-3">
          <form action={sendAction} className="flex items-end gap-2">
            <Field label="Mobile number" htmlFor="phone" className="grow">
              <Input id="phone" name="phone" type="tel" inputMode="tel"
                     defaultValue={phone ?? ""} required placeholder="+92 300 1234567" />
            </Field>
            <SendCode label={sendState.ok ? "Resend" : "Send code"} />
          </form>
          {sendState.error && <p className="text-micro text-bad">{sendState.error}</p>}
          {sendState.ok && <p className="text-micro text-mint">{sendState.ok}</p>}

          {awaitingCode && (
            <form action={codeAction} className="flex items-end gap-2">
              <Field label="6-digit code" htmlFor="code" className="grow">
                <Input id="code" name="code" inputMode="numeric" pattern="[0-9]*"
                       maxLength={6} required autoFocus className="mono tracking-[0.4em]"
                       placeholder="000000" />
              </Field>
              <SendCode label="Verify" />
            </form>
          )}
          {codeState.error && <p className="text-micro text-bad">{codeState.error}</p>}
          {codeState.ok && <p className="text-micro text-mint">{codeState.ok}</p>}
        </div>
      )}
    </Card>
  );
}

function SendCode({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="solid" size="lg" loading={pending} className="shrink-0">{label}</Button>;
}
