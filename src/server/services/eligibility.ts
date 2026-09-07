import "server-only";
import { db } from "@/lib/db";

/**
 * Eligibility, with reasons.
 *
 * Rule (vi): a referrer must keep their own principal deposited to earn
 * commission; withdrawing it ends future commission. This is the single place
 * that decides it, and it returns *why* so the admin console can show the
 * reason rather than an unexplained boolean (Section 6).
 */
export type Eligibility = { eligible: boolean; reasons: string[] };

export async function commissionEligibility(userId: string): Promise<Eligibility> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { participations: { include: { plan: true } } },
  });

  const reasons: string[] = [];
  if (!user) return { eligible: false, reasons: ["User not found"] };
  if (user.status !== "ACTIVE") reasons.push(`Account is ${user.status}`);

  const active = user.participations.find((p) => p.status === "ACTIVE");
  if (!active) {
    const withdrawn = user.participations.find((p) => p.status === "PRINCIPAL_WITHDRAWN");
    reasons.push(
      withdrawn
        ? "Principal was withdrawn — rule (vi) ends commission eligibility"
        : "No active participation",
    );
  } else if (active.plan.commissionRequiresActivePrincipal && active.principalWithdrawnAt) {
    reasons.push("Principal withdrawn on this participation");
  }

  return reasons.length === 0
    ? { eligible: true, reasons: ["Active participation with principal deposited"] }
    : { eligible: false, reasons };
}

/** Rule (iii)/(xi): who may enter a given draw. */
export async function drawEligibility(
  userId: string,
  entryCutoffAt: Date,
): Promise<Eligibility> {
  const participation = await db.participation.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
  });

  if (!participation) return { eligible: false, reasons: ["No active participation"] };
  if (!participation.plan.drawEligible) {
    return { eligible: false, reasons: [`${participation.plan.name} does not include draw entry`] };
  }
  if (!participation.activatedAt || participation.activatedAt > entryCutoffAt) {
    return {
      eligible: false,
      reasons: ["Activated after the entry cutoff — rolls into the next draw (rule xi)"],
    };
  }
  return { eligible: true, reasons: [`Active on ${participation.plan.name} before the cutoff`] };
}
