import "server-only";
import { db } from "@/lib/db";

/**
 * Achievements.
 *
 * Every one is derived from a fact already in the database — a confirmed
 * deposit, a qualified referral, a draw win. Nothing here is a decoration
 * awarded for opening the app, and nothing is stored as a separate "badge"
 * row that could drift out of step with the thing it describes.
 *
 * That means an achievement can never be wrong: it is a query, not a record.
 */
export type Achievement = {
  key: string;
  title: string;
  description: string;
  earned: boolean;
  /** Progress toward earning it, when it is a counting achievement. */
  progress?: { value: number; target: number };
  earnedAt?: Date | null;
};

export async function getAchievements(userId: string): Promise<Achievement[]> {
  const [firstDeposit, qualifiedReferrals, wins, bumperAwards] = await Promise.all([
    db.deposit.findFirst({
      where: { userId, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    db.referral.findMany({
      where: { referrerId: userId, qualified: true },
      orderBy: { qualifiedAt: "asc" },
      select: { qualifiedAt: true, createdAt: true },
    }),
    db.drawWinner.findFirst({
      where: { userId }, orderBy: { selectedAt: "asc" }, select: { selectedAt: true },
    }),
    db.bumperAward.findFirst({
      where: { userId, status: "ISSUED" }, orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const count = qualifiedReferrals.length;
  const at = (n: number) => qualifiedReferrals[n - 1]?.qualifiedAt ?? qualifiedReferrals[n - 1]?.createdAt ?? null;

  const teamTier = (target: number, title: string): Achievement => ({
    key: `team-${target}`,
    title,
    description: `${target} qualified team members`,
    earned: count >= target,
    progress: count >= target ? undefined : { value: count, target },
    earnedAt: count >= target ? at(target) : null,
  });

  return [
    {
      key: "first-deposit",
      title: "First deposit",
      description: "Made your first confirmed deposit",
      earned: Boolean(firstDeposit),
      earnedAt: firstDeposit?.createdAt ?? null,
    },
    {
      key: "first-referral",
      title: "First referral",
      description: "Someone joined and completed a qualifying deposit",
      earned: count >= 1,
      progress: count >= 1 ? undefined : { value: count, target: 1 },
      earnedAt: at(1),
    },
    teamTier(10, "Squad of ten"),
    teamTier(50, "Fifty strong"),
    teamTier(100, "Century"),
    {
      key: "draw-winner",
      title: "Draw winner",
      description: "Won a monthly draw",
      earned: Boolean(wins),
      earnedAt: wins?.selectedAt ?? null,
    },
    {
      key: "bumper",
      title: "Bumper reward",
      description: "Unlocked a referral milestone reward",
      earned: Boolean(bumperAwards),
      earnedAt: bumperAwards?.createdAt ?? null,
    },
  ];
}

/** Everything the rewards page needs, in one round trip. */
export async function getRewardsOverview(userId: string) {
  const [qualified, bumpers, awards, prizes, achievements] = await Promise.all([
    db.referral.count({ where: { referrerId: userId, qualified: true } }),
    db.bumperEvent.findMany({ where: { status: "ACTIVE" }, orderBy: { threshold: "asc" } }),
    db.bumperAward.findMany({
      where: { userId }, include: { bumperEvent: true }, orderBy: { createdAt: "desc" },
    }),
    db.prize.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    getAchievements(userId),
  ]);

  return { qualified, bumpers, awards, prizes, achievements };
}
