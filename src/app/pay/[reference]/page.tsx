import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getByReference } from "@/server/payments/service";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/primitives/Card";
import { Badge, StatusBadge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { CryptoCheckout } from "@/components/payments/CryptoCheckout";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

/**
 * One payment, live.
 *
 * Crypto gets the address/QR/confirmation screen. Hosted checkouts (card,
 * Easypaisa, JazzCash) land back here after the provider redirects, showing
 * whatever the *database* says — never whatever the return URL claimed.
 */
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const session = await getSessionUser();
  const { reference } = await params;
  if (!session) redirect(`/login?next=${encodeURIComponent(`/pay/${reference}`)}`);

  const payment = await getByReference(reference, session.id);
  if (!payment) notFound();

  const fiat = formatMoney(payment.expectedAmount);
  const isCrypto = Boolean(payment.receivingAddress && payment.cryptoAmount);
  const settled = ["SUCCESS", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"].includes(payment.status);

  return (
    <AppShell session={session}>
      <div className="tag text-faint">Payment</div>
      <h1 className="font-display text-h1 font-extrabold tracking-[-0.03em] text-hi">
        {payment.plan.name}
      </h1>
      <p className="mt-1.5 text-sm text-mid">
        {fiat} · {payment.method.replace(/_/g, " ")}
      </p>

      <div className="mt-5">
        {isCrypto ? (
          <CryptoCheckout
            reference={payment.reference}
            asset={payment.cryptoAsset ?? "USDT"}
            network={payment.cryptoNetwork ?? ""}
            address={payment.receivingAddress!}
            amount={payment.cryptoAmount!}
            fiat={fiat}
            initialStatus={payment.status}
            initialConfirmations={payment.confirmations}
            requiredConfirmations={payment.requiredConfirmations}
            expiresAt={payment.expiresAt?.toISOString() ?? null}
            txHash={payment.txHash}
          />
        ) : payment.status === "SUCCESS" ? (
          <Card tone="gold" className="animate-pop p-6 text-center">
            <div className="text-4xl" aria-hidden="true">🎉</div>
            <h2 className="font-display mt-3 text-h2 font-extrabold tracking-[-0.025em] text-hi">
              Payment confirmed
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-mid">
              {fiat} deposited successfully. Your participation is now active.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button href="/" variant="gold" size="lg" fullWidth>See the draw</Button>
              <Button href="/wallet" variant="outline" size="lg" fullWidth>Wallet</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={payment.status} />
              {payment.provider === "MANUAL" && <Badge tone="neutral">Manual review</Badge>}
            </div>

            <h2 className="font-display mt-3 text-title font-extrabold text-hi">
              {payment.provider === "MANUAL"
                ? "Waiting for our team"
                : settled ? "Payment not completed" : "Waiting for the provider"}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-mid">
              {payment.provider === "MANUAL"
                ? "We're matching your transfer against the reference you gave us. Your participation activates as soon as it's confirmed."
                : settled
                  ? (payment.failureReason ?? "Nothing was credited. You can start a new payment.")
                  : "Complete the payment with your provider. This page updates on its own once they confirm — you don't need to tell us."}
            </p>

            {payment.checkoutUrl && !settled && (
              <Button href={payment.checkoutUrl} variant="primary" size="lg" fullWidth className="mt-4">
                Continue payment
              </Button>
            )}
            {settled && (
              <Button href="/join" variant="primary" size="lg" fullWidth className="mt-4">
                Start over
              </Button>
            )}

            <p className="mono mt-4 text-micro text-faint">{payment.reference}</p>
          </Card>
        )}
      </div>

      {payment.events.length > 0 && (
        <section className="mt-8">
          <div className="tag mb-2 text-faint">Payment history</div>
          <Card className="divide-y divide-line-soft">
            {payment.events.map((event) => (
              <div key={event.id} className="flex items-baseline justify-between gap-3 p-3">
                <span className="text-sm text-hi">
                  {event.toStatus ? event.toStatus.replace(/_/g, " ").toLowerCase() : event.type}
                </span>
                <span className="mono shrink-0 text-micro text-faint">
                  {formatDateTime(event.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </AppShell>
  );
}
