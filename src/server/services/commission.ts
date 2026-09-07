import "server-only";
import { db } from "@/lib/db";
import * as ledger from "./ledger";
import * as notify from "./notification";
import { commissionEligibility } from "./eligibility";

/**
 * Referral commission — rule (vi): $3 per qualifying referral, and the
 * referrer must keep their own principal deposited to earn it.
 *
 * Idempotent on the referral: the unique index on Commission.referralId plus
 * the ledger idempotency key mean a re-run pays nothing extra.
 */
export async function awardCommissionFor(depositId: string) {
  const deposit = await db.deposit.findUnique({
    where: { id: depositId },
    include: { plan: true },
  });
  if (!deposit || deposit.status !== "CONFIRMED") return { awarded: false, reason: "Deposit not confirmed" };

  const referral = await db.referral.findUnique({ where: { referredId: deposit.userId } });
  if (!referral) return { awarded: false, reason: "User was not referred" };

  const existing = await db.commission.findUnique({ where: { referralId: referral.id } });
  if (existing) return { awarded: false, reason: "Commission already paid for this referral" };

  // Rule (vi): checked at award time against the referrer's own participation.
  const eligibility = await commissionEligibility(referral.referrerId);
  if (!eligibility.eligible) {
    return { awarded: false, reason: eligibility.reasons.join("; ") };
  }

  const amount = deposit.plan.commissionAmount;
  if (amount <= 0n) return { awarded: false, reason: "Plan pays no commission" };

  await db.referral.update({
    where: { id: referral.id },
    data: { qualified: true, qualifiedAt: new Date() },
  });

  const { transaction } = await ledger.post({
    type: "REFERRAL_COMMISSION",
    description: `Referral commission — qualifying deposit`,
    idempotencyKey: `commission:${referral.id}`,
    referenceType: "referral",
    referenceId: referral.id,
    postings: [
      { kind: "COMMISSION_EXPENSE", userId: null, direction: "DEBIT", amount },
      { kind: "USER_AVAILABLE", userId: referral.referrerId, direction: "CREDIT", amount },
    ],
  });

  await db.commission.create({
    data: {
      userId: referral.referrerId,
      referralId: referral.id,
      amount,
      status: "EARNED",
      ledgerTxId: transaction.id,
    },
  });

  await notify.notify({
    userId: referral.referrerId,
    type: "COMMISSION_EARNED",
    title: "Referral commission received",
    body: "A person you referred completed a qualifying deposit.",
    linkPath: "/referrals",
  });

  return { awarded: true, amount };
}

/** Qualifying referral count — the number the bumper thresholds are read against. */
export async function qualifyingReferralCount(userId: string): Promise<number> {
  return db.referral.count({ where: { referrerId: userId, qualified: true } });
}
