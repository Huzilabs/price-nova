import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type PaymentMethod, type PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import * as participation from "@/server/services/participation";
import * as notify from "@/server/services/notification";
import { adapterFor, adapterByKey } from "./registry";
import { TERMINAL_STATUSES, ProviderUnconfiguredError, type PaymentUpdate } from "./types";

/**
 * PaymentService — the only place a payment changes state.
 *
 * The design constraint that shapes everything: **a successful payment must
 * produce exactly one financial credit**, no matter how many times a provider
 * replays its webhook, and no matter how the poll and the webhook interleave.
 *
 * Three independent guards enforce that:
 *   1. `PaymentEvent.dedupeKey` is unique — a replayed webhook is recorded once.
 *   2. The transition to SUCCESS is conditional on the row NOT already being
 *      SUCCESS, checked inside the same transaction that writes it.
 *   3. Crediting goes through the existing `confirmDeposit()`, whose ledger
 *      post carries `deposit:<id>:confirm` as its idempotency key — so even a
 *      double call posts one transaction.
 *
 * Any one of those would mostly work. Together they mean a double credit needs
 * three simultaneous failures.
 */

export class PaymentError extends Error {}

const reference = () => `PN-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;

/** How far under the asked-for amount still counts as paid. Operator policy. */
function toleranceMinor(): bigint {
  const raw = Number(process.env.PAYMENT_UNDERPAY_TOLERANCE_MINOR ?? "0");
  return Number.isFinite(raw) && raw >= 0 ? BigInt(Math.floor(raw)) : 0n;
}

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------

export async function startPayment(input: {
  userId: string;
  planId: string;
  method: PaymentMethod;
  fields: Record<string, string>;
  origin: string;
  /** The admin-configured receiving account the user will pay into. */
  paymentAccountId?: string | null;
}) {
  const adapter = adapterFor(input.method);
  if (!adapter.isConfigured()) {
    throw new ProviderUnconfiguredError(adapter.key, adapter.missingConfig());
  }

  const [plan, user] = await Promise.all([
    db.plan.findUniqueOrThrow({ where: { id: input.planId } }),
    db.user.findUniqueOrThrow({ where: { id: input.userId } }),
  ]);
  if (plan.status !== "ACTIVE") throw new PaymentError(`${plan.name} is not open for participation.`);

  // One open payment at a time. Otherwise a user can generate a dozen crypto
  // addresses and we would have to reconcile all of them.
  const existing = await db.payment.findFirst({
    where: { userId: input.userId, status: { notIn: [...TERMINAL_STATUSES] } },
    include: { deposit: true },
  });
  if (existing) return { payment: existing, reused: true as const };

  const ref = reference();

  // Deposit first: it is the record the ledger and the admin queue already
  // understand, and it stays PENDING until the payment actually succeeds.
  const deposit = await participation.createDeposit({
    userId: input.userId,
    planId: plan.id,
    method: input.method,
    externalRef: adapter.key === "MANUAL" ? (input.fields.externalRef?.trim() || null) : null,
  });

  let payment = await db.payment.create({
    data: {
      reference: ref,
      userId: input.userId,
      planId: plan.id,
      depositId: deposit.id,
      provider: adapter.key,
      method: input.method,
      status: "PENDING",
      expectedAmount: plan.depositAmount,
      currency: "USD",
      paymentAccountId: input.paymentAccountId ?? null,
    },
  });

  try {
    const charge = await adapter.createCharge({
      reference: ref,
      amount: { minor: plan.depositAmount, currency: "USD" },
      method: input.method,
      user: { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone },
      returnUrl: `${input.origin}/pay/${ref}`,
      webhookUrl: `${input.origin}/api/payments/webhook/${adapter.key.toLowerCase()}`,
      fields: input.fields,
    });

    payment = await db.payment.update({
      where: { id: payment.id },
      data: {
        status: charge.status,
        providerTxId: charge.providerTxId ?? null,
        checkoutUrl: charge.checkoutUrl ?? null,
        cryptoAsset: charge.crypto?.asset ?? null,
        cryptoNetwork: charge.crypto?.network ?? null,
        cryptoAmount: charge.crypto?.amount ?? null,
        receivingAddress: charge.crypto?.address ?? null,
        requiredConfirmations: charge.crypto?.requiredConfirmations ?? 0,
        expiresAt: charge.expiresAt ?? null,
        providerPayload: (charge.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });

    await recordEvent(payment.id, {
      type: "charge.created",
      toStatus: charge.status,
      message: `Charge opened with ${adapter.key}`,
      payload: charge.raw,
    });

    return { payment, formPost: charge.formPost ?? null, reused: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the payment.";
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: message, completedAt: new Date() },
    });
    await db.deposit.update({
      where: { id: deposit.id },
      data: { status: "REJECTED", rejectionReason: message },
    });
    throw error;
  }
}

async function recordEvent(paymentId: string, event: {
  type: string;
  fromStatus?: PaymentStatus | null;
  toStatus?: PaymentStatus | null;
  message?: string | null;
  payload?: unknown;
  dedupeKey?: string | null;
}) {
  try {
    await db.paymentEvent.create({
      data: {
        paymentId,
        type: event.type,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        message: event.message ?? null,
        dedupeKey: event.dedupeKey ?? null,
        payload: (event.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (error) {
    // Unique violation on dedupeKey means we have already seen this exact
    // provider message. That is a success, not a failure.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Applying a provider update
// ---------------------------------------------------------------------------

/**
 * Apply a verified update from a webhook or a poll.
 *
 * `update` must already have had its signature checked by the adapter. This
 * function re-checks everything that matters about the *content*: that the
 * payment exists, that it is not already finished, and that enough money
 * actually arrived. A provider saying "SUCCESS" is not sufficient on its own.
 */
export async function applyUpdate(update: PaymentUpdate, source: "webhook" | "poll") {
  const payment = await db.payment.findUnique({
    where: { reference: update.reference },
    include: { deposit: true },
  });
  if (!payment) return { applied: false as const, reason: "unknown-reference" };

  const fresh = await recordEvent(payment.id, {
    type: `${source}.received`,
    fromStatus: payment.status,
    toStatus: update.status,
    dedupeKey: update.dedupeKey,
    payload: update.raw,
  });
  if (!fresh) return { applied: false as const, reason: "duplicate-event" };

  if (TERMINAL_STATUSES.includes(payment.status)) {
    return { applied: false as const, reason: `already-${payment.status.toLowerCase()}` };
  }

  // --- Amount check ------------------------------------------------------
  // The provider's own status is advisory. If it claims success but less money
  // arrived than we asked for, this is an underpayment and must not credit.
  let status = update.status;
  if (status === "SUCCESS" && update.receivedMinor != null) {
    const shortfall = payment.expectedAmount - update.receivedMinor;
    if (shortfall > toleranceMinor()) status = "UNDERPAID";
    else if (update.receivedMinor > payment.expectedAmount) status = "OVERPAID";
  }

  const data: Prisma.PaymentUpdateInput = {
    status,
    providerTxId: update.providerTxId ?? payment.providerTxId,
    txHash: update.txHash ?? payment.txHash,
    confirmations: update.confirmations ?? payment.confirmations,
    requiredConfirmations: update.requiredConfirmations ?? payment.requiredConfirmations,
    receivedAmount: update.receivedMinor ?? payment.receivedAmount,
    receivedCrypto: update.receivedCrypto ?? payment.receivedCrypto,
    failureReason: update.failureReason ?? null,
    providerPayload: (update.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };

  // OVERPAID still funds the participation — the surplus is an operator matter,
  // not a reason to withhold what the user paid for.
  const credits = status === "SUCCESS" || status === "OVERPAID";
  if (credits || TERMINAL_STATUSES.includes(status)) data.completedAt = new Date();

  // Conditional update: `status: { notIn: TERMINAL }` means two concurrent
  // webhooks cannot both pass this point.
  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: { notIn: [...TERMINAL_STATUSES] } },
    data: data as Prisma.PaymentUncheckedUpdateManyInput,
  });
  if (claimed.count === 0) return { applied: false as const, reason: "raced" };

  await recordEvent(payment.id, {
    type: "status.changed", fromStatus: payment.status, toStatus: status,
    message: status !== update.status ? `Provider said ${update.status}; amount check produced ${status}` : null,
  });

  if (credits) {
    // The single credit. `confirmDeposit` posts to the ledger under
    // `deposit:<id>:confirm`, activates participation, pays commission and
    // evaluates bumper milestones — all already idempotent.
    await participation.confirmDeposit({
      depositId: payment.depositId,
      adminId: null,
      adminRole: "SYSTEM",
    });
    await notify.notify({
      userId: payment.userId,
      type: "PAYMENT_SUCCESS",
      title: "Payment confirmed",
      body: "Your deposit has been credited and your participation is active.",
      linkPath: "/wallet",
    });
  } else if (status === "UNDERPAID") {
    await notify.notify({
      userId: payment.userId,
      type: "PAYMENT_UNDERPAID",
      title: "Payment was short",
      body: "Less arrived than the plan requires, so it has not been credited. Our team will be in touch.",
      linkPath: `/pay/${payment.reference}`,
    });
  } else if (status === "FAILED" || status === "EXPIRED") {
    await db.deposit.updateMany({
      where: { id: payment.depositId, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: update.failureReason ?? status },
    });
  }

  return { applied: true as const, status };
}

// ---------------------------------------------------------------------------
// Reading and reconciling
// ---------------------------------------------------------------------------

export async function getByReference(reference: string, userId?: string) {
  return db.payment.findFirst({
    where: { reference, ...(userId ? { userId } : {}) },
    include: { plan: true, deposit: true, events: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

/**
 * Ask the provider where a payment stands.
 *
 * Webhooks get lost and arrive out of order. The crypto checkout polls this so
 * the UI advances even when a callback never lands — and because it runs the
 * same `applyUpdate` path, a poll can credit just as safely as a webhook.
 */
export async function refresh(reference: string) {
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment) return null;
  if (TERMINAL_STATUSES.includes(payment.status)) return payment;

  if (payment.expiresAt && payment.expiresAt < new Date()) {
    await applyUpdate({
      reference, status: "EXPIRED",
      failureReason: "Payment window closed",
      dedupeKey: `expiry:${payment.id}`,
    }, "poll");
    return db.payment.findUnique({ where: { reference } });
  }

  const adapter = adapterByKey(payment.provider);
  if (adapter?.poll && adapter.isConfigured()) {
    const update = await adapter.poll({
      reference: payment.reference,
      providerTxId: payment.providerTxId,
      receivingAddress: payment.receivingAddress,
    }).catch(() => null);
    if (update) await applyUpdate(update, "poll");
  }

  return db.payment.findUnique({ where: { reference } });
}

export async function cancel(reference: string, userId: string) {
  const payment = await db.payment.findFirst({ where: { reference, userId } });
  if (!payment) throw new PaymentError("Payment not found.");
  if (TERMINAL_STATUSES.includes(payment.status)) return payment;

  await applyUpdate({
    reference, status: "CANCELLED",
    failureReason: "Cancelled by the user",
    dedupeKey: `cancel:${payment.id}`,
  }, "poll");

  return db.payment.findUnique({ where: { reference } });
}
