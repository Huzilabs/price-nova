import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getAccount, methodForAccount } from "@/server/payments/accounts";
import { startPayment } from "@/server/payments/service";
import { ProviderUnconfiguredError } from "@/server/payments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/start
 *
 * Opens the payment record for a chosen receiving account. The plan and the
 * amount are read from the database — the body supplies only which account the
 * user intends to pay into.
 */
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const paymentAccountId = typeof body.paymentAccountId === "string" ? body.paymentAccountId : "";
  if (!paymentAccountId) return NextResponse.json({ error: "Choose a payment method." }, { status: 400 });

  const account = await getAccount(paymentAccountId);
  if (!account || !account.enabled) {
    // A disabled method must not be usable even if the id is guessed.
    return NextResponse.json({ error: "That payment method is not available." }, { status: 400 });
  }

  const plan = await db.plan.findFirst({
    where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" },
  });
  if (!plan) return NextResponse.json({ error: "No plan is open for participation." }, { status: 400 });

  try {
    const result = await startPayment({
      userId: session.id,
      planId: plan.id,
      method: methodForAccount(account.type, account.network),
      fields: {},
      origin: process.env.APP_URL ?? new URL(request.url).origin,
      paymentAccountId: account.id,
    });
    return NextResponse.json({
      paymentId: result.payment.id,
      reference: result.payment.reference,
      reused: result.reused,
    });
  } catch (error) {
    if (error instanceof ProviderUnconfiguredError) {
      return NextResponse.json(
        { error: "That payment method is temporarily unavailable." }, { status: 503 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the deposit." },
      { status: 400 },
    );
  }
}
