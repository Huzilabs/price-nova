import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { refresh, cancel } from "@/server/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payments/status?reference=…
 *
 * Read-only status for the crypto waiting screen. It re-asks the gateway
 * through the same verified path a webhook uses, so polling can advance a
 * payment but never fabricate one.
 */
export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const reference = new URL(request.url).searchParams.get("reference") ?? "";
  if (!reference) return NextResponse.json({ error: "Missing reference." }, { status: 400 });

  const owned = await db.payment.count({ where: { reference, userId: session.id } });
  if (owned === 0) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  const payment = await refresh(reference);
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  return NextResponse.json({
    status: payment.status,
    confirmations: payment.confirmations,
    requiredConfirmations: payment.requiredConfirmations,
    txHash: payment.txHash,
    receivedCrypto: payment.receivedCrypto,
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    failureReason: payment.failureReason,
  });
}

/** DELETE — the user abandoning a crypto payment they never sent. */
export async function DELETE(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const reference = new URL(request.url).searchParams.get("reference") ?? "";
  if (!reference) return NextResponse.json({ error: "Missing reference." }, { status: 400 });

  await cancel(reference, session.id);
  return NextResponse.json({ cancelled: true });
}
