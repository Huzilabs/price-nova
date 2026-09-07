import "server-only";
import { Prisma, type LedgerAccountKind, type LedgerTxType, type Direction } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * LedgerService — the only way money moves in PriceNova.
 *
 * Proper double entry. Every transaction is a set of postings that must
 * balance: total debits equal total credits, checked before anything is
 * written. Entries are append-only; there is no update or delete path.
 *
 * Account normality (which side increases the balance):
 *   debit-normal  — PLATFORM_CASH, PRIZE_POOL, COMMISSION_EXPENSE   (assets/expenses)
 *   credit-normal — USER_AVAILABLE, USER_LOCKED, USER_PENDING,
 *                   DEPOSIT_LIABILITY                               (what we owe)
 *
 * So a $10 deposit is: DEBIT platform cash 10 (asset up), CREDIT the user's
 * locked balance 10 (our liability to them up). A user's balance reads
 * naturally positive without anyone having to remember a sign convention.
 */

const DEBIT_NORMAL: ReadonlySet<LedgerAccountKind> = new Set([
  "PLATFORM_CASH", "PRIZE_POOL", "COMMISSION_EXPENSE",
] as const);

export type Posting = {
  kind: LedgerAccountKind;
  /** Null for platform accounts. */
  userId?: string | null;
  direction: Direction;
  amount: bigint;
};

export type PostInput = {
  type: LedgerTxType;
  description: string;
  /**
   * The idempotency guarantee. Derive it from the business event, not from a
   * random value — "deposit:<id>:confirm", "commission:<referralId>",
   * "accrual:<grantId>:2026-09-06". A duplicated payment callback, a
   * double-clicked approval and a re-run cron job all collide here and the
   * database rejects the second one.
   */
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  createdByAdminId?: string;
  metadata?: Prisma.InputJsonValue;
  postings: Posting[];
};

export class LedgerError extends Error {}

/** How a posting moves its account's stored balance. */
function effect(kind: LedgerAccountKind, direction: Direction, amount: bigint): bigint {
  const increasesOnDebit = DEBIT_NORMAL.has(kind);
  const isIncrease = increasesOnDebit ? direction === "DEBIT" : direction === "CREDIT";
  return isIncrease ? amount : -amount;
}

function ownerKeyFor(userId: string | null | undefined): string {
  return userId ?? "PLATFORM";
}

/**
 * Post a balanced transaction. Runs in a single database transaction: either
 * every entry, the balance updates and the wallet refresh all land, or none
 * of them do.
 */
export async function post(input: PostInput, client: Prisma.TransactionClient | null = null) {
  if (input.postings.length < 2) {
    throw new LedgerError("A transaction needs at least two postings");
  }

  let debits = 0n;
  let credits = 0n;
  for (const posting of input.postings) {
    if (posting.amount <= 0n) {
      throw new LedgerError(
        `Posting amounts must be positive; direction carries the sign (got ${posting.amount})`,
      );
    }
    if (posting.direction === "DEBIT") debits += posting.amount;
    else credits += posting.amount;
  }
  if (debits !== credits) {
    throw new LedgerError(
      `Transaction does not balance: debits ${debits} vs credits ${credits}`,
    );
  }

  const run = async (tx: Prisma.TransactionClient) => {
    // Idempotency: if this business event was already posted, return it
    // unchanged rather than posting a second time.
    const existing = await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { entries: true },
    });
    if (existing) return { transaction: existing, replayed: true as const };

    // Resolve every account up front, creating user buckets on first use.
    const accounts = new Map<string, { id: string; kind: LedgerAccountKind }>();
    for (const posting of input.postings) {
      const ownerKey = ownerKeyFor(posting.userId);
      const mapKey = `${posting.kind}:${ownerKey}`;
      if (accounts.has(mapKey)) continue;

      const account = await tx.ledgerAccount.upsert({
        where: { kind_ownerKey_currency: { kind: posting.kind, ownerKey, currency: "USD" } },
        update: {},
        create: {
          kind: posting.kind,
          ownerKey,
          userId: posting.userId ?? null,
          currency: "USD",
        },
      });
      accounts.set(mapKey, { id: account.id, kind: account.kind });
    }

    // Lock the touched accounts in a stable order. Without this, two
    // concurrent postings against the same wallet can each read the same
    // balanceBefore and write a balanceAfter that loses one of the entries.
    // Ordering by id prevents the deadlock that locking in arrival order invites.
    const accountIds = [...accounts.values()].map((a) => a.id).sort();
    await tx.$queryRaw`
      SELECT id FROM "LedgerAccount" WHERE id = ANY(${accountIds}::text[]) ORDER BY id FOR UPDATE
    `;

    const fresh = await tx.ledgerAccount.findMany({ where: { id: { in: accountIds } } });
    const balances = new Map(fresh.map((a) => [a.id, a.balance]));

    const transaction = await tx.ledgerTransaction.create({
      data: {
        type: input.type,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });

    const touchedUserIds = new Set<string>();

    for (const posting of input.postings) {
      const mapKey = `${posting.kind}:${ownerKeyFor(posting.userId)}`;
      const account = accounts.get(mapKey)!;
      const before = balances.get(account.id) ?? 0n;
      const after = before + effect(account.kind, posting.direction, posting.amount);

      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: account.id,
          direction: posting.direction,
          amount: posting.amount,
          balanceBefore: before,
          balanceAfter: after,
        },
      });

      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: { balance: after },
      });
      balances.set(account.id, after);

      if (posting.userId) touchedUserIds.add(posting.userId);
    }

    for (const userId of touchedUserIds) {
      await refreshWallet(userId, tx);
    }

    return { transaction, replayed: false as const };
  };

  try {
    return client ? await run(client) : await db.$transaction(run, { timeout: 20_000 });
  } catch (error) {
    // Two concurrent requests carrying the same idempotency key: one wins the
    // unique index, the loser reads the winner's transaction.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { entries: true },
      });
      if (winner) return { transaction: winner, replayed: true as const };
    }
    throw error;
  }
}

