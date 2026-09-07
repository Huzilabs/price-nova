"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/primitives/Card";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { ProgressBar } from "@/components/primitives/Progress";
import { QrCode } from "./QrCode";
import type { PaymentStatus } from "@prisma/client";
import { cn } from "@/lib/cn";

/** Mirrors the database enum so a new status cannot silently go unhandled. */
type Status = PaymentStatus;

/**
 * The crypto waiting room.
 *
 * Polls the server, which re-asks the gateway and runs the same verified path a
 * webhook does — so this screen advances even when a callback is delayed, and
 * it can never invent a success: every status it renders came from the
 * database after server-side verification.
 */
export function CryptoCheckout({
  reference, asset, network, address, amount, fiat, initialStatus,
  initialConfirmations, requiredConfirmations, expiresAt, txHash,
}: {
  reference: string;
  asset: string;
  network: string;
  address: string;
  amount: string;
  fiat: string;
  initialStatus: Status;
  initialConfirmations: number;
  requiredConfirmations: number;
  expiresAt: string | null;
  txHash: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status>(initialStatus);
  const [confirmations, setConfirmations] = React.useState(initialConfirmations);
  const [required, setRequired] = React.useState(requiredConfirmations);
  const [hash, setHash] = React.useState(txHash);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState<"address" | "amount" | null>(null);

  const settled = ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"].includes(status);

  // Countdown to expiry.
  React.useEffect(() => {
    if (!expiresAt || settled) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, settled]);

  // Poll. Backs off once the chain has seen it — confirmations are slow.
  React.useEffect(() => {
    if (settled) return;
    let cancelled = false;

    const poll = async () => {
      const next = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelled || !next) return;
      setStatus(next.status as Status);
      setConfirmations(next.confirmations);
      setRequired(next.requiredConfirmations);
      setHash(next.txHash);
      if (next.status === "SUCCESS") router.refresh();
    };

    const interval = status === "CONFIRMING" || status === "PAYMENT_DETECTED" ? 15_000 : 8_000;
    const id = window.setInterval(poll, interval);
    void poll();
    return () => { cancelled = true; window.clearInterval(id); };
  }, [reference, status, settled, router]);

  const copy = async (value: string, which: "address" | "amount") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard can be blocked; the value is on screen anyway */ }
  };

  // BIP-21 style URI so wallets prefill the amount.
  const uri = asset === "BTC"
    ? `bitcoin:${address}?amount=${amount}`
    : address;

  if (status === "SUCCESS") {
    return (
      <Card tone="gold" className="animate-pop p-6 text-center">
        <div className="text-4xl" aria-hidden="true">🎉</div>
        <h2 className="font-display mt-3 text-h2 font-extrabold tracking-[-0.025em] text-hi">
          Payment confirmed
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mid">
          {fiat} deposited successfully. Your participation is now active.
        </p>
        {hash && (
          <p className="mono mt-3 truncate text-micro text-faint">{hash}</p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button href="/" variant="gold" size="lg" fullWidth>See the draw</Button>
          <Button href="/wallet" variant="outline" size="lg" fullWidth>Wallet</Button>
        </div>
      </Card>
    );
  }

  if (settled) {
    return (
      <Card className="p-6 text-center">
        <Badge tone={status === "EXPIRED" ? "warn" : "bad"} dot>{status.replace(/_/g, " ")}</Badge>
        <h2 className="font-display mt-3 text-h2 font-extrabold tracking-[-0.025em] text-hi">
          {status === "EXPIRED" ? "Payment window closed" : "Payment not completed"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mid">
          Nothing was credited. If you already sent funds, contact support with your
          reference — do not send again.
        </p>
        <p className="mono mt-3 text-micro text-faint">{reference}</p>
        <Button href="/join" variant="primary" size="lg" className="mt-5">Start over</Button>
      </Card>
    );
  }

  const detected = status === "PAYMENT_DETECTED" || status === "CONFIRMING";

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-5 text-center">
          <div className="tag text-faint">Send exactly</div>
          <div className="prize mt-1.5 text-h1 text-gold">{amount} {asset}</div>
          <div className="mt-1 text-sm text-mid">{fiat} · network {network}</div>
        </div>

        <div className="flex flex-col items-center gap-4 p-5">
          <div className="rounded-xl bg-white p-2.5">
            <QrCode value={uri} size={180} />
          </div>

          <div className="w-full">
            <div className="tag mb-1.5 text-faint">Payment address</div>
            <div className="flex items-center gap-2">
              <code className="mono min-w-0 grow break-all rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-hi">
                {address}
              </code>
              <Button variant="solid" size="md" className="shrink-0" onClick={() => copy(address, "address")}>
                {copied === "address" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="w-full">
            <div className="tag mb-1.5 text-faint">Amount</div>
            <div className="flex items-center gap-2">
              <code className="mono min-w-0 grow rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-hi">
                {amount}
              </code>
              <Button variant="solid" size="md" className="shrink-0" onClick={() => copy(amount, "amount")}>
                {copied === "amount" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </div>

        {remaining !== null && (
          <div className="border-t border-line px-5 py-3.5 text-center">
            <span className="tag text-faint">Expires in </span>
            <span className={cn("num text-base font-bold", remaining < 300_000 ? "text-coral" : "text-hi")}>
              {String(Math.floor(remaining / 60_000)).padStart(2, "0")}
              :{String(Math.floor((remaining % 60_000) / 1000)).padStart(2, "0")}
            </span>
          </div>
        )}
      </Card>

      {/* ---- Live status ------------------------------------------------ */}
      <Card tone={detected ? "mint" : "raised"} className="p-4">
        <div className="flex items-center gap-2.5">
          {detected
            ? <Badge tone="mint" dot>Payment detected</Badge>
            : <Badge tone="neutral" dot>Waiting for payment</Badge>}
          {!detected && (
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-float rounded-full bg-mid"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm leading-relaxed text-mid">
          {detected
            ? "Confirming on the network. You can close this page — your deposit credits automatically."
            : "Send the exact amount to the address above. We detect it automatically; there is nothing to submit."}
        </p>

        {detected && required > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-mid">Confirmations</span>
              <span className="num font-bold text-hi">{confirmations} / {required}</span>
            </div>
            <ProgressBar value={confirmations} target={required} tone="mint" />
          </div>
        )}

        {hash && <p className="mono mt-3 truncate text-micro text-faint">{hash}</p>}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="mono text-micro text-faint">{reference}</p>
        <Button
          variant="ghost" size="sm"
          onClick={async () => {
            await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, { method: "DELETE" });
            router.refresh();
          }}
        >
          Cancel payment
        </Button>
      </div>
    </div>
  );
}
