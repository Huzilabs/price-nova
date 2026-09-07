/**
 * Section 47 — the financial scenarios that matter.
 *
 * These run against the real database rather than a mock, because the
 * guarantees being tested (unique indexes, transaction isolation, row locks)
 * live in Postgres. A mock would prove only that the mock agrees with itself.
 *
 * Every row created here is namespaced `*@test.invalid` and removed afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import path from "node:path";

try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}

const { createPgAdapter } = await import("@/lib/pg");
const ledger = await import("@/server/services/ledger");
const participation = await import("@/server/services/participation");
const withdrawals = await import("@/server/services/withdrawal");
const settings = await import("@/server/services/settings");

const db = new PrismaClient({ adapter: createPgAdapter() });

const SUFFIX = "@test.invalid";
const email = (name: string) => `${name}.${Date.now()}${SUFFIX}`;

let planId: string;
let adminId: string;

async function makeUser(name: string) {
  return db.user.create({
    data: {
      email: email(name),
      passwordHash: "scrypt$1$1$1$AA==$AA==",
      fullName: name,
      referralCode: `T-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: {} },
    },
  });
}

/**
 * Remove everything these tests created.
 *
 * The subtle part is the ledger. Deleting only the entries that belong to test
 * users leaves the *platform side* of each transaction behind — the transaction
 * survives with one leg, so it no longer sums to zero and every later
 * integrity check fails. (This is not hypothetical: the first version of this
 * function did exactly that and orphaned 18 transactions.) So: delete whole
 * transactions, then rebuild the platform balances from what remains.
 */
async function cleanup() {
  const ids = (await db.user.findMany({
    where: { email: { endsWith: SUFFIX } }, select: { id: true },
  })).map((u) => u.id);
  if (ids.length === 0) return;

  const touched = await db.ledgerEntry.findMany({
    where: { account: { userId: { in: ids } } },
    select: { transactionId: true },
    distinct: ["transactionId"],
  });
  const txIds = touched.map((entry) => entry.transactionId);

  // Both legs, then the transaction itself.
  await db.$transaction([
    db.ledgerEntry.deleteMany({ where: { transactionId: { in: txIds } } }),
    db.notification.deleteMany({ where: { userId: { in: ids } } }),
  ]);
  await db.commission.deleteMany({ where: { userId: { in: ids } } });
  await db.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { referredId: { in: ids } }] } });
  await db.withdrawal.deleteMany({ where: { userId: { in: ids } } });
  await db.deposit.deleteMany({ where: { userId: { in: ids } } });
  await db.participation.deleteMany({ where: { userId: { in: ids } } });
  await db.bumperAward.deleteMany({ where: { userId: { in: ids } } });
  await db.wallet.deleteMany({ where: { userId: { in: ids } } });
  await db.ledgerAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });

  await db.deposit.deleteMany({ where: { ledgerTxId: { in: txIds } } });
  await db.ledgerTransaction.deleteMany({ where: { id: { in: txIds } } });

  // Platform accounts kept entries from the deleted transactions in their
  // cached balance; recompute from what actually survives.
  for (const account of await db.ledgerAccount.findMany({ where: { userId: null } })) {
    const debitNormal = ["PLATFORM_CASH", "PRIZE_POOL", "COMMISSION_EXPENSE"].includes(account.kind);
    const entries = await db.ledgerEntry.findMany({ where: { accountId: account.id } });
    const balance = entries.reduce((total, entry) => {
      const increases = debitNormal ? entry.direction === "DEBIT" : entry.direction === "CREDIT";
      return total + (increases ? entry.amount : -entry.amount);
    }, 0n);
    if (balance !== account.balance) {
      await db.ledgerAccount.update({ where: { id: account.id }, data: { balance } });
    }
  }
}

