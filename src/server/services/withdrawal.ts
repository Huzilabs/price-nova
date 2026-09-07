import "server-only";
import { type PaymentMethod, type WithdrawalSource } from "@prisma/client";
import { db } from "@/lib/db";
import * as ledger from "./ledger";
import * as audit from "./audit";
import * as notify from "./notification";
import * as settings from "./settings";

/**
 * Withdrawals — rules (ii), (v), (ix), (x).
 *
 * Requesting reserves the money immediately (AVAILABLE -> PENDING) rather than
 * checking the balance again at payout. Without the reserve, a user can queue
 * three withdrawals against one balance and the third one to be approved
 * overdraws the platform. Rejection returns the reserve; payout consumes it.
 */
export class WithdrawalError extends Error {}

export async function requestWithdrawal(input: {
  userId: string;
  amount: bigint;
  sourceKind: WithdrawalSource;
  method: PaymentMethod;
  destination: string;
}) {
  if (input.amount <= 0n) throw new WithdrawalError("Amount must be positive");

  const minimum = BigInt(await settings.get<string>("withdrawal.minimumAmount", "0"));
  if (input.amount < minimum) {
    throw new WithdrawalError(`Minimum withdrawal is ${Number(minimum) / 100} USD`);
  }

  // Rules (v), (ix), (x) — evaluated server-side, never trusted from the client.
  const window = await settings.isWithdrawalWindowOpen(input.sourceKind);
  if (!window.open) throw new WithdrawalError(window.reason);

  if (input.sourceKind === "PRINCIPAL") {
    const participation = await db.participation.findFirst({
      where: { userId: input.userId, status: "ACTIVE" },
    });
    if (!participation?.principalUnlocksAt) throw new WithdrawalError("No active participation");
    if (participation.principalUnlocksAt > new Date()) {
      throw new WithdrawalError(
        `Principal is locked until ${participation.principalUnlocksAt.toISOString().slice(0, 10)} (rule ii)`,
      );
    }
  }

  return db.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    if (!wallet || wallet.available < input.amount) {
      throw new WithdrawalError("Insufficient available balance");
    }

    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        sourceKind: input.sourceKind,
        method: input.method,
        destination: input.destination,
        status: "PENDING_REVIEW",
      },
    });

    const { transaction } = await ledger.post({
      type: "WITHDRAWAL",
      description: "Withdrawal requested — funds reserved",
      idempotencyKey: `withdrawal:${withdrawal.id}:reserve`,
      referenceType: "withdrawal:reserve",
      referenceId: withdrawal.id,
      postings: [
        { kind: "USER_AVAILABLE", userId: input.userId, direction: "DEBIT", amount: input.amount },
        { kind: "USER_PENDING", userId: input.userId, direction: "CREDIT", amount: input.amount },
      ],
    }, tx);

    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { reserveTxId: transaction.id },
    });

    await notify.notify({
      userId: input.userId, type: "WITHDRAWAL_REQUESTED",
      title: "Withdrawal requested",
      body: "Your request is with our team for review.",
      linkPath: "/wallet",
    }, tx);

    return updated;
  }, { timeout: 30_000 });
}

