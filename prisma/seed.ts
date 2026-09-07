/**
 * Seed — configuration, plus the initial administrator.
 *
 * Every value traces to a numbered rule in docs/requirements/DECODED-SPEC.md
 * and all of it is editable by an admin at runtime. This file creates NO
 * participants, NO deposits and NO fabricated financial history; for sample
 * participants run `npm run db:seed:demo`, which generates them through the
 * real domain services so the numbers are genuine ledger output.
 */
import { PrismaClient, type RoleKey, type Prisma } from "@prisma/client";
import path from "node:path";
import { createPgAdapter } from "../src/lib/pg";
import { hashPassword } from "../src/lib/password";

// Imports are hoisted, so this runs after them — safe because
// createPgAdapter() reads DATABASE_URL when called, not when imported.
try { process.loadEnvFile(path.join(process.cwd(), ".env")); } catch {}

const db = new PrismaClient({ adapter: createPgAdapter() });

/** Whole dollars -> minor units. */
const $ = (whole: number) => BigInt(whole) * 100n;

const ADMIN_EMAIL = "johntest@gmail.com";
const ADMIN_PASSWORD = "johntest123";

async function main() {
  // --- Roles -------------------------------------------------------------
  const roles: Array<{ key: RoleKey; name: string; permissions: string[] }> = [
    { key: "USER", name: "Participant", permissions: [] },
    { key: "SUPPORT_ADMIN", name: "Support", permissions: ["user:read", "deposit:read", "withdrawal:read"] },
    { key: "FINANCE_ADMIN", name: "Finance", permissions: ["deposit:*", "withdrawal:*", "ledger:read", "ledger:adjust"] },
    { key: "ADMIN", name: "Administrator", permissions: ["user:*", "deposit:*", "withdrawal:*", "draw:*", "bumper:*", "ledger:read"] },
    { key: "SUPER_ADMIN", name: "Super administrator", permissions: ["*"] },
  ];
  for (const role of roles) {
    await db.role.upsert({
      where: { key: role.key },
      update: { name: role.name, permissions: role.permissions },
      create: { key: role.key, name: role.name, permissions: role.permissions },
    });
  }

  // --- Plans -------------------------------------------------------------
  // Rules (i), (ii), (vi). Plan 1 is fully specified by the notes. The brief
  // asks for five plans but the notes define only this one, so the rest are
  // DRAFT with no values rather than invented. DRAFT plans are not selectable.
  await db.plan.upsert({
    where: { slug: "plan-1" },
    update: {},
    create: {
      name: "Plan 1",
      slug: "plan-1",
      description: "Participation package with monthly draw entry and referral commission.",
      depositAmount: $(10),                     // rule (i)
      lockPeriodDays: 40,                       // rule (ii)
      commissionAmount: $(3),                   // rule (vi)
      commissionRequiresActivePrincipal: true,  // rule (vi), the clawback clause
      drawEligible: true,
      status: "ACTIVE",
      sortOrder: 1,
    },
  });
  for (const n of [2, 3, 4, 5]) {
    await db.plan.upsert({
      where: { slug: `plan-${n}` },
      update: {},
      create: {
        name: `Plan ${n}`,
        slug: `plan-${n}`,
        description: "Awaiting deposit amount, lock period and commission rate.",
        depositAmount: 0n, lockPeriodDays: 0, commissionAmount: 0n,
        drawEligible: false, status: "DRAFT", sortOrder: n,
      },
    });
  }

  // --- Bumper thresholds — rules (vii), (viii) ----------------------------
  for (const bumper of [
    { name: "100 referrals", threshold: 100, prizeType: "CASH" as const, prizeAmount: $(100), itemName: null, winnerChooses: false },
    { name: "300 referrals", threshold: 300, prizeType: "PHYSICAL" as const, prizeAmount: $(500), itemName: "Honda 70cc motorcycle", winnerChooses: true },
  ]) {
    await db.bumperEvent.upsert({
      where: { threshold: bumper.threshold }, update: {}, create: bumper,
    });
  }

  // --- Settings ----------------------------------------------------------
  const settings: Array<[string, Prisma.InputJsonValue, string]> = [
    ["draw.schedule", { frequency: "MONTHLY", dayOfMonth: "LAST" }, "Rule (iii): draws run on the last day of each month."],
    ["draw.entryCutoffDay", 25, "Rule (xi): entries after this day roll into the next draw."],
    ["draw.defaultPrizeTiers",
      [{ name: "Tier 1", winnerCount: 250, prizeAmount: "20000" },
       { name: "Tier 2", winnerCount: 500, prizeAmount: "5000" }],
      "Rule (iv). The handwritten line is ambiguous — see open questions in DECODED-SPEC.md. Minor units."],
    ["draw.selectionMode", "MANUAL", "Section 8: admin-controlled for MVP; RANDOM uses the same code path."],
    ["withdrawal.windows.COMMISSION", [{ startDay: 1, endDay: 2 }, { startDay: 16, endDay: 17 }], "Rule (x)."],
    ["withdrawal.windows.PRIZE", [{ startDay: 1, endDay: 2 }], "Rule (v)."],
    ["withdrawal.windows.BUMPER", "ANY_TIME", "Rule (ix)."],
    ["withdrawal.windows.PRINCIPAL", "ANY_TIME_AFTER_LOCK", "Rule (ii): governed by the plan lock period."],
    ["withdrawal.minimumAmount", "100", "Minor units. Operational floor, not from the notes."],
    ["accrual.grants", [{ threshold: 1000, dailyAmount: "1000", holdDays: 30 }], "Rule (xiv): 1000 referrals accrue $10/day, withdrawable after a month."],
    ["payment.methods", ["USDT_TRC20", "USDT_BEP20", "EASYPAISA", "JAZZCASH"], "Rule (xii) plus the sketch-page margin note."],
    ["payment.addresses", { USDT_TRC20: "", USDT_BEP20: "", EASYPAISA: "", JAZZCASH: "" }, "Rule (xii): deposit addresses. Empty until the business provides them."],
    ["locales.enabled", ["en", "ur"], "Rule (xiii)."],
    ["compliance.termsVersion", "0.1-draft", "Section 48: acceptance is recorded against a version."],
  ];
  for (const [key, value, description] of settings) {
    await db.setting.upsert({
      where: { key }, update: { description }, create: { key, value, description },
    });
  }

  // --- Platform ledger accounts ------------------------------------------
  for (const kind of ["PLATFORM_CASH", "PRIZE_POOL", "COMMISSION_EXPENSE", "DEPOSIT_LIABILITY"] as const) {
    await db.ledgerAccount.upsert({
      where: { kind_ownerKey_currency: { kind, ownerKey: "PLATFORM", currency: "USD" } },
      update: {},
      create: { kind, ownerKey: "PLATFORM", currency: "USD" },
    });
  }

  // --- Initial administrator ---------------------------------------------
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      fullName: "John Test",
      referralCode: "PN-ADMIN1",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const superAdmin = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdmin.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdmin.id },
  });
  await db.wallet.upsert({
    where: { userId: admin.id }, update: {}, create: { userId: admin.id },
  });

  console.log("Seeded configuration:", {
    roles: await db.role.count(),
    plans: await db.plan.count(),
    activePlans: await db.plan.count({ where: { status: "ACTIVE" } }),
    bumperEvents: await db.bumperEvent.count(),
    settings: await db.setting.count(),
    platformAccounts: await db.ledgerAccount.count({ where: { userId: null } }),
    users: await db.user.count(),
  });
  console.log(`Administrator: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}  (SUPER_ADMIN)`);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => db.$disconnect());