beforeAll(async () => {
  await cleanup();
  planId = (await db.plan.findUniqueOrThrow({ where: { slug: "plan-1" } })).id;
  adminId = (await db.user.findUniqueOrThrow({ where: { email: "johntest@gmail.com" } })).id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("ledger invariants", () => {
  it("refuses a transaction that does not balance", async () => {
    const user = await makeUser("Unbalanced");
    await expect(
      ledger.post({
        type: "ADJUSTMENT",
        description: "deliberately lopsided",
        idempotencyKey: `test:unbalanced:${user.id}`,
        postings: [
          { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: 500n },
          { kind: "USER_AVAILABLE", userId: user.id, direction: "CREDIT", amount: 400n },
        ],
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it("refuses a negative posting — direction carries the sign", async () => {
    const user = await makeUser("Negative");
    await expect(
      ledger.post({
        type: "ADJUSTMENT",
        description: "negative amount",
        idempotencyKey: `test:negative:${user.id}`,
        postings: [
          { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: -100n },
          { kind: "USER_AVAILABLE", userId: user.id, direction: "CREDIT", amount: -100n },
        ],
      }),
    ).rejects.toThrow(/must be positive/);
  });

  it("keeps the whole book balanced", async () => {
    const result = await ledger.verifyIntegrity();
    expect(result.unbalancedTransactions).toEqual([]);
    expect(result.driftedAccounts).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("deposit confirmation", () => {
  it("credits locked principal, activates participation and is idempotent", async () => {
    const user = await makeUser("Depositor");
    const deposit = await participation.createDeposit({
      userId: user.id, planId, method: "USDT_TRC20", externalRef: `test-${user.id}`,
    });

    await participation.confirmDeposit({ depositId: deposit.id, adminId, adminRole: "SUPER_ADMIN" });

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.locked).toBe(1000n);   // $10 principal, locked by rule (ii)
    expect(wallet.available).toBe(0n);   // not spendable yet

    const active = await db.participation.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
    expect(active).not.toBeNull();
    expect(active!.principalUnlocksAt).not.toBeNull();

    // Section 43: the duplicate callback / double-clicked Confirm.
    await participation.confirmDeposit({ depositId: deposit.id, adminId, adminRole: "SUPER_ADMIN" });
    await participation.confirmDeposit({ depositId: deposit.id, adminId, adminRole: "SUPER_ADMIN" });

    const after = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(after.locked).toBe(1000n);

    const transactions = await db.ledgerTransaction.count({
      where: { referenceType: "deposit", referenceId: deposit.id },
    });
    expect(transactions).toBe(1);

    const participations = await db.participation.count({ where: { userId: user.id } });
    expect(participations).toBe(1);
  });

  it("pays referral commission exactly once", async () => {
    const referrer = await makeUser("Referrer");
    const referred = await makeUser("Referred");

    // The referrer needs their own active principal — rule (vi).
    const own = await participation.createDeposit({
      userId: referrer.id, planId, method: "USDT_TRC20", externalRef: `test-own-${referrer.id}`,
    });
    await participation.confirmDeposit({ depositId: own.id, adminId, adminRole: "SUPER_ADMIN" });

    await db.referral.create({ data: { referrerId: referrer.id, referredId: referred.id } });

    const deposit = await participation.createDeposit({
      userId: referred.id, planId, method: "USDT_BEP20", externalRef: `test-ref-${referred.id}`,
    });
    await participation.confirmDeposit({ depositId: deposit.id, adminId, adminRole: "SUPER_ADMIN" });

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: referrer.id } });
    expect(wallet.available).toBe(300n);       // $3, immediately spendable
    expect(wallet.lifetimeEarned).toBe(300n);

    // Re-running the commission job must pay nothing extra.
    const commission = await import("@/server/services/commission");
    await commission.awardCommissionFor(deposit.id);
    await commission.awardCommissionFor(deposit.id);

    expect(await db.commission.count({ where: { userId: referrer.id } })).toBe(1);
    const again = await db.wallet.findUniqueOrThrow({ where: { userId: referrer.id } });
    expect(again.available).toBe(300n);
  });

  it("withholds commission when the referrer has no active principal — rule (vi)", async () => {
    const referrer = await makeUser("NoPrincipal");
    const referred = await makeUser("TheirReferral");
    await db.referral.create({ data: { referrerId: referrer.id, referredId: referred.id } });

    const deposit = await participation.createDeposit({
      userId: referred.id, planId, method: "USDT_TRC20", externalRef: `test-np-${referred.id}`,
    });
    await participation.confirmDeposit({ depositId: deposit.id, adminId, adminRole: "SUPER_ADMIN" });

    expect(await db.commission.count({ where: { userId: referrer.id } })).toBe(0);
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: referrer.id } });
    expect(wallet.available).toBe(0n);
  });
});

describe("withdrawals", () => {
  it("reserves on request and pays out exactly once when approved twice", async () => {
    const user = await makeUser("Withdrawer");

    // Fund the account with a credit adjustment, through the ledger.
    await ledger.post({
      type: "ADJUSTMENT",
      description: "test funding",
      idempotencyKey: `test:fund:${user.id}`,
      postings: [
        { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: 5000n },
        { kind: "USER_AVAILABLE", userId: user.id, direction: "CREDIT", amount: 5000n },
      ],
    });

    const original = await settings.get("withdrawal.windows.COMMISSION", []);
    await settings.set("withdrawal.windows.COMMISSION", [{ startDay: 1, endDay: 31 }]);

    try {
      const request = await withdrawals.requestWithdrawal({
        userId: user.id, amount: 2000n, sourceKind: "COMMISSION",
        method: "USDT_TRC20", destination: "TTestAddress0000000000000000000000",
      });

      // The reserve moves money out of available immediately, so a second
      // request cannot spend the same balance.
      let wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      expect(wallet.available).toBe(3000n);
      expect(wallet.pending).toBe(2000n);

      await expect(
        withdrawals.requestWithdrawal({
          userId: user.id, amount: 4000n, sourceKind: "COMMISSION",
          method: "USDT_TRC20", destination: "TTestAddress0000000000000000000000",
        }),
      ).rejects.toThrow(/Insufficient/);

      await withdrawals.transition({ withdrawalId: request.id, to: "APPROVED", adminId, adminRole: "SUPER_ADMIN" });
      await withdrawals.transition({ withdrawalId: request.id, to: "PROCESSING", adminId, adminRole: "SUPER_ADMIN" });
      await withdrawals.transition({ withdrawalId: request.id, to: "PAID", adminId, adminRole: "SUPER_ADMIN" });
      // Section 43: the double-clicked "Mark paid".
      await withdrawals.transition({ withdrawalId: request.id, to: "PAID", adminId, adminRole: "SUPER_ADMIN" });

      wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      expect(wallet.available).toBe(3000n);
      expect(wallet.pending).toBe(0n);
      expect(wallet.lifetimeWithdrawn).toBe(2000n);

      const payouts = await db.ledgerTransaction.count({
        where: { referenceType: "withdrawal:payout", referenceId: request.id },
      });
      expect(payouts).toBe(1);
    } finally {
      await settings.set("withdrawal.windows.COMMISSION", original);
    }
  });

  it("returns the reserve when a request is rejected", async () => {
    const user = await makeUser("Rejected");
    await ledger.post({
      type: "ADJUSTMENT",
      description: "test funding",
      idempotencyKey: `test:fund2:${user.id}`,
      postings: [
        { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: 1000n },
        { kind: "USER_AVAILABLE", userId: user.id, direction: "CREDIT", amount: 1000n },
      ],
    });

    const original = await settings.get("withdrawal.windows.COMMISSION", []);
    await settings.set("withdrawal.windows.COMMISSION", [{ startDay: 1, endDay: 31 }]);
    try {
      const request = await withdrawals.requestWithdrawal({
        userId: user.id, amount: 1000n, sourceKind: "COMMISSION",
        method: "EASYPAISA", destination: "03001234567",
      });
      await withdrawals.transition({
        withdrawalId: request.id, to: "REJECTED", adminId, adminRole: "SUPER_ADMIN",
        reason: "Destination could not be verified",
      });

      const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      expect(wallet.available).toBe(1000n);
      expect(wallet.pending).toBe(0n);
      expect(wallet.lifetimeWithdrawn).toBe(0n);
    } finally {
      await settings.set("withdrawal.windows.COMMISSION", original);
    }
  });

  it("refuses a withdrawal outside its window — rule (x)", async () => {
    const user = await makeUser("OutOfWindow");
    await ledger.post({
      type: "ADJUSTMENT",
      description: "test funding",
      idempotencyKey: `test:fund3:${user.id}`,
      postings: [
        { kind: "PLATFORM_CASH", userId: null, direction: "DEBIT", amount: 1000n },
        { kind: "USER_AVAILABLE", userId: user.id, direction: "CREDIT", amount: 1000n },
      ],
    });

    const original = await settings.get("withdrawal.windows.COMMISSION", []);
    // A window that cannot contain today.
    const today = new Date().getUTCDate();
    const shut = today === 1 ? [{ startDay: 28, endDay: 28 }] : [{ startDay: 1, endDay: 1 }];
    await settings.set("withdrawal.windows.COMMISSION", shut);
    try {
      await expect(
        withdrawals.requestWithdrawal({
          userId: user.id, amount: 500n, sourceKind: "COMMISSION",
          method: "JAZZCASH", destination: "03001234567",
        }),
      ).rejects.toThrow(/withdrawal window/i);
    } finally {
      await settings.set("withdrawal.windows.COMMISSION", original);
    }
  });
});

describe("book integrity after all of the above", () => {
  it("still balances", async () => {
    const result = await ledger.verifyIntegrity();
    expect(result.ok).toBe(true);
  });
});
