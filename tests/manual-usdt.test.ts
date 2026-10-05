/**
 * Manual USDT (BEP20), end to end against the real database: start → submit
 * TXID → admin approve/reject. The guarantees under test are database-level —
 * the row lock in confirmDeposit, the ledger idempotency key, and the unique
 * reference index — so they cannot be meaningfully mocked.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import path from "node:path";

try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}

const { createPgAdapter } = await import("@/lib/pg");
const service = await import("@/server/payments/service");
const verify = await import("@/server/payments/verify");
const participation = await import("@/server/services/participation");
const ledger = await import("@/server/services/ledger");

const db = new PrismaClient({ adapter: createPgAdapter() });
const SUFFIX = "@usdttest.invalid";
const WALLET = "0x" + "c0ffee".repeat(6) + "abcd";
const hash = () => "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

let planId: string;
let planAmount: bigint;
let accountId: string;
let adminId: string;

async function makeUser(name: string) {
  return db.user.create({
    data: {
      email: `${name}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}${SUFFIX}`,
      passwordHash: "scrypt$1$1$1$AA==$AA==",
      fullName: name,
      referralCode: `UT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: {} },
    },
  });
}

async function start(userId: string) {
  const { payment } = await service.startPayment({
    userId, planId, method: "MANUAL_USDT_BEP20", fields: {},
    origin: "https://example.invalid", paymentAccountId: accountId,
  });
  return payment;
}

const ledgerTxFor = (depositId: string) =>
  db.ledgerTransaction.findMany({ where: { idempotencyKey: `deposit:${depositId}:confirm` } });

async function cleanup() {
  const ids = (await db.user.findMany({
    where: { email: { endsWith: SUFFIX } }, select: { id: true },
  })).map((u) => u.id);

  if (ids.length > 0) {
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
      const balance = entries.reduce((total, e) => {
        const up = debitNormal ? e.direction === "DEBIT" : e.direction === "CREDIT";
        return total + (up ? e.amount : -e.amount);
      }, 0n);
      if (balance !== account.balance) {
        await db.ledgerAccount.update({ where: { id: account.id }, data: { balance } });
      }
    }
  }
  await db.paymentAccount.deleteMany({ where: { label: { startsWith: "UTEST " } } });
}

beforeAll(async () => {
  await cleanup();
  const plan = await db.plan.findUniqueOrThrow({ where: { slug: "plan-1" } });
  planId = plan.id;
  planAmount = plan.depositAmount;
  accountId = (await db.paymentAccount.create({
    data: { type: "CRYPTO", label: "UTEST USDT", enabled: true, network: "BEP20", walletAddress: WALLET },
  })).id;
  adminId = (await makeUser("admin")).id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("manual USDT BEP20", () => {
  it("opens a manual payment that records the address it was shown", async () => {
    const user = await makeUser("opener");
    const payment = await start(user.id);
    expect(payment.provider).toBe("MANUAL");
    expect(payment.method).toBe("MANUAL_USDT_BEP20");
    expect(payment.receivingAddress).toBe(WALLET);
    expect(payment.cryptoNetwork).toBe("BEP20");
    expect(payment.cryptoAsset).toBe("USDT");
  });

  it("submitting a TXID leaves the payment pending and credits nothing", async () => {
    const user = await makeUser("submitter");
    const payment = await start(user.id);
    const tx = hash();
    const outcome = await verify.verifyPayment({
      userId: user.id, paymentId: payment.id, submittedReference: tx.toUpperCase().replace("0X", "0x"), submittedMinor: planAmount,
    });
    expect(outcome.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(outcome.credited).toBe(false);
    expect(outcome.message).toBe("Payment submitted successfully. Your payment is waiting for verification.");

    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { deposit: true } });
    expect(after.userSubmittedReference).toBe(tx);
    expect(after.txHash).toBe(tx);
    expect(after.deposit.status).toBe("PENDING");
    expect(await ledgerTxFor(after.depositId)).toHaveLength(0);
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(0n);
    expect(wallet.available).toBe(0n);
  });

  it("refuses a malformed TXID without killing the payment", async () => {
    const user = await makeUser("typo");
    const payment = await start(user.id);
    await expect(verify.verifyPayment({
      userId: user.id, paymentId: payment.id, submittedReference: "0x1234", submittedMinor: planAmount,
    })).rejects.toThrow(/BEP20 transaction ID/);
    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe("WAITING_FOR_PAYMENT");
  });

  it("will not let a submitted TXID be swapped while under review", async () => {
    const user = await makeUser("swapper");
    const payment = await start(user.id);
    const first = hash();
    await verify.verifyPayment({ userId: user.id, paymentId: payment.id, submittedReference: first, submittedMinor: planAmount });
    await verify.verifyPayment({ userId: user.id, paymentId: payment.id, submittedReference: hash(), submittedMinor: planAmount });
    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.userSubmittedReference).toBe(first);
  });

  it("refuses a TXID another user already submitted", async () => {
    const a = await makeUser("first-claim");
    const b = await makeUser("second-claim");
    const tx = hash();
    const pa = await start(a.id);
    const pb = await start(b.id);
    await verify.verifyPayment({ userId: a.id, paymentId: pa.id, submittedReference: tx, submittedMinor: planAmount });
    const outcome = await verify.verifyPayment({
      userId: b.id, paymentId: pb.id, submittedReference: tx.slice(2), submittedMinor: planAmount,
    });
    expect(outcome.message).toMatch(/already been used/);
    const after = await db.payment.findUniqueOrThrow({ where: { id: pb.id } });
    expect(after.userSubmittedReference).toBeNull();
  });

  it("approval credits exactly once, even when approved concurrently and again later", async () => {
    const user = await makeUser("approved");
    const payment = await start(user.id);
    await verify.verifyPayment({ userId: user.id, paymentId: payment.id, submittedReference: hash(), submittedMinor: planAmount });

    const results = await Promise.allSettled([
      participation.confirmDeposit({ depositId: payment.depositId, adminId, adminRole: "ADMIN" }),
      participation.confirmDeposit({ depositId: payment.depositId, adminId, adminRole: "ADMIN" }),
    ]);
    const fresh = results.filter((r) => r.status === "fulfilled" && !r.value.replayed);
    expect(fresh).toHaveLength(1);

    const again = await participation.confirmDeposit({ depositId: payment.depositId, adminId, adminRole: "ADMIN" });
    expect(again.replayed).toBe(true);

    expect(await ledgerTxFor(payment.depositId)).toHaveLength(1);
    expect(await db.participation.count({ where: { userId: user.id } })).toBe(1);
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(planAmount);

    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { deposit: true } });
    expect(after.status).toBe("SUCCESS");
    expect(after.deposit.status).toBe("CONFIRMED");
    expect(after.deposit.reviewedById).toBe(adminId);
    expect(after.deposit.reviewedAt).not.toBeNull();
  });

  it("rejection credits nothing and frees the user to pay again", async () => {
    const user = await makeUser("rejected");
    const payment = await start(user.id);
    await verify.verifyPayment({ userId: user.id, paymentId: payment.id, submittedReference: hash(), submittedMinor: planAmount });
    await participation.rejectDeposit({ depositId: payment.depositId, adminId, adminRole: "ADMIN", reason: "No such transaction on BscScan" });

    const after = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe("REJECTED");
    expect(await ledgerTxFor(payment.depositId)).toHaveLength(0);
    await expect(participation.confirmDeposit({ depositId: payment.depositId, adminId, adminRole: "ADMIN" }))
      .rejects.toThrow(/rejected/);

    const next = await start(user.id);
    expect(next.id).not.toBe(payment.id);
  });

  it("leaves the books balanced", async () => {
    expect((await ledger.verifyIntegrity()).ok).toBe(true);
  });
});
