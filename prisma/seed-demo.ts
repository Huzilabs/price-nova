/**
 * Demo participants — generated through the real domain services.
 *
 * Nothing here writes a balance or a ledger row directly. Every figure this
 * produces is the genuine output of confirmDeposit -> LedgerService.post ->
 * commission -> bumper evaluation, so the admin console is exercising the same
 * code path production will. If the numbers are wrong, the services are wrong.
 *
 * Safe to re-run: users are upserted by email and every money movement is
 * idempotent, so a second run creates no duplicate deposits or commission.
 *
 * Remove with `npm run db:seed:demo -- --purge`.
 */
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { createPgAdapter } from "../src/lib/pg";
import { hashPassword } from "../src/lib/password";

try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}

const db = new PrismaClient({ adapter: createPgAdapter() });

const NAMES = [
  "Ayesha Khan", "Bilal Rauf", "Hamza Tariq", "Sara Malik", "Usman Ali",
  "Fatima Noor", "Zain Abbas", "Iqra Shah", "Danish Iqbal", "Mahnoor Baig",
  "Rehan Aslam", "Sana Javed", "Owais Karim", "Nida Hussain", "Faisal Mir",
];

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com";

const code = (index: number) => `PN-${(index + 1).toString().padStart(4, "0")}X`;

