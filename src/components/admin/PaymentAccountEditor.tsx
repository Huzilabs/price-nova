"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { savePaymentAccount, togglePaymentAccount, type AccountState } from "@/server/actions/payment-accounts";
import { Card } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Field, Input, Select, Textarea } from "@/components/primitives/Field";
import { Sheet } from "@/components/wallet/DepositPanel";

export type AccountValues = {
  id?: string;
  type: string;
  label: string;
  enabled: boolean;
  autoVerify: boolean;
  sortOrder: number;
  accountName: string;
  accountNumber: string;
  bankName: string;
  iban: string;
  network: string;
  walletAddress: string;
  instructions: string;
};

const BLANK: AccountValues = {
  type: "EASYPAISA", label: "", enabled: false, autoVerify: false, sortOrder: 0,
  accountName: "", accountNumber: "", bankName: "", iban: "",
  network: "", walletAddress: "", instructions: "",
};

/** One row per configured account, with its edit sheet. */
export function AccountEditor({ account }: { account: AccountValues }) {
  const [toggleState, toggleAction] = useActionState<AccountState, FormData>(togglePaymentAccount, {});
  const [open, setOpen] = React.useState(false);
  const isCrypto = account.type === "CRYPTO";
  const destination = isCrypto ? account.walletAddress : account.accountNumber;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[10rem]">
          <div className="text-sm font-bold text-hi">{account.label}</div>
          <div className="text-micro text-faint">{account.type.replace(/_/g, " ")}</div>
        </div>

        <Badge tone={account.enabled ? "mint" : "neutral"} dot={account.enabled}>
          {account.enabled ? "Live" : "Disabled"}
        </Badge>
        <Badge tone={account.autoVerify ? "info" : "neutral"}>
          {account.autoVerify ? "Auto-verify" : "Manual review"}
        </Badge>

        <span className="mono min-w-0 grow truncate text-sm text-mid">
          {destination || <span className="text-bad">no destination set</span>}
          {account.network ? ` · ${account.network}` : ""}
        </span>

        <form action={toggleAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={account.id} />
          <Toggle enabled={account.enabled} />
        </form>
        <Button size="sm" variant="solid" onClick={() => setOpen(true)}>Edit</Button>
      </div>

      {toggleState.error && <p className="mt-2 text-micro text-bad">{toggleState.error}</p>}
      {toggleState.ok && <p className="mt-2 text-micro text-mint">{toggleState.ok}</p>}

      {open && (
        <Sheet title={`Edit ${account.label}`} onClose={() => setOpen(false)}>
          <AccountForm initial={account} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </Card>
  );
}

export function NewAccountButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>Add account</Button>
      {open && (
        <Sheet title="Add payment account" onClose={() => setOpen(false)}>
          <AccountForm initial={BLANK} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

function AccountForm({ initial, onDone }: { initial: AccountValues; onDone: () => void }) {
  const [state, action] = useActionState<AccountState, FormData>(savePaymentAccount, {});
  const [type, setType] = React.useState(initial.type);

  React.useEffect(() => { if (state.ok) onDone(); }, [state.ok, onDone]);

  const isCrypto = type === "CRYPTO";
  const isBank = type === "BANK_TRANSFER";

  return (
    <form action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="type" required>
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="EASYPAISA">Easypaisa</option>
            <option value="JAZZCASH">JazzCash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CRYPTO">Crypto</option>
          </Select>
        </Field>

        <Field label="Label participants see" htmlFor="label" required>
          <Input id="label" name="label" defaultValue={initial.label} required
                 placeholder={isCrypto ? "USDT · TRC20" : "Easypaisa"} />
        </Field>

        {isCrypto ? (
          <>
            <Field label="Network" htmlFor="network" required
                   hint="TRC20, ERC20, BEP20 or Bitcoin. Decides which chain we expect.">
              <Input id="network" name="network" defaultValue={initial.network} placeholder="TRC20" />
            </Field>
            <Field label="Wallet address" htmlFor="walletAddress" required className="sm:col-span-2">
              <Input id="walletAddress" name="walletAddress" defaultValue={initial.walletAddress}
                     className="mono" placeholder="T… / bc1… / 0x…" />
            </Field>
          </>
        ) : (
          <>
            <Field label={isBank ? "Account number" : "Mobile number"} htmlFor="accountNumber" required>
              <Input id="accountNumber" name="accountNumber" defaultValue={initial.accountNumber}
                     className="mono" placeholder={isBank ? "0001234567890" : "03001234567"} />
            </Field>
            <Field label="Account title" htmlFor="accountName">
              <Input id="accountName" name="accountName" defaultValue={initial.accountName} />
            </Field>
            {isBank && (
              <>
                <Field label="Bank name" htmlFor="bankName">
                  <Input id="bankName" name="bankName" defaultValue={initial.bankName} />
                </Field>
                <Field label="IBAN" htmlFor="iban">
                  <Input id="iban" name="iban" defaultValue={initial.iban} className="mono" />
                </Field>
              </>
            )}
          </>
        )}

        <Field label="Display order" htmlFor="sortOrder">
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={initial.sortOrder} numeric />
        </Field>
      </div>

      <Field label="Instructions" htmlFor="instructions"
             hint="Shown verbatim under the account. Leave blank for the default steps.">
        <Textarea id="instructions" name="instructions" rows={4} defaultValue={initial.instructions} />
      </Field>

      <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3.5 text-sm">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="enabled" defaultChecked={initial.enabled}
                 className="mt-0.5 accent-[var(--color-mint)]" />
          <span>
            <span className="font-bold text-hi">Enabled</span>
            <span className="block text-micro text-mid">Shown at checkout. Needs a destination first.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="autoVerify" defaultChecked={initial.autoVerify}
                 className="mt-0.5 accent-[var(--color-mint)]" />
          <span>
            <span className="font-bold text-hi">Attempt automatic verification</span>
            <span className="block text-micro text-mid">
              Only works if that provider has API credentials. Otherwise payments go to
              manual review regardless.
            </span>
          </span>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <Save />
    </form>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={enabled ? "ghost" : "outline"} loading={pending}>
      {enabled ? "Disable" : "Enable"}
    </Button>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>Save account</Button>;
}
