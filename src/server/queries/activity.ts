import "server-only";
import { db } from "@/lib/db";

/**
 * A user's money movements, as a person reads them.
 *
 * The ledger is double entry, so one event is several rows. An unlock is
 * `DEBIT locked / CREDIT available` — both legs belong to the same user, and
 * rendering them raw showed "Principal unlocked +$10.00" directly above
 * "Principal unlocked −$10.00", which reads as gaining and losing the money.
 *
 * So: group by transaction, then classify by the NET effect on what the user
 * holds in total.
 *   net > 0  → money arrived        (commission, prize, deposit)
 *   net < 0  → money left           (a payout)
 *   net = 0  → moved between their own buckets (unlock, withdrawal reserve)
 *
 * The admin ledger still shows every leg — an operator needs the entries.
 * This view is for the person whose money it is.
 */
export type Movement = {
  id: string;
  type: string;
  description: string;
  at: Date;
  /** Signed net change in total holdings. Zero for internal transfers. */
  net: bigint;
  /** Magnitude to display, which for an internal transfer is the amount moved. */
  amount: bigint;
  direction: "in" | "out" | "moved";
  /** Where it went, for internal transfers: "locked → available". */
  movedTo?: string;
};

const BUCKET = { USER_AVAILABLE: "available", USER_LOCKED: "locked", USER_PENDING: "pending" } as const;

export async function getMovements(userId: string, take = 100): Promise<Movement[]> {
  const entries = await db.ledgerEntry.findMany({
    where: { account: { userId } },
    include: { transaction: true, account: true },
    orderBy: { createdAt: "desc" },
    take: take * 2, // two legs per internal transfer
  });

  const byTransaction = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byTransaction.get(entry.transactionId);
    if (list) list.push(entry);
    else byTransaction.set(entry.transactionId, [entry]);
  }

  const movements: Movement[] = [];
  for (const [id, legs] of byTransaction) {
    const first = legs[0]!;
    let net = 0n;
    let credited = 0n;
    for (const leg of legs) {
      if (leg.direction === "CREDIT") { net += leg.amount; credited += leg.amount; }
      else net -= leg.amount;
    }

    const internal = net === 0n && legs.length > 1;
    const from = legs.find((l) => l.direction === "DEBIT")?.account.kind;
    const to = legs.find((l) => l.direction === "CREDIT")?.account.kind;

    movements.push({
      id,
      type: first.transaction.type,
      description: first.transaction.description,
      at: first.createdAt,
      net,
      amount: internal ? credited : net < 0n ? -net : net,
      direction: internal ? "moved" : net > 0n ? "in" : "out",
      movedTo: internal && from && to
        ? `${BUCKET[from as keyof typeof BUCKET] ?? from} → ${BUCKET[to as keyof typeof BUCKET] ?? to}`
        : undefined,
    });
  }

  return movements.slice(0, take);
}

export const MOVEMENT_LABELS: Record<string, string> = {
  DEPOSIT: "Deposit",
  REFERRAL_COMMISSION: "Referral commission",
  LUCKY_DRAW_REWARD: "Draw prize",
  BUMPER_PRIZE: "Bumper reward",
  DAILY_ACCRUAL: "Daily income",
  WITHDRAWAL: "Withdrawal",
  UNLOCK: "Principal unlocked",
  LOCK: "Principal locked",
  ADJUSTMENT: "Adjustment",
  REFUND: "Refund",
  FEE: "Fee",
};
