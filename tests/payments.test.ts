/**
 * The payment guarantees that matter.
 *
 * These run against the real database because the guards being tested are
 * database constraints — a unique index and a conditional update. A mock would
 * prove only that the mock agrees with itself.
 *
 * Rows are namespaced `*@paytest.invalid` and removed afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import path from "node:path";

try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}

const { createPgAdapter } = await import("@/lib/pg");
const service = await import("@/server/payments/service");
const registry = await import("@/server/payments/registry");
const ledger = await import("@/server/services/ledger");

const db = new PrismaClient({ adapter: createPgAdapter() });

const SUFFIX = "@paytest.invalid";
let planId: string;

async function makeUserWithPayment(name: string) {
  const user = await db.user.create({
    data: {
      email: `${name}.${Date.now()}${SUFFIX}`,
      passwordHash: "scrypt$1$1$1$AA==$AA==",
      fullName: name,
      referralCode: `PT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: {} },
    },
  });

  const deposit = await db.deposit.create({
    data: { userId: user.id, planId, amount: 1000n, method: "BTC", status: "PENDING" },
  });

  const payment = await db.payment.create({
    data: {
      reference: `PT-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
      userId: user.id, planId, depositId: deposit.id,
      provider: "CRYPTO_GATEWAY", method: "BTC",
      status: "WAITING_FOR_PAYMENT", expectedAmount: 1000n,
      cryptoAsset: "BTC", cryptoNetwork: "Bitcoin", cryptoAmount: "0.00021",
      receivingAddress: `bc1qtest${Math.random().toString(36).slice(2, 10)}`,
      requiredConfirmations: 2,
    },
  });

  return { user, deposit, payment };
}

async function cleanup() {
  const ids = (await db.user.findMany({
    where: { email: { endsWith: SUFFIX } }, select: { id: true },
  })).map((u) => u.id);
  if (ids.length === 0) return;

  const touched = await db.ledgerEntry.findMany({
    where: { account: { userId: { in: ids } } },
    select: { transactionId: true }, distinct: ["transactionId"],
  });
  const txIds = touched.map((e) => e.transactionId);

  await db.ledgerEntry.deleteMany({ where: { transactionId: { in: txIds } } });
  await db.paymentEvent.deleteMany({ where: { payment: { userId: { in: ids } } } });
  await db.payment.deleteMany({ where: { userId: { in: ids } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.commission.deleteMany({ where: { userId: { in: ids } } });
  await db.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { referredId: { in: ids } }] } });
  await db.deposit.deleteMany({ where: { userId: { in: ids } } });
  await db.participation.deleteMany({ where: { userId: { in: ids } } });
  await db.wallet.deleteMany({ where: { userId: { in: ids } } });
  await db.ledgerAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.ledgerTransaction.deleteMany({ where: { id: { in: txIds } } });

  for (const account of await db.ledgerAccount.findMany({ where: { userId: null } })) {
    const debitNormal = ["PLATFORM_CASH", "PRIZE_POOL", "COMMISSION_EXPENSE"].includes(account.kind);
    const entries = await db.ledgerEntry.findMany({ where: { accountId: account.id } });
    const balance = entries.reduce((total, entry) => {
      const up = debitNormal ? entry.direction === "DEBIT" : entry.direction === "CREDIT";
      return total + (up ? entry.amount : -entry.amount);
    }, 0n);
    if (balance !== account.balance) {
      await db.ledgerAccount.update({ where: { id: account.id }, data: { balance } });
    }
  }
}

beforeAll(async () => {
  await cleanup();
  planId = (await db.plan.findUniqueOrThrow({ where: { slug: "plan-1" } })).id;
});

afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("provider registry", () => {
  it("routes every method to exactly one provider", () => {
    for (const method of ["JAZZCASH", "EASYPAISA", "CARD", "BTC", "USDT_TRC20", "USDT_ERC20", "MANUAL_BANK"] as const) {
      expect(registry.adapterFor(method).methods).toContain(method);
    }
  });

  it("only manual methods ask the user for a reference", () => {
    for (const method of ["JAZZCASH", "EASYPAISA", "CARD", "BTC", "USDT_TRC20", "USDT_ERC20"] as const) {
      const names = registry.adapterFor(method).requiredFields(method).map((f) => f.name);
      expect(names).not.toContain("submittedReference");
    }
    // Manual rails are the only ones allowed to ask for one.
    expect(registry.adapterFor("MANUAL_CRYPTO").requiredFields("MANUAL_CRYPTO").map((f) => f.name))
      .toContain("submittedReference");
    expect(registry.adapterFor("MANUAL_BANK").requiredFields("MANUAL_BANK").map((f) => f.name))
      .toContain("submittedReference");
  });

  it("refuses to charge through an unconfigured provider", async () => {
    const adapter = registry.adapterFor("BTC");
    if (adapter.isConfigured()) return; // credentials present; nothing to assert
    await expect(
      adapter.createCharge({
        reference: "PT-X", amount: { minor: 1000n, currency: "USD" }, method: "BTC",
        user: { id: "u", email: "a@b.c", fullName: "A", phone: null },
        returnUrl: "http://x", webhookUrl: "http://x", fields: {},
      }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe("webhook signatures", () => {
  it("rejects an unsigned payload on every provider", async () => {
    for (const adapter of registry.allAdapters()) {
      const result = await adapter.verifyWebhook({
        headers: {}, rawBody: JSON.stringify({ order_id: "PT-X", payment_status: "finished" }),
      });
      expect(result).toBeNull();
    }
  });

  it("rejects a forged crypto signature", async () => {
    const result = await registry.adapterFor("BTC").verifyWebhook({
      headers: { "x-nowpayments-sig": "f".repeat(128) },
      rawBody: JSON.stringify({ order_id: "PT-X", payment_status: "finished", actually_paid: "1" }),
    });
    expect(result).toBeNull();
  });
});

describe("crediting", () => {
  it("credits exactly once when the same webhook arrives three times", async () => {
    const { user, payment } = await makeUserWithPayment("Replay");

    const update = {
      reference: payment.reference,
      status: "SUCCESS" as const,
      providerTxId: "gw-1",
      txHash: `0xtest${Date.now()}`,
      receivedMinor: 1000n,
      receivedCrypto: "0.00021",
      dedupeKey: `test:${payment.id}:finished`,
    };

    const first = await service.applyUpdate(update, "webhook");
    const second = await service.applyUpdate(update, "webhook");
    const third = await service.applyUpdate(update, "webhook");

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(third.applied).toBe(false);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(1000n);

    const credits = await db.ledgerTransaction.count({
      where: { referenceType: "deposit", referenceId: payment.depositId },
    });
    expect(credits).toBe(1);

    const participations = await db.participation.count({ where: { userId: user.id } });
    expect(participations).toBe(1);
  });

  it("does not credit an underpayment, even when the provider says SUCCESS", async () => {
    const { user, payment } = await makeUserWithPayment("Short");

    const result = await service.applyUpdate({
      reference: payment.reference,
      status: "SUCCESS",
      receivedMinor: 600n,          // asked 1000
      dedupeKey: `test:${payment.id}:short`,
    }, "webhook");

    expect(result.applied).toBe(true);
    expect(result.status).toBe("UNDERPAID");

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(0n);
    expect(wallet.available).toBe(0n);

    const deposit = await db.deposit.findUniqueOrThrow({ where: { id: payment.depositId } });
    expect(deposit.status).toBe("PENDING");
  });

  it("credits an overpayment but records it as such", async () => {
    const { user, payment } = await makeUserWithPayment("Over");

    const result = await service.applyUpdate({
      reference: payment.reference,
      status: "SUCCESS",
      receivedMinor: 1500n,
      dedupeKey: `test:${payment.id}:over`,
    }, "webhook");

    expect(result.status).toBe("OVERPAID");
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(1000n); // credited the plan amount, not the surplus
  });

  it("ignores an update for a reference that does not exist", async () => {
    const result = await service.applyUpdate({
      reference: "PT-NOPE", status: "SUCCESS", receivedMinor: 1000n,
      dedupeKey: `test:nope:${Date.now()}`,
    }, "webhook");
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("unknown-reference");
  });

  it("will not reopen a settled payment", async () => {
    const { payment } = await makeUserWithPayment("Settled");

    await service.applyUpdate({
      reference: payment.reference, status: "EXPIRED",
      dedupeKey: `test:${payment.id}:expired`,
    }, "webhook");

    const late = await service.applyUpdate({
      reference: payment.reference, status: "SUCCESS", receivedMinor: 1000n,
      dedupeKey: `test:${payment.id}:late-success`,
    }, "webhook");

    expect(late.applied).toBe(false);
    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe("EXPIRED");
  });
});

describe("book integrity after payments", () => {
  it("still balances", async () => {
    const result = await ledger.verifyIntegrity();
    expect(result.ok).toBe(true);
  });
});