/**
 * Rebuild a user's wallet from their ledger accounts.
 *
 * The wallet table is a cache for fast reads. Entries remain the source of
 * truth, which is why this can be run at any time to repair it.
 */
export async function refreshWallet(userId: string, client: Prisma.TransactionClient | null = null) {
  const tx = client ?? db;

  const accounts = await tx.ledgerAccount.findMany({ where: { userId, currency: "USD" } });
  const balanceOf = (kind: LedgerAccountKind) =>
    accounts.find((a) => a.kind === kind)?.balance ?? 0n;

  // Lifetime figures come from the entries, not from the running balance —
  // a withdrawal reduces `available` but must not reduce `lifetimeEarned`.
  const credits = await tx.ledgerEntry.groupBy({
    by: ["accountId"],
    where: {
      account: { userId, kind: "USER_AVAILABLE" },
      direction: "CREDIT",
      transaction: {
        type: { in: ["REFERRAL_COMMISSION", "LUCKY_DRAW_REWARD", "BUMPER_PRIZE", "DAILY_ACCRUAL"] },
      },
    },
    _sum: { amount: true },
  });
  const lifetimeEarned = credits.reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);

  const paidOut = await tx.ledgerEntry.aggregate({
    where: {
      account: { userId, kind: "USER_PENDING" },
      direction: "DEBIT",
      transaction: { type: "WITHDRAWAL", referenceType: "withdrawal:payout" },
    },
    _sum: { amount: true },
  });

  const data = {
    available: balanceOf("USER_AVAILABLE"),
    locked: balanceOf("USER_LOCKED"),
    pending: balanceOf("USER_PENDING"),
    lifetimeEarned,
    lifetimeWithdrawn: paidOut._sum.amount ?? 0n,
  };

  await tx.wallet.upsert({
    where: { userId },
    update: data,
    create: { userId, currency: "USD", ...data },
  });

  return data;
}

/**
 * Integrity check: every transaction's entries must sum to zero, and every
 * account's stored balance must equal the sum of its entries. Exposed in the
 * admin console so the books can be proved rather than trusted.
 */
export async function verifyIntegrity() {
  const unbalanced = await db.$queryRaw<Array<{ transactionId: string; delta: bigint }>>`
    SELECT e."transactionId",
           SUM(CASE WHEN e."direction" = 'DEBIT' THEN e."amount" ELSE -e."amount" END) AS delta
    FROM "LedgerEntry" e
    GROUP BY e."transactionId"
    HAVING SUM(CASE WHEN e."direction" = 'DEBIT' THEN e."amount" ELSE -e."amount" END) <> 0
  `;

  const drifted = await db.$queryRaw<Array<{ id: string; kind: string; stored: bigint; computed: bigint }>>`
    SELECT a."id", a."kind", a."balance" AS stored,
           COALESCE(SUM(
             CASE
               WHEN a."kind" IN ('PLATFORM_CASH','PRIZE_POOL','COMMISSION_EXPENSE')
                 THEN CASE WHEN e."direction" = 'DEBIT' THEN e."amount" ELSE -e."amount" END
               ELSE CASE WHEN e."direction" = 'CREDIT' THEN e."amount" ELSE -e."amount" END
             END
           ), 0) AS computed
    FROM "LedgerAccount" a
    LEFT JOIN "LedgerEntry" e ON e."accountId" = a."id"
    GROUP BY a."id", a."kind", a."balance"
    HAVING a."balance" <> COALESCE(SUM(
             CASE
               WHEN a."kind" IN ('PLATFORM_CASH','PRIZE_POOL','COMMISSION_EXPENSE')
                 THEN CASE WHEN e."direction" = 'DEBIT' THEN e."amount" ELSE -e."amount" END
               ELSE CASE WHEN e."direction" = 'CREDIT' THEN e."amount" ELSE -e."amount" END
             END
           ), 0)
  `;

  return {
    ok: unbalanced.length === 0 && drifted.length === 0,
    unbalancedTransactions: unbalanced,
    driftedAccounts: drifted,
  };
}
