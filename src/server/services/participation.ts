import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import * as ledger from "./ledger";
import * as audit from "./audit";
import * as notify from "./notification";
import { awardCommissionFor } from "./commission";
import { checkBumperThresholds } from "./bumper";

/**
 * Deposits and participation activation.
 *
 * Confirming a deposit is the single most consequential write in the system:
 * it moves money, activates participation, pays the referrer and can trip a
 * bumper threshold. All of it happens in one database transaction, keyed on
 * the deposit id, so a duplicated callback or a double-clicked Confirm button
 * produces exactly one of everything (Sections 43, 44).
 */

export class DomainError extends Error {}

export async function createDeposit(input: {
  userId: string;
  planId: string;
  method: Prisma.DepositCreateInput["method"];
  externalRef?: string | null;
  proofUrl?: string | null;
}) {
  const plan = await db.plan.findUniqueOrThrow({ where: { id: input.planId } });
  if (plan.status !== "ACTIVE") throw new DomainError(`${plan.name} is not open for participation`);

  return db.deposit.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      amount: plan.depositAmount,
      method: input.method,
      externalRef: input.externalRef ?? null,
      proofUrl: input.proofUrl ?? null,
      status: "PENDING",
    },
  });
}

/**
 * Confirm a deposit: credit the principal (locked), activate participation,
 * set the unlock date, pay referral commission and evaluate bumper thresholds.
 */
export async function confirmDeposit(input: {
  depositId: string;
  /**
   * Null for automated payments, where a verified provider webhook is the
   * actor rather than a person. The audit log records those as SYSTEM. It is
   * deliberately not a fabricated admin id — the distinction between "a human
   * approved this" and "a signed webhook did" matters when a payment is
   * disputed.
   */
  adminId: string | null;
  adminRole: string;
}) {
  const result = await db.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUniqueOrThrow({
      where: { id: input.depositId },
      include: { plan: true, user: true },
    });

    // Precondition inside the transaction, not before it — this is what makes
    // a double-click safe rather than merely unlikely.
    if (deposit.status === "CONFIRMED") return { deposit, replayed: true as const };
    if (deposit.status === "REJECTED") throw new DomainError("Deposit was already rejected");

    const now = new Date();
    const unlocksAt = new Date(now.getTime() + deposit.plan.lockPeriodDays * 86_400_000);

    const participation = await tx.participation.create({
      data: {
        userId: deposit.userId,
        planId: deposit.planId,
        status: "ACTIVE",
        activatedAt: now,
        principalUnlocksAt: unlocksAt,
      },
    });

    // Principal lands in LOCKED, not AVAILABLE — rule (ii).
    const { transaction } = await ledger.post({
      type: "DEPOSIT",
      description: `${deposit.plan.name} participation deposit`,
      idempotencyKey: `deposit:${deposit.id}:confirm`,
      referenceType: "deposit",
      referenceId: deposit.id,
      createdByAdminId: input.adminId ?? undefined,
      postings: [
        { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: deposit.amount },
        { kind: "USER_LOCKED", userId: deposit.userId, direction: "CREDIT", amount: deposit.amount },
      ],
    }, tx);

    const updated = await tx.deposit.update({
      where: { id: deposit.id },
      data: {
        status: "CONFIRMED",
        participationId: participation.id,
        ledgerTxId: transaction.id,
        reviewedById: input.adminId,
        reviewedAt: now,
      },
    });

    await audit.record({
      actorId: input.adminId,
      actorRole: input.adminRole,
      action: "deposit.confirm",
      entityType: "Deposit",
      entityId: deposit.id,
      previousState: { status: deposit.status },
      newState: { status: "CONFIRMED", participationId: participation.id },
    }, tx);

    await notify.notify({
      userId: deposit.userId,
      type: "DEPOSIT_CONFIRMED",
      title: "Deposit confirmed",
      body: `Your ${deposit.plan.name} participation is active. Your principal unlocks on ${unlocksAt.toISOString().slice(0, 10)}.`,
      linkPath: "/wallet",
    }, tx);

    return { deposit: updated, participation, replayed: false as const };
  }, { timeout: 30_000 });

  // Commission and bumper evaluation run after the deposit commits: they are
  // separately idempotent, and a failure there must not roll back a confirmed
  // payment.
  if (!result.replayed) {
    await awardCommissionFor(input.depositId);
    const deposit = await db.deposit.findUnique({ where: { id: input.depositId } });
    if (deposit) {
      const referral = await db.referral.findUnique({ where: { referredId: deposit.userId } });
      if (referral) await checkBumperThresholds(referral.referrerId);
    }
  }

  return result;
}

export async function rejectDeposit(input: {
  depositId: string;
  adminId: string;
  adminRole: string;
  reason: string;
}) {
  const deposit = await db.deposit.findUniqueOrThrow({ where: { id: input.depositId } });
  if (deposit.status !== "PENDING") {
    throw new DomainError(`Cannot reject a deposit that is ${deposit.status}`);
  }

  const updated = await db.deposit.update({
    where: { id: deposit.id },
    data: {
      status: "REJECTED",
      rejectionReason: input.reason,
      reviewedById: input.adminId,
      reviewedAt: new Date(),
    },
  });

  await audit.record({
    actorId: input.adminId, actorRole: input.adminRole,
    action: "deposit.reject", entityType: "Deposit", entityId: deposit.id,
    previousState: { status: deposit.status }, newState: { status: "REJECTED" },
    reason: input.reason,
  });
  await notify.notify({
    userId: deposit.userId, type: "DEPOSIT_REJECTED",
    title: "Deposit could not be confirmed", body: input.reason, linkPath: "/wallet",
  });

  return updated;
}

/**
 * Release matured principal from LOCKED to AVAILABLE. Idempotent per
 * participation, so the scheduled job can run as often as it likes.
 */
export async function releaseMaturedPrincipal(now: Date = new Date()) {
  const due = await db.participation.findMany({
    where: { status: "ACTIVE", principalUnlocksAt: { lte: now } },
    include: { plan: true, deposit: true },
  });

  let released = 0;
  for (const participation of due) {
    if (!participation.deposit) continue;
    const { replayed } = await ledger.post({
      type: "UNLOCK",
      description: `Principal matured — ${participation.plan.name}`,
      idempotencyKey: `participation:${participation.id}:unlock`,
      referenceType: "participation",
      referenceId: participation.id,
      postings: [
        { kind: "USER_LOCKED", userId: participation.userId, direction: "DEBIT", amount: participation.deposit.amount },
        { kind: "USER_AVAILABLE", userId: participation.userId, direction: "CREDIT", amount: participation.deposit.amount },
      ],
    });
    if (!replayed) {
      released += 1;
      await notify.notify({
        userId: participation.userId,
        type: "PRINCIPAL_UNLOCKED",
        title: "Principal unlocked",
        body: "Your participation deposit is now withdrawable. Withdrawing it ends future referral commission.",
        linkPath: "/wallet",
      });
    }
  }
  return { considered: due.length, released };
}
