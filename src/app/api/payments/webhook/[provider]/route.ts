import { NextResponse } from "next/server";
import type { PaymentProvider } from "@prisma/client";
import { adapterByKey } from "@/server/payments/registry";
import { applyUpdate } from "@/server/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider webhooks.
 *
 * The only route in the application that can move a payment to SUCCESS. The
 * browser cannot: the checkout page's "payment complete" redirect is a
 * navigation hint, and the UI reads state from the database rather than from
 * anything the provider handed the client.
 *
 * Order of operations is deliberate:
 *   1. Read the RAW body first. Signatures are computed over exact bytes, so
 *      parsing before verifying would make the check meaningless.
 *   2. Verify the signature. A failure returns 401 and touches nothing.
 *   3. Hand the normalised update to the service, which owns idempotency,
 *      the amount re-check and the single ledger credit.
 *
 * Always 200 for anything we have accepted and recorded — including duplicates.
 * Returning an error for a duplicate makes providers retry forever.
 */
const PROVIDERS: Record<string, PaymentProvider> = {
  jazzcash: "JAZZCASH",
  easypaisa: "EASYPAISA",
  card_gateway: "CARD_GATEWAY",
  crypto_gateway: "CRYPTO_GATEWAY",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: slug } = await params;
  const key = PROVIDERS[slug.toLowerCase()];
  if (!key) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  const adapter = adapterByKey(key);
  if (!adapter || !adapter.isConfigured()) {
    // Nothing can be verified without a secret, so nothing is accepted.
    return NextResponse.json({ error: "Provider not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });

  let update;
  try {
    update = await adapter.verifyWebhook({ headers, rawBody });
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  if (!update) {
    // Signature invalid, missing, stale, or the payload was not one we act on.
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  const result = await applyUpdate(update, "webhook");
  return NextResponse.json({ received: true, ...result }, { status: 200 });
}

/** Some gateways probe the endpoint with GET before enabling it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const key = PROVIDERS[provider.toLowerCase()];
  if (!key) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const adapter = adapterByKey(key);
  return NextResponse.json({
    provider: key,
    configured: adapter?.isConfigured() ?? false,
    sandbox: adapter?.isSandbox() ?? null,
  });
}
