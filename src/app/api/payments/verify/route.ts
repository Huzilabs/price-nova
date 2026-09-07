import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { verifyPayment, VerifyError } from "@/server/payments/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/verify
 *
 * The endpoint the Verify Payment button calls. Everything it needs to trust
 * comes from the session and the database; the body supplies only the two
 * things the user genuinely knows — what they sent and its reference.
 *
 * Note what is NOT accepted from the body: no status, no "verified" flag, no
 * receiving account, no plan price. A client cannot express "this succeeded".
 */
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const reference = typeof body.transactionReference === "string" ? body.transactionReference : "";
  const amountRaw = typeof body.amount === "string" ? body.amount : String(body.amount ?? "");

  if (!paymentId) return NextResponse.json({ error: "Missing payment." }, { status: 400 });
  if (!reference.trim()) {
    return NextResponse.json({ error: "Enter the transaction reference." }, { status: 400 });
  }

  let submittedMinor: bigint;
  try {
    submittedMinor = parseMoney(amountRaw);
  } catch {
    return NextResponse.json({ error: "Enter the amount you sent." }, { status: 400 });
  }
  if (submittedMinor <= 0n) {
    return NextResponse.json({ error: "Enter the amount you sent." }, { status: 400 });
  }

  // Ownership is enforced in the service too; this is the early, cheap check.
  const owned = await db.payment.count({ where: { id: paymentId, userId: session.id } });
  if (owned === 0) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? null;

  try {
    const outcome = await verifyPayment({
      userId: session.id, paymentId,
      submittedReference: reference, submittedMinor, ipAddress,
    });
    return NextResponse.json(outcome, { status: 200 });
  } catch (error) {
    if (error instanceof VerifyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Never leak provider internals or stack traces to a participant.
    console.error("[payments/verify]", error);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
