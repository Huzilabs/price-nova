/**
 * Ledger repair.
 *
 * Deletes transactions left with fewer than two entries — which can only
 * happen if something deleted entries out from under a transaction — and
 * rebuilds every account balance from the surviving entries.
 *
 * This is a maintenance tool, not an application path: the app never deletes
 * ledger rows. Run it after `verifyIntegrity()` reports a problem, and read
 * what it says before agreeing to it.
 *
 *   npx tsx --conditions=react-server scripts/repair-ledger.mts [--apply]
 */
import { PrismaClient } from "@prisma/client";
import { createPgAdapter } from "../src/lib/pg";

process.loadEnvFile(".env");
const db = new PrismaClient({ adapter: createPgAdapter() });
const apply = process.argv.includes("--apply");

const orphans = await db.$queryRaw<Array<{ id: string }>>`
  SELECT t."id"
  FROM "LedgerTransaction" t
  LEFT JOIN "LedgerEntry" e ON e."transactionId" = t."id"
  GROUP BY t."id"
  HAVING COUNT(e."id") < 2
`;
console.log(`${orphans.length} transaction(s) with fewer than two entries`);

if (apply && orphans.length > 0) {
  const ids = orphans.map((o) => o.id);
  await db.ledgerEntry.deleteMany({ where: { transactionId: { in: ids } } });
  const removed = await db.ledgerTransaction.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${removed.count} orphaned transaction(s)`);
}

// Rebuild every account balance from its entries.
const accounts = await db.ledgerAccount.findMany();
let repaired = 0;
for (const account of accounts) {
  const debitNormal = ["PLATFORM_CASH", "PRIZE_POOL", "COMMISSION_EXPENSE"].includes(account.kind);
  const entries = await db.ledgerEntry.findMany({ where: { accountId: account.id } });
  const computed = entries.reduce((total, entry) => {
    const increases = debitNormal ? entry.direction === "DEBIT" : entry.direction === "CREDIT";
    return total + (increases ? entry.amount : -entry.amount);
  }, 0n);

  if (computed !== account.balance) {
    console.log(`${account.kind} ${account.ownerKey.slice(-8)}: stored ${account.balance} -> ${computed}`);
    repaired += 1;
    if (apply) {
      await db.ledgerAccount.update({ where: { id: account.id }, data: { balance: computed } });
    }
  }
}
console.log(`${repaired} account balance(s) ${apply ? "corrected" : "would change"}`);

if (apply) {
  for (const wallet of await db.wallet.findMany({ select: { userId: true } })) {
    const { refreshWallet } = await import("../src/server/services/ledger");
    await refreshWallet(wallet.userId);
  }
  console.log("wallets refreshed");
}

console.log(apply ? "done" : "dry run — pass --apply to write");
await db.$disconnect();
