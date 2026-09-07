import "server-only";
import { db } from "@/lib/db";
import * as ledger from "./ledger";
import * as audit from "./audit";
import * as notify from "./notification";
import { qualifyingReferralCount } from "./commission";

/**
 * Bumper milestones — rules (vii) and (viii).
 *
 * Crossing a threshold creates an award for admin review rather than paying
 * automatically: rule (viii) offers a choice between a motorcycle and cash, so
 * a human has to be in the loop. The unique index on (bumperEvent, user) means
 * a threshold can be awarded to a person exactly once, however many times this
 * runs (Section 43).
 */
export async function checkBumperThresholds(userId: string) {
  const count = await qualifyingReferralCount(userId);
  const events = await db.bumperEvent.findMany({
    where: { status: "ACTIVE", threshold: { lte: count } },
    orderBy: { threshold: "asc" },
  });

  const created: string[] = [];
  for (const event of events) {
    const existing = await db.bumperAward.findUnique({
      where: { bumperEventId_userId: { bumperEventId: event.id, userId } },
    });
    if (existing) continue;

    const award = await db.bumperAward.create({
      data: {
        bumperEventId: event.id,
        userId,
        qualifyingCount: count,
        status: "PENDING_REVIEW",
      },
    });
    created.push(award.id);

    await notify.notify({
      userId,
      type: "BUMPER_THRESHOLD_REACHED",
      title: `${event.threshold} referrals reached`,
      body: `You have qualified for the ${event.name} bumper prize. It is now with our team for review.`,
      linkPath: "/referrals",
    });
  }
  return { qualifyingReferrals: count, awardsCreated: created.length };
}

/**
 * Issue a bumper prize. Cash credits the wallet through the ledger; a physical
 * prize records the liability and is fulfilled outside the system, which is
 * why the prize row carries a cash-equivalent either way.
 */
export async function issueBumperAward(input: {
  awardId: string;
  adminId: string;
  adminRole: string;
  /** Rule (viii): honoured only when the event allows the winner to choose. */
  takeCash?: boolean;
}) {
  return db.$transaction(async (tx) => {
    const award = await tx.bumperAward.findUniqueOrThrow({
      where: { id: input.awardId },
      include: { bumperEvent: true, user: true },
    });
    if (award.status === "ISSUED") return { award, replayed: true as const };
    if (award.status === "REJECTED") throw new Error("Award was rejected");

    const event = award.bumperEvent;
    const asCash = event.prizeType === "CASH" || (event.winnerChooses && input.takeCash === true);

    const prize = await tx.prize.create({
      data: {
        userId: award.userId,
        prizeType: asCash ? "CASH" : "PHYSICAL",
        amount: event.prizeAmount,
        itemName: asCash ? null : event.itemName,
        sourceType: "BUMPER",
        sourceId: award.id,
        status: "ISSUED",
        issuedById: input.adminId,
        issuedAt: new Date(),
      },
    });

    if (asCash) {
      const { transaction } = await ledger.post({
        type: "BUMPER_PRIZE",
        description: `${event.name} bumper prize`,
        idempotencyKey: `bumper:${award.id}:issue`,
        referenceType: "bumperAward",
        referenceId: award.id,
        createdByAdminId: input.adminId,
        postings: [
          { kind: "PRIZE_POOL", userId: null, direction: "DEBIT", amount: event.prizeAmount },
          { kind: "USER_AVAILABLE", userId: award.userId, direction: "CREDIT", amount: event.prizeAmount },
        ],
      }, tx);
      await tx.prize.update({ where: { id: prize.id }, data: { ledgerTxId: transaction.id } });
    }

    const updated = await tx.bumperAward.update({
      where: { id: award.id },
      data: { status: "ISSUED", prizeId: prize.id, approvedById: input.adminId, approvedAt: new Date() },
    });

    await audit.record({
      actorId: input.adminId, actorRole: input.adminRole,
      action: "bumper.issue", entityType: "BumperAward", entityId: award.id,
      previousState: { status: award.status },
      newState: { status: "ISSUED", prizeId: prize.id, asCash },
    }, tx);

    await notify.notify({
      userId: award.userId, type: "BUMPER_PRIZE_ISSUED",
      title: "Bumper prize issued",
      body: asCash
        ? "Your bumper prize has been credited to your wallet."
        : `Your ${event.itemName} is being arranged. Our team will be in touch.`,
      linkPath: "/wallet",
    }, tx);

    return { award: updated, prize, replayed: false as const };
  }, { timeout: 30_000 });
}