async function purge() {
  // Order matters: children before parents.
  const demoUsers = await db.user.findMany({
    where: { email: { endsWith: "@example.com" } }, select: { id: true },
  });
  const ids = demoUsers.map((u) => u.id);
  if (ids.length === 0) return console.log("Nothing to purge.");

  await db.$transaction([
    db.ledgerEntry.deleteMany({ where: { account: { userId: { in: ids } } } }),
    db.notification.deleteMany({ where: { userId: { in: ids } } }),
    db.drawWinner.deleteMany({ where: { userId: { in: ids } } }),
    db.drawEntry.deleteMany({ where: { userId: { in: ids } } }),
    db.prize.deleteMany({ where: { userId: { in: ids } } }),
    db.bumperAward.deleteMany({ where: { userId: { in: ids } } }),
    db.commission.deleteMany({ where: { userId: { in: ids } } }),
    db.referral.deleteMany({ where: { OR: [{ referrerId: { in: ids } }, { referredId: { in: ids } }] } }),
    db.withdrawal.deleteMany({ where: { userId: { in: ids } } }),
    db.deposit.deleteMany({ where: { userId: { in: ids } } }),
    db.participation.deleteMany({ where: { userId: { in: ids } } }),
    db.wallet.deleteMany({ where: { userId: { in: ids } } }),
    db.ledgerAccount.deleteMany({ where: { userId: { in: ids } } }),
    db.auditLog.deleteMany({ where: { actorId: { in: ids } } }),
    db.userRole.deleteMany({ where: { userId: { in: ids } } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  console.log(`Purged ${ids.length} demo users and everything they owned.`);
}

async function main() {
  if (process.argv.includes("--purge")) return purge();

  const services = await import("../src/server/services/participation");
  const withdrawals = await import("../src/server/services/withdrawal");
  const draws = await import("../src/server/services/draw");
  const settings = await import("../src/server/services/settings");

  const plan = await db.plan.findUniqueOrThrow({ where: { slug: "plan-1" } });
  const userRole = await db.role.findUniqueOrThrow({ where: { key: "USER" } });
  const admin = await db.user.findUniqueOrThrow({ where: { email: "johntest@gmail.com" } });
  const passwordHash = await hashPassword("password123");

  // --- Participants -------------------------------------------------------
  const created: { id: string; name: string }[] = [];
  for (const [index, name] of NAMES.entries()) {
    const user = await db.user.upsert({
      where: { email: slug(name) },
      update: {},
      create: {
        email: slug(name),
        passwordHash,
        fullName: name,
        referralCode: code(index),
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: userRole.id } },
        wallet: { create: {} },
      },
    });
    created.push({ id: user.id, name });
  }

  // --- Referral tree ------------------------------------------------------
  // Ayesha refers the next nine; Bilal refers three of his own.
  const [root, second, ...rest] = created;
  const tree: Array<[string, string]> = [
    ...rest.slice(0, 9).map((u) => [root!.id, u.id] as [string, string]),
    ...rest.slice(9, 12).map((u) => [second!.id, u.id] as [string, string]),
  ];
  for (const [referrerId, referredId] of tree) {
    await db.user.update({ where: { id: referredId }, data: { referredById: referrerId } });
    await db.referral.upsert({
      where: { referredId }, update: {}, create: { referrerId, referredId },
    });
  }

  // --- Deposits, confirmed through the real service -----------------------
  let confirmed = 0;
  for (const [index, user] of created.entries()) {
    // Two participants are left with a pending deposit so the admin queue is
    // not artificially empty.
    const leavePending = index >= created.length - 2;

    const existing = await db.deposit.findFirst({ where: { userId: user.id } });
    const deposit = existing ?? await services.createDeposit({
      userId: user.id,
      planId: plan.id,
      method: index % 2 === 0 ? "USDT_TRC20" : "USDT_BEP20",
      externalRef: `demo-${user.id.slice(-8)}`,
    });

    if (!leavePending && deposit.status === "PENDING") {
      await services.confirmDeposit({
        depositId: deposit.id, adminId: admin.id, adminRole: "SUPER_ADMIN",
      });
      confirmed += 1;
    }
  }

  // --- Age some participations so the unlock job has something to do ------
  const aged = await db.participation.findMany({ where: { status: "ACTIVE" }, take: 5 });
  for (const [index, participation] of aged.entries()) {
    const activatedAt = new Date(Date.now() - (45 + index * 3) * 86_400_000);
    await db.participation.update({
      where: { id: participation.id },
      data: {
        activatedAt,
        principalUnlocksAt: new Date(activatedAt.getTime() + plan.lockPeriodDays * 86_400_000),
      },
    });
  }
  const release = await services.releaseMaturedPrincipal();

  // --- A draw, with entries frozen at the cutoff --------------------------
  let draw = await db.draw.findFirst({ where: { status: { in: ["OPEN", "ENTRY_CLOSED", "READY_FOR_DRAW"] } } });
  if (!draw) {
    draw = await draws.createMonthlyDraw({ adminId: admin.id, adminRole: "SUPER_ADMIN" });
    await draws.setStatus({ drawId: draw.id, to: "OPEN", adminId: admin.id, adminRole: "SUPER_ADMIN" });
  }
  const snapshot = await draws.snapshotEntries(draw.id);

  // --- One withdrawal, so the admin queue is not empty --------------------
  // Rule (x) only opens the commission window on the 1st-2nd and 16th-17th, so
  // on most days this request is correctly refused. The window is widened for
  // the duration of this one call and then restored, rather than bypassing the
  // service and writing the rows by hand.
  const original = await settings.get("withdrawal.windows.COMMISSION", []);
  try {
    await settings.set("withdrawal.windows.COMMISSION", [{ startDay: 1, endDay: 31 }]);
    const candidate = await db.wallet.findFirst({
      where: { available: { gte: 300n } }, orderBy: { available: "desc" },
    });
    if (candidate) {
      const already = await db.withdrawal.count({ where: { userId: candidate.userId } });
      if (already === 0) {
        await withdrawals.requestWithdrawal({
          userId: candidate.userId,
          amount: 300n,
          sourceKind: "COMMISSION",
          method: "USDT_TRC20",
          destination: "TXk9demoAddressForReviewOnly00000000",
        });
      }
    }
  } finally {
    await settings.set("withdrawal.windows.COMMISSION", original);
  }

  console.log("Demo data:", {
    users: await db.user.count(),
    depositsConfirmed: await db.deposit.count({ where: { status: "CONFIRMED" } }),
    depositsPending: await db.deposit.count({ where: { status: "PENDING" } }),
    confirmedThisRun: confirmed,
    commissions: await db.commission.count(),
    principalReleased: release.released,
    drawEntries: snapshot.total,
    withdrawals: await db.withdrawal.count(),
    ledgerTransactions: await db.ledgerTransaction.count(),
  });
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => db.$disconnect());
