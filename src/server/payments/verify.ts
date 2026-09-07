import "server-only";
import { Prisma, type PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import * as participation from "@/server/services/participation";
import * as notify from "@/server/services/notification";
import * as audit from "@/server/services/audit";
import { adapterFor } from "./registry";
import type { VerifyResult } from "./types";

/**
 * Payment verification — the manual-transfer flow's core.
 *
 * The user tells us they sent money and gives a reference. Everything after
 * that is server-side, and the design is built around one assumption: **the
 * user's claim is input, not evidence.**
 *
 * Consequences that shape the code below:
 *   - The amount credited is the PLAN's price, never the amount the user typed.
 *     A typed amount is only used to catch obvious mismatches early.
 *   - A provider that cannot confirm returns MANUAL_REVIEW_REQUIRED. There is
 *     no code path from "user typed a plausible reference" to SUCCESS.
 *   - A reference already used by anyone is refused before any provider call.
 *   - Only this module and an explicit admin action can reach SUCCESS.
 */

export class VerifyError extends Error {}

/** Attempts allowed per payment, and the window between them. */
const MAX_ATTEMPTS = 12;
const MIN_SECONDS_BETWEEN = 20;

export type VerifyOutcome = {
  status: PaymentStatus;
  message: string;
  credited: boolean;
  /** True when the caller may usefully press "Check again". */
  retryable: boolean;
};

const TERMINAL: readonly PaymentStatus[] = [
  "SUCCESS", "FAILED", "REJECTED", "EXPIRED", "CANCELLED", "REFUNDED",
] as const;

function normaliseReference(raw: string): string {
  // Providers are inconsistent about case and spacing; normalising means
  // "abc 123" and "ABC123" cannot both be credited.
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export async function verifyPayment(input: {
  userId: string;
  paymentId: string;
  submittedReference: string;
  submittedMinor: bigint;
  ipAddress?: string | null;
}): Promise<VerifyOutcome> {
  const payment = await db.payment.findFirst({
    where: { id: input.paymentId, userId: input.userId },
    include: { plan: true, deposit: true, paymentAccount: true },
  });
  if (!payment) throw new VerifyError("Payment not found.");

  // Already finished? Say so and stop. This is the idempotent front door:
  // pressing Verify five times on a succeeded payment reports success five
  // times and credits once.
  if (payment.status === "SUCCESS") {
    return {
      status: "SUCCESS", credited: false, retryable: false,
      message: "Payment already processed. Your participation is active.",
    };
  }
  if (TERMINAL.includes(payment.status)) {
    return {
      status: payment.status, credited: false, retryable: false,
      message: payment.failureReason ?? `This payment is ${payment.status.toLowerCase()}.`,
    };
  }

  const reference = normaliseReference(input.submittedReference);
  if (!reference) throw new VerifyError("Enter the transaction reference from your payment.");

  // --- Rate limiting --------------------------------------------------
  if (payment.verificationAttempts >= MAX_ATTEMPTS) {
    return {
      status: "MANUAL_REVIEW_REQUIRED", credited: false, retryable: false,
      message: "Too many verification attempts. Our team will review this payment manually.",
    };
  }
  if (payment.lastVerifiedAt) {
    const elapsed = (Date.now() - payment.lastVerifiedAt.getTime()) / 1000;
    if (elapsed < MIN_SECONDS_BETWEEN) {
      return {
        status: payment.status, credited: false, retryable: true,
        message: `Please wait ${Math.ceil(MIN_SECONDS_BETWEEN - elapsed)} seconds before checking again.`,
      };
    }
  }

  // --- Duplicate reference --------------------------------------------
  // Checked BEFORE calling the provider: a reference someone already used must
  // never be looked up on behalf of a second account.
  const clash = await db.payment.findFirst({
    where: {
      method: payment.method,
      userSubmittedReference: reference,
      NOT: { id: payment.id },
    },
    select: { id: true, userId: true, status: true },
  });
  if (clash) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        verificationAttempts: { increment: 1 },
        lastVerifiedAt: new Date(),
        failureReason: "Reference already submitted",
      },
    });
    await audit.record({
      actorId: input.userId,
      action: "payment.duplicate_reference",
      entityType: "Payment", entityId: payment.id,
      newState: { reference, clashesWith: clash.id, sameUser: clash.userId === input.userId },
      ipAddress: input.ipAddress ?? null,
    });
    return {
      status: payment.status, credited: false, retryable: false,
      message: clash.userId === input.userId
        ? "You have already submitted that transaction reference."
        : "That transaction reference has already been used. Enter the reference for your own payment.",
    };
  }

  // Claim the reference and mark the attempt in one write, so two concurrent
  // Verify clicks cannot both proceed with the same reference.
  try {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        userSubmittedReference: reference,
        userSubmittedAmount: input.submittedMinor,
        status: "VERIFYING",
        verificationAttempts: { increment: 1 },
        lastVerifiedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        status: payment.status, credited: false, retryable: false,
        message: "That transaction reference has already been used.",
      };
    }
    throw error;
  }

  // --- Ask the provider ------------------------------------------------
  const adapter = adapterFor(payment.method);
  let result: VerifyResult;
  try {
    result = await adapter.verifyTransaction({
      reference: payment.reference,
      submittedReference: reference,
      submittedMinor: input.submittedMinor,
      expectedMinor: payment.expectedAmount,
      currency: payment.currency,
      method: payment.method,
      account: payment.paymentAccount
        ? {
            id: payment.paymentAccount.id,
            type: payment.paymentAccount.type,
            accountNumber: payment.paymentAccount.accountNumber,
            walletAddress: payment.paymentAccount.walletAddress,
            network: payment.paymentAccount.network,
            autoVerify: payment.paymentAccount.autoVerify,
          }
        : null,
    });
  } catch (error) {
    // A provider throwing is not the user's fault and not a rejection.
    result = {
      status: "MANUAL_REVIEW_REQUIRED",
      message: "We could not reach the payment provider. Your reference is saved and our team will confirm it.",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }

  // --- Amount check ----------------------------------------------------
  // Applied to what the PROVIDER reports, not what the user typed. A provider
  // saying SUCCESS for the wrong amount is an underpayment, not a success.
  let status: PaymentStatus = result.status;
  let message = result.message;
  const received = result.receivedMinor ?? null;

  if (status === "SUCCESS" && received != null) {
    if (received < payment.expectedAmount) {
      status = "UNDERPAID";
      message = "Less arrived than the plan requires, so it has not been credited. Our team will be in touch.";
    } else if (received > payment.expectedAmount) {
      status = "OVERPAID";
      message = "More arrived than the plan requires. Your participation is active; our team will contact you about the difference.";
    }
  }

  const credits = status === "SUCCESS" || status === "OVERPAID";

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status,
      providerTxId: result.providerTxId ?? payment.providerTxId,
      txHash: result.txHash ?? payment.txHash,
      receivedAmount: received ?? payment.receivedAmount,
      receivedCrypto: result.receivedCrypto ?? payment.receivedCrypto,
      confirmations: result.confirmations ?? payment.confirmations,
      requiredConfirmations: result.requiredConfirmations ?? payment.requiredConfirmations,
      failureReason: credits ? null : message,
      providerPayload: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      completedAt: credits || TERMINAL.includes(status) ? new Date() : null,
    },
  });

  await db.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "verify.attempt",
      fromStatus: payment.status,
      toStatus: status,
      message,
      payload: (result.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  await audit.record({
    actorId: input.userId,
    action: `payment.verify.${status.toLowerCase()}`,
    entityType: "Payment", entityId: payment.id,
    previousState: { status: payment.status },
    newState: { status, reference, providerTxId: result.providerTxId ?? null },
    ipAddress: input.ipAddress ?? null,
  });

  if (credits) {
    // The single credit. confirmDeposit posts to the ledger under
    // `deposit:<id>:confirm`, so calling it twice posts once.
    await participation.confirmDeposit({
      depositId: payment.depositId, adminId: null, adminRole: "SYSTEM",
    });
    await notify.notify({
      userId: payment.userId,
      type: "PAYMENT_VERIFIED",
      title: "Payment verified",
      body: `Your ${payment.plan.name} participation is now active.`,
      linkPath: "/wallet",
    });
  } else if (status === "MANUAL_REVIEW_REQUIRED") {
    await notify.notify({
      userId: payment.userId,
      type: "PAYMENT_MANUAL_REVIEW",
      title: "Payment received for review",
      body: "We have your reference and our team is confirming it.",
      linkPath: `/pay/${payment.reference}`,
    });
  } else if (status === "REJECTED" || status === "FAILED") {
    await db.deposit.updateMany({
      where: { id: payment.depositId, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: message },
    });
  }

  return {
    status, message, credited: credits,
    retryable: status === "VERIFYING" || status === "CONFIRMING" || status === "PAYMENT_DETECTED",
  };
}
