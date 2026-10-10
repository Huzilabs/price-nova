import { NextResponse } from "next/server";
import { releaseMaturedPrincipal } from "@/server/services/participation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/release-principal
 *
 * Run daily by Vercel Cron (vercel.json). Moves every principal whose lock has
 * ended from LOCKED to AVAILABLE. Safe to run any number of times: each
 * release is posted under an idempotency key, so a repeat run releases nothing.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Without the secret set the
 * route refuses everyone rather than running open to the internet.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await releaseMaturedPrincipal();
  return NextResponse.json(result);
}
