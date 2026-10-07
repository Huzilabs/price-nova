"use client";

import * as React from "react";
import { useActionState } from "react";
import { requestWithdrawal, type WalletState } from "@/server/actions/wallet";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { Field, Input, MoneyInput, Select } from "@/components/primitives/Field";
import { Badge } from "@/components/primitives/Badge";
import { Sheet, Submit } from "./DepositPanel";
import { formatMoney, parseMoney } from "@/lib/money";
import { formatBps, withdrawalFee } from "@/lib/fees";

export function WithdrawPanel({
  available, availableMinor, windows, methods, anyOpen, feeBps, verified,
}: {
  available: string;
  availableMinor: string;
  windows: Array<{ kind: string; open: boolean; reason: string }>;
  methods: string[];
  anyOpen: boolean;
  /** Withdrawal fee in basis points (200 = 2%), from the server's setting. */
  feeBps: number;
  /** Email and phone both verified — required to withdraw. */
  verified: boolean;
}) {
  const [state, action, submitting] = useActionState<WalletState, FormData>(requestWithdrawal, {});
  const [open, setOpen] = React.useState(false);
  const openKinds = windows.filter((w) => w.open);
  const [amountText, setAmountText] = React.useState("");

  // Live preview of the fee. The server recomputes it on submit; this only
  // shows the participant the same arithmetic before they commit.
  let gross: bigint | null = null;
  try { gross = amountText.trim() ? parseMoney(amountText) : null; } catch { gross = null; }
  const fee = gross != null && gross > 0n ? withdrawalFee(gross, feeBps) : null;

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
        {hasFunds && !verified ? (
          <>
            <p className="mt-2 text-micro leading-relaxed text-gold">
              Verify your email and phone number to withdraw.
            </p>
            <Button href="/profile" variant="solid" size="lg" fullWidth className="mt-3">
              Verify to withdraw
            </Button>
          </>
        ) : (
          <Button
            variant="solid" size="lg" fullWidth className="mt-4"
            onClick={() => setOpen(true)}
            disabled={!hasFunds || !anyOpen}
          >
            {!hasFunds ? "No funds yet" : anyOpen ? "Withdraw" : "Window closed"}
          </Button>
        )}
        {state.ok && <p className="mt-2 text-micro font-semibold text-mint">{state.ok}</p>}
      </Card>

      {open && (
        <Sheet title="Withdraw funds" onClose={() => setOpen(false)}>
          <form
            className="space-y-4"
            // Submitted by hand: React resets a form after an `action` completes,
            // which wiped the destination address whenever a request was refused.
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              React.startTransition(() => action(data));
            }}
          >
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
              <MoneyInput id="amount" name="amount" required placeholder="0.00"
                          value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            </Field>

            {feeBps > 0 && (
              <dl className="divide-y divide-line-soft rounded-xl border border-line text-sm">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <dt className="text-mid">Withdrawal fee ({formatBps(feeBps)})</dt>
                  <dd className="num text-mid">{fee != null ? `−${formatMoney(fee)}` : "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <dt className="font-bold text-hi">You receive</dt>
                  <dd className="num text-base font-extrabold text-mint">
                    {gross != null && fee != null ? formatMoney(gross - fee) : "—"}
                  </dd>
                </div>
              </dl>
            )}

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
                {feeBps > 0 && ` A ${formatBps(feeBps)} fee applies to every withdrawal and is only charged when it is paid — a rejected request is returned in full.`}
              </p>
            </div>

            {state.error && (
              <p role="alert" className="rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
                {state.error}
              </p>
            )}
            <Submit label="Request withdrawal" pending={submitting} />
          </form>
        </Sheet>
      )}
    </>
  );
}
