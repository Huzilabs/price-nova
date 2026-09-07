"use client";

import * as React from "react";
import { useActionState } from "react";
import { requestWithdrawal, type WalletState } from "@/server/actions/wallet";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { Field, Input, MoneyInput, Select } from "@/components/primitives/Field";
import { Badge } from "@/components/primitives/Badge";
import { Sheet, Submit } from "./DepositPanel";

export function WithdrawPanel({
  available, availableMinor, windows, methods, anyOpen,
}: {
  available: string;
  availableMinor: string;
  windows: Array<{ kind: string; open: boolean; reason: string }>;
  methods: string[];
  anyOpen: boolean;
}) {
  const [state, action] = useActionState<WalletState, FormData>(requestWithdrawal, {});
  const [open, setOpen] = React.useState(false);
  const openKinds = windows.filter((w) => w.open);

  React.useEffect(() => { if (state.ok) setOpen(false); }, [state.ok]);

  const hasFunds = BigInt(availableMinor) > 0n;

  return (
    <>
      <Card className="p-5">
        <div className="tag text-faint">Cash out</div>
        <div className="mt-1.5 font-display text-title font-extrabold tracking-[-0.02em] text-hi">
          Withdraw
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-mid">
          {!hasFunds
            ? "Nothing available yet. Commission and prizes land here."
            : anyOpen
              ? `${available} ready to withdraw.`
              : "Withdrawal windows are closed right now."}
        </p>
        <Button
          variant="solid" size="lg" fullWidth className="mt-4"
          onClick={() => setOpen(true)}
          disabled={!hasFunds || !anyOpen}
        >
          {!hasFunds ? "No funds yet" : anyOpen ? "Withdraw" : "Window closed"}
        </Button>
        {state.ok && <p className="mt-2 text-micro font-semibold text-mint">{state.ok}</p>}
      </Card>

      {open && (
        <Sheet title="Withdraw funds" onClose={() => setOpen(false)}>
          <form action={action} className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-center">
              <div className="tag text-faint">Available</div>
              <div className="num mt-1 text-h2 font-extrabold text-hi">{available}</div>
            </div>

            <Field label="Source" htmlFor="sourceKind" required
                   hint="Each source has its own withdrawal window.">
              <Select id="sourceKind" name="sourceKind" required defaultValue={openKinds[0]?.kind}>
                {windows.map((w) => (
                  <option key={w.kind} value={w.kind} disabled={!w.open}>
                    {w.kind}{w.open ? "" : " — closed"}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Amount" htmlFor="amount" required>
              <MoneyInput id="amount" name="amount" required placeholder="0.00" />
            </Field>

            <Field label="Send to" htmlFor="method" required>
              <Select id="method" name="method" required defaultValue={methods[0] ?? ""}>
                {methods.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>

            <Field label="Destination" htmlFor="destination" required
                   hint="Wallet address or mobile account number. Check it carefully — payouts cannot be reversed.">
              <Input id="destination" name="destination" required className="mono" placeholder="TXk9… or 03001234567" />
            </Field>

            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center gap-2">
                <Badge tone="mint" dot>Reserved immediately</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-mid">
                The amount leaves your available balance the moment you request it, so it
                cannot be spent twice while our team reviews the payout.
              </p>
            </div>

            {state.error && (
              <p role="alert" className="rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
                {state.error}
              </p>
            )}
            <Submit label="Request withdrawal" />
          </form>
        </Sheet>
      )}
    </>
  );
}
