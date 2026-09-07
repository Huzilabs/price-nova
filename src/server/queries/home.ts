import "server-only";
import { db } from "@/lib/db";
import { getMainDraw, listPublicDraws } from "@/server/services/draw";
import { publicName } from "@/components/reward/WinnerCard";

/**
 * Everything the home screen needs, for a visitor or a member.
 *
 * The public half runs with no session — a signed-out visitor sees the real
 * draw, the real participant count and the real recent winners. That is the
 * point: the proof that the thing works has to be visible *before* anyone is
 * asked to sign up.
 */
export async function getPublicHome() {
  const [draw, winners, totals, bumpers, catalogue] = await Promise.all([
    getMainDraw(),
    db.drawWinner.findMany({
      include: { user: true, draw: true, prizeTier: true },
      orderBy: { selectedAt: "desc" },
      take: 6,
    }),
    // Plain reads: no transaction. Wrapping aggregates in $transaction takes a
    // pooler slot for no isolation benefit and times out under load.
    Promise.all([
      db.participation.count({ where: { status: "ACTIVE" } }),
      db.prize.aggregate({ where: { status: { in: ["ISSUED", "FULFILLED"] } }, _sum: { amount: true } }),
      db.commission.aggregate({ _sum: { amount: true } }),
    ]),
    db.bumperEvent.findMany({ where: { status: "ACTIVE" }, orderBy: { threshold: "asc" } }),
    listPublicDraws(),
  ]);

  const [activeParticipants, prizeSum, commissionSum] = totals;

  return {
    draw,
    bumpers,
    otherDraws: catalogue.all.filter((d) => d.id !== draw?.id),
    liveCount: catalogue.active.length,
    winners: winners.map((winner) => ({
      id: winner.id,
      name: publicName(winner.user.fullName),
      prize: winner.prizeTier.prizeAmount,
      drawName: winner.draw.name,
      date: winner.selectedAt,
    })),
    stats: {
      activeParticipants,
      prizesPaid: prizeSum._sum.amount ?? 0n,
      commissionPaid: commissionSum._sum.amount ?? 0n,
    },
  };
}

/** The personal half. Only called when there is a session. */
export async function getMemberHome(userId: string) {
  const [user, referrals, entriesCount, wins, movements] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        wallet: true,
        participations: { where: { status: "ACTIVE" }, include: { plan: true }, take: 1 },
        commissions: true,
        bumperAwards: { include: { bumperEvent: true } },
      },
    }),
    db.referral.findMany({ where: { referrerId: userId } }),
    db.drawEntry.count({ where: { userId } }),
    // Only a confirmed DrawWinner row can produce the celebration state.
    db.drawWinner.findMany({
      where: { userId },
      include: { draw: true, prizeTier: true },
      orderBy: { selectedAt: "desc" },
      take: 1,
    }),
    db.ledgerEntry.findMany({
      where: { account: { userId } },
      include: { transaction: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    user,
    wallet: user.wallet,
    participation: user.participations[0] ?? null,
    qualifying: referrals.filter((r) => r.qualified).length,
    totalReferrals: referrals.length,
    commissionEarned: user.commissions.reduce((total, c) => total + c.amount, 0n),
    awards: user.bumperAwards,
    entriesCount,
    latestWin: wins[0] ?? null,
    movements,
  };
}
