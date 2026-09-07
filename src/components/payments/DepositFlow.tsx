"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Field, Input, MoneyInput } from "@/components/primitives/Field";
import { QrCode } from "./QrCode";
import { cn } from "@/lib/cn";

export type FlowAccount = {
  id: string;
  type: string;
  label: string;
  method: string;
  payTo: string;
  payToLabel: string;
  accountName: string | null;
  bankName: string | null;
  iban: string | null;
  network: string | null;
  instructions: string | null;
  autoVerify: boolean;
  isCrypto: boolean;
};

type Outcome = { status: string; message: string; credited: boolean; retryable: boolean };

/**
 * The deposit flow: transfer, then tell us the reference.
 *
 * Deliberately one screen with a fixed reading order — amount → where to send
 * it → what to do → what you sent. The user has to leave the app to make the
 * transfer, so everything they need to carry with them is above the inputs,
 * and every value they must copy has a copy button.
 *
 * The Verify button posts to /api/payments/verify and renders whatever the
 * server says. It cannot express success on its own.
 */
export function DepositFlow({
  planName, planAmountLabel, planAmountValue, lockDays, accounts, drawId,
}: {
  planName: string;
  planAmountLabel: string;
  planAmountValue: string;
  lockDays: number;
  accounts: FlowAccount[];
  drawId: string | null;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);

  const [paymentId, setPaymentId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(planAmountValue);
  const [reference, setReference] = React.useState("");

  // Opening the payment record is what ties the reference to an account and a
  // plan server-side. Done on selection so the user is never verifying against
  // nothing.
  React.useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setPaymentId(null);
    setOutcome(null);
    setError(null);
    setStarting(true);

    (async () => {
      try {
        const response = await fetch("/api/payments/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentAccountId: account.id, drawId }),
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) setError(data.error ?? "Could not start the deposit.");
        else setPaymentId(data.paymentId);
      } catch {
        if (!cancelled) setError("Could not start the deposit. Check your connection.");
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [account, drawId]);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard can be blocked; the value is on screen */ }
  };

  const verify = async () => {
    if (!paymentId) return;
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, amount, transactionReference: reference }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Verification failed.");
      else {
        setOutcome(data as Outcome);
        if (data.credited) router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setVerifying(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <Card className="p-6 text-center">
        <div className="tag text-faint">Deposits</div>
        <h2 className="font-display mt-2 text-title font-extrabold text-hi">
          No payment methods available
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-mid">
          Our team has not published a receiving account yet. Please check back shortly.
        </p>
      </Card>
    );
  }

  // ---- Terminal states -------------------------------------------------
  if (outcome?.credited) {
    return (
      <Card tone="gold" className="animate-pop p-6 text-center">
        <div className="text-4xl" aria-hidden="true">✓</div>
        <h2 className="font-display mt-3 text-h2 font-extrabold tracking-[-0.025em] text-hi">
          Payment verified
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mid">
          {planAmountLabel} confirmed. Your {planName} participation is now active.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button href="/" variant="gold" size="lg" fullWidth>See the draw</Button>
          <Button href="/wallet" variant="outline" size="lg" fullWidth>Wallet</Button>
        </div>
      </Card>
    );
  }

  if (outcome && outcome.status === "MANUAL_REVIEW_REQUIRED") {
    return (
      <Card className="p-6 text-center">
        <Badge tone="warn" dot>Manual review</Badge>
        <h2 className="font-display mt-3 text-h2 font-extrabold tracking-[-0.025em] text-hi">
          Reference received
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-mid">{outcome.message}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button href="/wallet" variant="primary" size="lg" fullWidth>View wallet</Button>
          <Button href="/" variant="outline" size="lg" fullWidth>Back to draw</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---- What you are paying ---------------------------------------- */}
      <Card tone="gold" className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="tag text-gold">Deposit for</div>
            <div className="mt-1 truncate text-base font-bold text-hi">{planName}</div>
            <div className="mt-0.5 text-sm text-mid">Locked for {lockDays} days</div>
          </div>
          <div className="prize shrink-0 text-h1 text-gold">{planAmountLabel}</div>
        </div>
      </Card>

      {/* ---- Method ------------------------------------------------------ */}
      <div>
        <div className="tag mb-2 text-faint">Payment method</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => {
            const chosen = a.id === accountId;
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => setAccountId(a.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3.5 text-start transition-colors duration-(--dur-1)",
                  chosen ? "border-mint bg-mint-tint" : "border-line bg-surface hover:border-mid",
                )}
              >
                <span className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  chosen ? "border-mint" : "border-line",
                )}>
                  {chosen && <span className="size-2.5 rounded-full bg-mint" />}
                </span>
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-bold text-hi">{a.label}</span>
                  <span className="block truncate text-micro text-faint">
                    {a.network ?? a.bankName ?? a.payToLabel}
                  </span>
                </span>
                {a.autoVerify && <Badge tone="mint">Auto</Badge>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Where to send ---------------------------------------------- */}
      {account && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line p-5 text-center">
            <div className="tag text-faint">Send exactly</div>
            <div className="prize mt-1 text-h1 text-gold">{planAmountLabel}</div>
          </div>

          <div className="space-y-4 p-5">
            {account.isCrypto && account.payTo && (
              <div className="flex justify-center">
                <div className="rounded-xl bg-white p-2.5">
                  <QrCode value={account.payTo} size={168} />
                </div>
              </div>
            )}

            <div>
              <div className="tag mb-1.5 text-faint">
                {account.payToLabel}{account.network ? ` · ${account.network}` : ""}
              </div>
              <div className="flex items-center gap-2">
                <code className="mono min-w-0 grow break-all rounded-lg border border-line bg-surface-2 px-3 py-3 text-base font-bold text-hi">
                  {account.payTo}
                </code>
                <Button variant="solid" size="lg" className="shrink-0"
                        onClick={() => copy(account.payTo, "payTo")}>
                  {copied === "payTo" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            {(account.accountName || account.bankName || account.iban) && (
              <dl className="divide-y divide-line-soft rounded-lg border border-line">
                {account.accountName && <DetailRow term="Account title" value={account.accountName} />}
                {account.bankName && <DetailRow term="Bank" value={account.bankName} />}
                {account.iban && (
                  <DetailRow term="IBAN" value={account.iban} mono
                             onCopy={() => copy(account.iban!, "iban")}
                             copied={copied === "iban"} />
                )}
              </dl>
            )}

            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <div className="text-sm font-bold text-hi">How to pay</div>
              {account.instructions ? (
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-mid">
                  {account.instructions}
                </p>
              ) : (
                <ol className="mt-1.5 space-y-1.5 text-sm text-mid">
                  <li>1. Open your {account.label} app.</li>
                  <li>2. Send exactly {planAmountLabel} to the {account.payToLabel.toLowerCase()} above.</li>
                  <li>3. Copy the transaction reference from your receipt.</li>
                  <li>4. Enter it below with the amount you sent.</li>
                  <li>5. Press Verify payment.</li>
                </ol>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ---- Confirm what you sent -------------------------------------- */}
      <Card className="p-5">
        <div className="tag text-faint">Confirm your transfer</div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Amount you sent" htmlFor="amount" required>
            <MoneyInput id="amount" value={amount} required
                        onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field
            label={account?.isCrypto ? "Transaction hash" : "Transaction / reference ID"}
            htmlFor="reference"
            required
            hint="Exactly as it appears on your receipt."
          >
            <Input id="reference" value={reference} required className="mono"
                   placeholder={account?.isCrypto ? "0x… or TXID" : "e.g. 1234567890"}
                   onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        {outcome && !outcome.credited && (
          <div className={cn(
            "mt-4 rounded-lg border px-3 py-2.5 text-sm",
            outcome.retryable
              ? "border-gold/30 bg-gold-tint text-gold"
              : "border-bad/30 bg-bad-tint text-bad",
          )}>
            <div className="font-bold">
              {outcome.retryable ? "Not confirmed yet" : "Could not verify"}
            </div>
            <p className="mt-0.5 leading-relaxed">{outcome.message}</p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-bad/30 bg-bad-tint px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <Button
          variant="primary" size="xl" fullWidth shine
          className="mt-4"
          loading={verifying || starting}
          disabled={!paymentId || !reference.trim() || verifying || starting}
          onClick={verify}
        >
          {verifying ? "Checking with the provider"
            : starting ? "Preparing"
            : outcome?.retryable ? "Check again"
            : "Verify payment"}
        </Button>

        <p className="mt-3 text-micro leading-relaxed text-faint">
          We confirm your payment with the provider before crediting anything. Entering a
          reference does not by itself credit your account, and a reference can only ever
          be used once.
        </p>
      </Card>
    </div>
  );
}

function DetailRow({
  term, value, mono, onCopy, copied,
}: {
  term: string; value: string; mono?: boolean;
  onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3">
      <dt className="shrink-0 text-sm text-mid">{term}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <span className={cn("truncate text-sm text-hi", mono && "mono")}>{value}</span>
        {onCopy && (
          <Button variant="ghost" size="sm" onClick={onCopy} className="shrink-0">
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </dd>
    </div>
  );
}
