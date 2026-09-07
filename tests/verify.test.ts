/**
 * Payment verification — the §24 scenarios.
 *
 * Against the real database, because the guarantees are database constraints:
 * a unique index on (method, reference) and the ledger's idempotency key.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import path from "node:path";

try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}

const { createPgAdapter } = await import("@/lib/pg");
const verify = await import("@/server/payments/verify");
const accounts = await import("@/server/payments/accounts");
const ledger = await import("@/server/services/ledger");

const db = new PrismaClient({ adapter: createPgAdapter() });
const SUFFIX = "@verifytest.invalid";
let planId: string;
let planAmount: bigint;
let easypaisaAccountId: string;
let bankAccountId: string;

async function makePayment(name: string, opts?: { accountId?: string; method?: "EASYPAISA" | "MANUAL_BANK" }) {
  const user = await db.user.create({
    data: {
      email: `${name}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}${SUFFIX}`,
      passwordHash: "scrypt$1$1$1$AA==$AA==",
      fullName: name,
      referralCode: `VT-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: {} },
    },
  });
  const method = opts?.method ?? "EASYPAISA";
  const deposit = await db.deposit.create({
    data: { userId: user.id, planId, amount: planAmount, method, status: "PENDING" },
  });
  const payment = await db.payment.create({
    data: {
      reference: `VT-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
      userId: user.id, planId, depositId: deposit.id,
      provider: method === "EASYPAISA" ? "EASYPAISA" : "BANK_TRANSFER",
      method, status: "WAITING_FOR_PAYMENT",
      expectedAmount: planAmount,
      paymentAccountId: opts?.accountId ?? easypaisaAccountId,
    },
  });
  return { user, deposit, payment };
}

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
  await db.paymentAccount.deleteMany({ where: { label: { startsWith: "VTEST " } } });
}

beforeAll(async () => {
  await cleanup();
  const plan = await db.plan.findUniqueOrThrow({ where: { slug: "plan-1" } });
  planId = plan.id;
  planAmount = plan.depositAmount;

  easypaisaAccountId = (await db.paymentAccount.create({
    data: {
      type: "EASYPAISA", label: "VTEST Easypaisa", enabled: true,
      accountNumber: "03001234567", autoVerify: false,
    },
  })).id;
  bankAccountId = (await db.paymentAccount.create({
    data: {
      type: "BANK_TRANSFER", label: "VTEST Bank", enabled: true,
      accountNumber: "0001234567890", bankName: "Test Bank", autoVerify: false,
    },
  })).id;
});

afterAll(async () => { await cleanup(); await db.$disconnect(); });

describe("receiving accounts", () => {
  it("maps each account type to the right payment method", () => {
    expect(accounts.methodForAccount("EASYPAISA")).toBe("EASYPAISA");
    expect(accounts.methodForAccount("JAZZCASH")).toBe("JAZZCASH");
    expect(accounts.methodForAccount("BANK_TRANSFER")).toBe("MANUAL_BANK");
    expect(accounts.methodForAccount("CRYPTO", "TRC20")).toBe("USDT_TRC20");
    expect(accounts.methodForAccount("CRYPTO", "ERC20")).toBe("USDT_ERC20");
    expect(accounts.methodForAccount("CRYPTO", "Bitcoin")).toBe("BTC");
    // An unknown chain must not be silently mapped to one we monitor.
    expect(accounts.methodForAccount("CRYPTO", "Solana")).toBe("MANUAL_CRYPTO");
  });

  it("never exposes an account with no destination to checkout", async () => {
    const blank = await db.paymentAccount.create({
      data: { type: "JAZZCASH", label: "VTEST Blank", enabled: true, accountNumber: null },
    });
    const published = await accounts.publicAccounts();
    expect(published.some((a) => a.id === blank.id)).toBe(false);
    await db.paymentAccount.delete({ where: { id: blank.id } });
  });

  it("publishes the receiving number from the database", async () => {
    const published = await accounts.publicAccounts();
    const easypaisa = published.find((a) => a.id === easypaisaAccountId);
    expect(easypaisa?.payTo).toBe("03001234567");
  });
});

describe("verification", () => {
  it("requires a reference", async () => {
    const { user, payment } = await makePayment("NoRef");
    await expect(verify.verifyPayment({
      userId: user.id, paymentId: payment.id,
      submittedReference: "   ", submittedMinor: planAmount,
    })).rejects.toThrow(/reference/i);
  });

  it("returns MANUAL_REVIEW_REQUIRED when no provider API is configured — never SUCCESS", async () => {
    const { user, payment } = await makePayment("Manual");
    const result = await verify.verifyPayment({
      userId: user.id, paymentId: payment.id,
      submittedReference: `EP${Date.now()}`, submittedMinor: planAmount,
    });

    expect(result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(result.credited).toBe(false);

    // Nothing credited, nothing activated.
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(0n);
    expect(wallet.available).toBe(0n);
    expect(await db.participation.count({ where: { userId: user.id } })).toBe(0);
  });

  it("bank transfers always require manual review", async () => {
    const { user, payment } = await makePayment("Bank", { accountId: bankAccountId, method: "MANUAL_BANK" });
    const result = await verify.verifyPayment({
      userId: user.id, paymentId: payment.id,
      submittedReference: `BANK${Date.now()}`, submittedMinor: planAmount,
    });
    expect(result.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(result.credited).toBe(false);
  });

  it("refuses a reference already submitted by another user", async () => {
    const shared = `DUP${Date.now()}`;
    const first = await makePayment("DupA");
    const second = await makePayment("DupB");

    const a = await verify.verifyPayment({
      userId: first.user.id, paymentId: first.payment.id,
      submittedReference: shared, submittedMinor: planAmount,
    });
    expect(a.status).toBe("MANUAL_REVIEW_REQUIRED");

    const b = await verify.verifyPayment({
      userId: second.user.id, paymentId: second.payment.id,
      submittedReference: shared, submittedMinor: planAmount,
    });
    expect(b.credited).toBe(false);
    expect(b.message).toMatch(/already been used/i);

    // The second payment must not have taken the reference.
    const stored = await db.payment.findUniqueOrThrow({ where: { id: second.payment.id } });
    expect(stored.userSubmittedReference).toBeNull();
  });

  it("treats differently-formatted references as the same reference", async () => {
    const first = await makePayment("NormA");
    const second = await makePayment("NormB");
    const raw = `ab ${Date.now()}`;

    await verify.verifyPayment({
      userId: first.user.id, paymentId: first.payment.id,
      submittedReference: raw, submittedMinor: planAmount,
    });
    const clash = await verify.verifyPayment({
      userId: second.user.id, paymentId: second.payment.id,
      submittedReference: raw.toUpperCase().replace(" ", ""), submittedMinor: planAmount,
    });
    expect(clash.message).toMatch(/already been used/i);
  });

  it("rate limits repeated attempts on the same payment", async () => {
    const { user, payment } = await makePayment("Rate");
    const first = await verify.verifyPayment({
      userId: user.id, paymentId: payment.id,
      submittedReference: `RL${Date.now()}`, submittedMinor: planAmount,
    });
    expect(first.status).toBe("MANUAL_REVIEW_REQUIRED");

    // MANUAL_REVIEW_REQUIRED is not terminal, so a second immediate attempt
    // should be throttled rather than hammering the provider.
    const second = await verify.verifyPayment({
      userId: user.id, paymentId: payment.id,
      submittedReference: `RL${Date.now()}b`, submittedMinor: planAmount,
    });
    expect(second.message).toMatch(/wait/i);
  });

  it("refuses a payment that does not belong to the caller", async () => {
    const owner = await makePayment("Owner");
    const other = await makePayment("Other");
    await expect(verify.verifyPayment({
      userId: other.user.id, paymentId: owner.payment.id,
      submittedReference: `X${Date.now()}`, submittedMinor: planAmount,
    })).rejects.toThrow(/not found/i);
  });

  it("reports already-processed instead of crediting twice", async () => {
    const { user, payment, deposit } = await makePayment("Twice");

    // Drive it to SUCCESS the only way the system allows: an admin confirming
    // the deposit, which is what happens after a manual review passes.
    const participationService = await import("@/server/services/participation");
    const admin = await db.user.findUniqueOrThrow({ where: { email: "johntest@gmail.com" } });
    await participationService.confirmDeposit({
      depositId: deposit.id, adminId: admin.id, adminRole: "SUPER_ADMIN",
    });
    await db.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS" } });

    const before = await db.ledgerTransaction.count({
      where: { referenceType: "deposit", referenceId: deposit.id },
    });

    for (let i = 0; i < 5; i += 1) {
      const result = await verify.verifyPayment({
        userId: user.id, paymentId: payment.id,
        submittedReference: `AGAIN${i}`, submittedMinor: planAmount,
      });
      expect(result.credited).toBe(false);
      expect(result.message).toMatch(/already processed/i);
    }

    const after = await db.ledgerTransaction.count({
      where: { referenceType: "deposit", referenceId: deposit.id },
    });
    expect(after).toBe(before);
    expect(before).toBe(1);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(planAmount);
  });
});

describe("book integrity after verification", () => {
  it("still balances", async () => {
    expect((await ledger.verifyIntegrity()).ok).toBe(true);
  });
});