const NEXT: Record<string, readonly string[]> = {
  REQUESTED: ["PENDING_REVIEW", "REJECTED"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING", "REJECTED"],
  PROCESSING: ["PAID", "REJECTED"],
  PAID: [],
  REJECTED: [],
};

/**
 * Advance a withdrawal. The status precondition is asserted inside the
 * transaction, which is what makes approving twice pay once (Section 43).
 */
export async function transition(input: {
  withdrawalId: string;
  to: "APPROVED" | "PROCESSING" | "PAID" | "REJECTED";
  adminId: string;
  adminRole: string;
  reason?: string;
}) {
  return db.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({
      where: { id: input.withdrawalId },
    });

    if (withdrawal.status === input.to) return { withdrawal, replayed: true as const };
    if (!NEXT[withdrawal.status]?.includes(input.to)) {
      throw new WithdrawalError(`Cannot move a withdrawal from ${withdrawal.status} to ${input.to}`);
    }
    if (input.to === "REJECTED" && !input.reason) {
      throw new WithdrawalError("A rejection needs a reason");
    }

    const now = new Date();
    const data: Record<string, unknown> = {
      status: input.to,
      reviewedById: input.adminId,
      reviewedAt: now,
    };

    if (input.to === "PAID") {
      // Money leaves: PENDING is consumed and platform cash goes down.
      const { transaction } = await ledger.post({
        type: "WITHDRAWAL",
        description: `Withdrawal paid — ${withdrawal.method}`,
        idempotencyKey: `withdrawal:${withdrawal.id}:payout`,
        referenceType: "withdrawal:payout",
        referenceId: withdrawal.id,
        createdByAdminId: input.adminId,
        postings: [
          { kind: "USER_PENDING", userId: withdrawal.userId, direction: "DEBIT", amount: withdrawal.amount },
          { kind: "PLATFORM_CASH", userId: null, direction: "CREDIT", amount: withdrawal.amount },
        ],
      }, tx);
      data.payoutTxId = transaction.id;
      data.paidAt = now;
    }

    if (input.to === "REJECTED") {
      // The reserve returns to the user.
      await ledger.post({
        type: "WITHDRAWAL",
        description: "Withdrawal rejected — reserve released",
        idempotencyKey: `withdrawal:${withdrawal.id}:release`,
        referenceType: "withdrawal:release",
        referenceId: withdrawal.id,
        createdByAdminId: input.adminId,
        postings: [
          { kind: "USER_PENDING", userId: withdrawal.userId, direction: "DEBIT", amount: withdrawal.amount },
          { kind: "USER_AVAILABLE", userId: withdrawal.userId, direction: "CREDIT", amount: withdrawal.amount },
        ],
      }, tx);
      data.rejectionReason = input.reason;
    }

    const updated = await tx.withdrawal.update({ where: { id: withdrawal.id }, data });

    await audit.record({
      actorId: input.adminId, actorRole: input.adminRole,
      action: `withdrawal.${input.to.toLowerCase()}`,
      entityType: "Withdrawal", entityId: withdrawal.id,
      previousState: { status: withdrawal.status },
      newState: { status: input.to },
      reason: input.reason ?? null,
    }, tx);

    const messages: Record<string, [string, string]> = {
      APPROVED: ["Withdrawal approved", "Your withdrawal has been approved and is queued for payment."],
      PROCESSING: ["Withdrawal processing", "Your payment is being sent."],
      PAID: ["Withdrawal paid", "Your withdrawal has been paid."],
      REJECTED: ["Withdrawal rejected", input.reason ?? "Your withdrawal was rejected."],
    };
    const [title, body] = messages[input.to]!;
    await notify.notify({
      userId: withdrawal.userId, type: `WITHDRAWAL_${input.to}`, title, body, linkPath: "/wallet",
    }, tx);

    return { withdrawal: updated, replayed: false as const };
  }, { timeout: 30_000 });
}

/** Section 14: adjustments never edit history — they add a new transaction. */
export async function postAdjustment(input: {
  userId: string;
  amount: bigint;
  reason: string;
  adminId: string;
  adminRole: string;
}) {
  if (input.amount === 0n) throw new WithdrawalError("An adjustment of zero does nothing");
  const credit = input.amount > 0n;
  const magnitude = credit ? input.amount : -input.amount;

  const { transaction } = await ledger.post({
    type: "ADJUSTMENT",
    description: `Manual adjustment — ${input.reason}`,
    idempotencyKey: `adjustment:${input.adminId}:${Date.now()}:${input.userId}`,
    referenceType: "user",
    referenceId: input.userId,
    createdByAdminId: input.adminId,
    metadata: { reason: input.reason },
    postings: credit
      ? [
          { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: magnitude },
          { kind: "USER_AVAILABLE", userId: input.userId, direction: "CREDIT", amount: magnitude },
        ]
      : [
          { kind: "USER_AVAILABLE", userId: input.userId, direction: "DEBIT", amount: magnitude },
          { kind: "PLATFORM_CASH", userId: null, direction: "CREDIT", amount: magnitude },
        ],
  });

  await audit.record({
    actorId: input.adminId, actorRole: input.adminRole,
    action: "ledger.adjust", entityType: "User", entityId: input.userId,
    newState: { amount: input.amount.toString(), transactionId: transaction.id },
    reason: input.reason,
  });

  return transaction;
}
