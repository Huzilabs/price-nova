import "server-only";
import { randomInt } from "node:crypto";
import { type DrawStatus } from "@prisma/client";
import { db } from "@/lib/db";
import * as ledger from "./ledger";
import * as audit from "./audit";
import * as notify from "./notification";
import * as settings from "./settings";
import { drawEligibility } from "./eligibility";

/**
 * Draws — rules (iii), (iv), (xi). Section 6, 7, 8.
 *
 * The important design decision is the entry snapshot. Eligibility is
 * time-dependent (it depends on participations, which change), so a draw whose
 * participants are computed live cannot be audited after the fact — "who was
 * eligible in September?" becomes unanswerable the moment anyone's status
 * changes. Closing entries freezes the list into DrawEntry rows, and every
 * later step reads from that.
 */
export class DrawError extends Error {}

const TRANSITIONS: Record<DrawStatus, readonly DrawStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["ENTRY_CLOSED", "CANCELLED"],
  ENTRY_CLOSED: ["READY_FOR_DRAW", "CANCELLED"],
  READY_FOR_DRAW: ["WINNER_SELECTED", "CANCELLED"],
  WINNER_SELECTED: ["PRIZE_ISSUED"],
  PRIZE_ISSUED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Last day of the month containing `date`, at 19:00 UTC. */
function lastDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 19, 0, 0));
}

export async function createMonthlyDraw(input: { month?: Date; adminId: string; adminRole: string }) {
  const month = input.month ?? new Date();
  const drawAt = lastDayOfMonth(month);
  const cutoffDay = await settings.get<number>("draw.entryCutoffDay", 25);
  const entryCutoffAt = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), cutoffDay, 23, 59, 59),
  );

  const name = `${month.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} Monthly Draw`;
  const tiers = await settings.get<Array<{ name: string; winnerCount: number; prizeAmount: string }>>(
    "draw.defaultPrizeTiers", [],
  );

  const draw = await db.draw.create({
    data: {
      name,
      description: "One entry for every active participation. Winners are drawn on the last day of the month and paid straight into your wallet.",
      status: "DRAFT",
      entryCutoffAt,
      drawAt,
      selectionMode: await settings.get("draw.selectionMode", "MANUAL"),
      prizeTiers: {
        create: tiers.map((tier, index) => ({
          name: tier.name,
          winnerCount: tier.winnerCount,
          prizeAmount: BigInt(tier.prizeAmount),
          sortOrder: index,
        })),
      },
    },
    include: { prizeTiers: true },
  });

  await audit.record({
    actorId: input.adminId, actorRole: input.adminRole,
    action: "draw.create", entityType: "Draw", entityId: draw.id,
    newState: { name, drawAt: drawAt.toISOString(), entryCutoffAt: entryCutoffAt.toISOString() },
  });
  return draw;
}

export async function setStatus(input: {
  drawId: string; to: DrawStatus; adminId: string; adminRole: string;
}) {
  const draw = await db.draw.findUniqueOrThrow({ where: { id: input.drawId } });
  if (draw.status === input.to) return draw;
  if (!TRANSITIONS[draw.status].includes(input.to)) {
    throw new DrawError(`Cannot move a draw from ${draw.status} to ${input.to}`);
  }

  // Closing entries is what freezes the participant list.
  if (input.to === "ENTRY_CLOSED") await snapshotEntries(draw.id);

  const updated = await db.draw.update({ where: { id: draw.id }, data: { status: input.to } });
  await audit.record({
    actorId: input.adminId, actorRole: input.adminRole,
    action: `draw.${input.to.toLowerCase()}`, entityType: "Draw", entityId: draw.id,
    previousState: { status: draw.status }, newState: { status: input.to },
  });
  return updated;
}

/**
 * Freeze the eligible participants into DrawEntry rows. Idempotent: the
 * unique index on (drawId, userId) means re-running adds nobody twice.
 */
export async function snapshotEntries(drawId: string) {
  const draw = await db.draw.findUniqueOrThrow({ where: { id: drawId } });

  const candidates = await db.participation.findMany({
    where: { status: "ACTIVE", activatedAt: { lte: draw.entryCutoffAt }, plan: { drawEligible: true } },
    select: { userId: true },
    distinct: ["userId"],
  });

  const existing = await db.drawEntry.count({ where: { drawId } });
  let sequence = existing;
  let added = 0;

  for (const candidate of candidates) {
    const eligibility = await drawEligibility(candidate.userId, draw.entryCutoffAt);
    if (!eligibility.eligible) continue;

    sequence += 1;
    const prefix = draw.drawAt.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase();
    const entryNumber = `${prefix}-${String(draw.drawAt.getUTCFullYear()).slice(2)}-${String(sequence).padStart(5, "0")}`;

    try {
      await db.drawEntry.create({
        data: { drawId, userId: candidate.userId, entryNumber, eligibilityNote: eligibility.reasons.join("; ") },
      });
      added += 1;
    } catch {
      sequence -= 1; // already entered
    }
  }
  return { total: await db.drawEntry.count({ where: { drawId } }), added };
}

/**
 * Select a winner for a prize tier.
 *
 * Section 8: manual selection is the MVP requirement, but both modes run
 * through this one path so switching is configuration rather than a rewrite.
 * Either way the selection is recorded in the audit log with the admin who
 * made it — that is the whole point of allowing manual selection at all.
 */
export async function selectWinner(input: {
  drawId: string;
  prizeTierId: string;
  adminId: string;
  adminRole: string;
  /** Required for MANUAL; ignored for RANDOM. */
  userId?: string;
  ipAddress?: string | null;
}) {
  return db.$transaction(async (tx) => {
    const draw = await tx.draw.findUniqueOrThrow({
      where: { id: input.drawId },
      include: { prizeTiers: true },
    });
    if (draw.status !== "READY_FOR_DRAW" && draw.status !== "WINNER_SELECTED") {
      throw new DrawError(`Draw must be READY_FOR_DRAW to select a winner (it is ${draw.status})`);
    }

    const tier = draw.prizeTiers.find((t) => t.id === input.prizeTierId);
    if (!tier) throw new DrawError("Prize tier does not belong to this draw");

    const alreadyWon = await tx.drawWinner.count({ where: { drawId: draw.id, prizeTierId: tier.id } });
    if (alreadyWon >= tier.winnerCount) {
      throw new DrawError(`${tier.name} already has its ${tier.winnerCount} winner(s)`);
    }

    let winnerId = input.userId;
    if (draw.selectionMode === "RANDOM" || !winnerId) {
      // Anyone already holding a prize in this draw is excluded.
      const pool = await tx.drawEntry.findMany({
        where: { drawId: draw.id, user: { drawWins: { none: { drawId: draw.id } } } },
        select: { userId: true },
      });
      if (pool.length === 0) throw new DrawError("No eligible entries remain");
      winnerId = pool[randomInt(pool.length)]!.userId;
    }

    const entry = await tx.drawEntry.findUnique({
      where: { drawId_userId: { drawId: draw.id, userId: winnerId } },
    });
    if (!entry) throw new DrawError("That user did not have an entry in this draw");

    const prize = await tx.prize.create({
      data: {
        userId: winnerId,
        prizeType: "CASH",
        amount: tier.prizeAmount,
        sourceType: "DRAW",
        sourceId: draw.id,
        status: "ISSUED",
        issuedById: input.adminId,
        issuedAt: new Date(),
      },
    });

    const { transaction } = await ledger.post({
      type: "LUCKY_DRAW_REWARD",
      description: `${draw.name} — ${tier.name}`,
      idempotencyKey: `draw:${draw.id}:tier:${tier.id}:winner:${winnerId}`,
      referenceType: "draw",
      referenceId: draw.id,
      createdByAdminId: input.adminId,
      postings: [
        { kind: "PRIZE_POOL", userId: null, direction: "DEBIT", amount: tier.prizeAmount },
        { kind: "USER_AVAILABLE", userId: winnerId, direction: "CREDIT", amount: tier.prizeAmount },
      ],
    }, tx);
    await tx.prize.update({ where: { id: prize.id }, data: { ledgerTxId: transaction.id } });

    const winner = await tx.drawWinner.create({
      data: {
        drawId: draw.id,
        prizeTierId: tier.id,
        userId: winnerId,
        selectedById: input.adminId,
        prizeId: prize.id,
      },
    });

    await tx.draw.update({ where: { id: draw.id }, data: { status: "WINNER_SELECTED" } });

    await audit.record({
      actorId: input.adminId,
      actorRole: input.adminRole,
      action: "draw.select_winner",
      entityType: "Draw",
      entityId: draw.id,
      previousState: { status: draw.status },
      newState: {
        status: "WINNER_SELECTED",
        winnerId, tierId: tier.id,
        entryNumber: entry.entryNumber,
        mode: draw.selectionMode,
        prizeAmount: tier.prizeAmount.toString(),
      },
      ipAddress: input.ipAddress ?? null,
    }, tx);

    await notify.notify({
      userId: winnerId,
      type: "DRAW_WON",
      title: `You won the ${draw.name}`,
      body: "Your prize has been credited to your wallet.",
      linkPath: "/draws",
    }, tx);

    return { winner, prize, entryNumber: entry.entryNumber };
  }, { timeout: 30_000 });
}

const DRAW_INCLUDE = {
  prizeTiers: { orderBy: { sortOrder: "asc" } },
  _count: { select: { entries: true, winners: true } },
} as const;

/**
 * The homepage draw.
 *
 * An administrator designates it explicitly rather than the app guessing from
 * dates — "whichever OPEN draw closes soonest" is not a product decision the
 * code should be making. If nothing is designated the homepage shows an empty
 * state; it does not silently fall back to an arbitrary draw and pretend that
 * was the intent.
 */
export async function getMainDraw() {
  return db.draw.findFirst({ where: { isMain: true }, include: DRAW_INCLUDE });
}

/**
 * Designate the main draw.
 *
 * `Draw.isMain` is `Boolean?` with a unique index and only ever holds `true`
 * or NULL. Postgres treats NULLs as distinct, so the database itself refuses a
 * second main draw — two admins clicking at once cannot produce two.
 */
export async function setMainDraw(input: {
  drawId: string | null;
  adminId: string;
  adminRole: string;
}) {
  return db.$transaction(async (tx) => {
    const previous = await tx.draw.findFirst({ where: { isMain: true } });
    if (previous && previous.id !== input.drawId) {
      await tx.draw.update({ where: { id: previous.id }, data: { isMain: null } });
    }

    let next = null;
    if (input.drawId) {
      next = await tx.draw.update({
        where: { id: input.drawId },
        data: { isMain: true },
      });
    }

    await audit.record({
      actorId: input.adminId,
      actorRole: input.adminRole,
      action: input.drawId ? "draw.set_main" : "draw.clear_main",
      entityType: "Draw",
      entityId: input.drawId ?? previous?.id ?? "none",
      previousState: { previousMainDrawId: previous?.id ?? null },
      newState: { mainDrawId: input.drawId },
    }, tx);

    return next;
  }, { timeout: 20_000 });
}

/** A single draw with everything a detail page needs. */
export async function getDraw(id: string) {
  return db.draw.findUnique({
    where: { id },
    include: {
      prizeTiers: { orderBy: { sortOrder: "asc" } },
      winners: { include: { user: true, prizeTier: true }, orderBy: { selectedAt: "desc" } },
      _count: { select: { entries: true, winners: true } },
    },
  });
}

/**
 * Which bucket a draw belongs in, from its own state and the clock.
 *
 * Derived rather than stored: a draw whose start time has passed is live
 * whether or not anybody has run a job, and storing a second "category" column
 * would be a value that can disagree with `status` and `startsAt`.
 */
export type DrawCategory = "ACTIVE" | "UPCOMING" | "COMPLETED";

export function categorise(
  draw: { status: DrawStatus; startsAt: Date },
  now: Date = new Date(),
): DrawCategory {
  if (draw.status === "COMPLETED" || draw.status === "PRIZE_ISSUED" || draw.status === "CANCELLED") {
    return "COMPLETED";
  }
  if (draw.status === "DRAFT" || draw.startsAt > now) return "UPCOMING";
  return "ACTIVE";
}

/**
 * Every draw a participant is allowed to see. DRAFT stays hidden — a draft is
 * an admin working document, not an announcement.
 */
export async function listPublicDraws() {
  const draws = await db.draw.findMany({
    where: { status: { not: "DRAFT" } },
    include: DRAW_INCLUDE,
    orderBy: [{ isMain: { sort: "desc", nulls: "last" } }, { drawAt: "asc" }],
  });

  const now = new Date();
  return {
    active: draws.filter((d) => categorise(d, now) === "ACTIVE"),
    upcoming: draws.filter((d) => categorise(d, now) === "UPCOMING"),
    completed: draws.filter((d) => categorise(d, now) === "COMPLETED"),
    all: draws,
  };
}

/** Admin list — includes drafts. */
export async function listAllDraws() {
  return db.draw.findMany({
    include: DRAW_INCLUDE,
    orderBy: [{ isMain: { sort: "desc", nulls: "last" } }, { drawAt: "desc" }],
  });
}


// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

export type DrawInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  entryRequirement?: string | null;
  startsAt: Date;
  entryCutoffAt: Date;
  drawAt: Date;
  selectionMode?: "MANUAL" | "RANDOM";
  tiers: Array<{ name: string; winnerCount: number; prizeAmount: bigint }>;
};

function validate(input: DrawInput) {
  if (!input.name.trim()) throw new DrawError("The draw needs a name.");
  if (input.entryCutoffAt <= input.startsAt) {
    throw new DrawError("Entries must close after participation opens.");
  }
  if (input.drawAt < input.entryCutoffAt) {
    throw new DrawError("The draw cannot run before entries close.");
  }
  if (input.tiers.length === 0) throw new DrawError("Add at least one prize tier.");
  for (const tier of input.tiers) {
    if (tier.winnerCount < 1) throw new DrawError(`${tier.name}: needs at least one winner.`);
    if (tier.prizeAmount <= 0n) throw new DrawError(`${tier.name}: prize must be more than zero.`);
  }
}

export async function createDraw(input: DrawInput & { adminId: string; adminRole: string }) {
  validate(input);

  const draw = await db.draw.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      entryRequirement: input.entryRequirement?.trim() || null,
      startsAt: input.startsAt,
      entryCutoffAt: input.entryCutoffAt,
      drawAt: input.drawAt,
      selectionMode: input.selectionMode ?? "MANUAL",
      status: "DRAFT",
      prizeTiers: {
        create: input.tiers.map((tier, index) => ({
          name: tier.name, winnerCount: tier.winnerCount,
          prizeAmount: tier.prizeAmount, sortOrder: index,
        })),
      },
    },
    include: { prizeTiers: true },
  });

  await audit.record({
    actorId: input.adminId, actorRole: input.adminRole,
    action: "draw.create", entityType: "Draw", entityId: draw.id,
    newState: { name: draw.name, drawAt: draw.drawAt.toISOString() },
  });
  return draw;
}

/**
 * Edit a draw.
 *
 * Prize tiers are only replaceable while no winner has been drawn — changing
 * the prize after somebody has won it would rewrite history that the ledger
 * has already acted on.
 */
export async function updateDraw(input: DrawInput & {
  drawId: string; adminId: string; adminRole: string;
}) {
  validate(input);

  const before = await db.draw.findUniqueOrThrow({
    where: { id: input.drawId },
    include: { _count: { select: { winners: true } } },
  });

  return db.$transaction(async (tx) => {
    if (before._count.winners === 0) {
      await tx.drawPrizeTier.deleteMany({ where: { drawId: input.drawId } });
      await tx.drawPrizeTier.createMany({
        data: input.tiers.map((tier, index) => ({
          drawId: input.drawId, name: tier.name, winnerCount: tier.winnerCount,
          prizeAmount: tier.prizeAmount, sortOrder: index,
        })),
      });
    }

    const draw = await tx.draw.update({
      where: { id: input.drawId },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        imageUrl: input.imageUrl?.trim() || null,
        entryRequirement: input.entryRequirement?.trim() || null,
        startsAt: input.startsAt,
        entryCutoffAt: input.entryCutoffAt,
        drawAt: input.drawAt,
        selectionMode: input.selectionMode ?? before.selectionMode,
      },
      include: { prizeTiers: true },
    });

    await audit.record({
      actorId: input.adminId, actorRole: input.adminRole,
      action: "draw.update", entityType: "Draw", entityId: draw.id,
      previousState: { name: before.name, drawAt: before.drawAt.toISOString() },
      newState: {
        name: draw.name, drawAt: draw.drawAt.toISOString(),
        tiersReplaced: before._count.winners === 0,
      },
    }, tx);

    return draw;
  }, { timeout: 20_000 });
}

/** How many entries this user holds in a given draw. */
export async function myEntries(drawId: string, userId: string | null) {
  if (!userId) return 0;
  return db.drawEntry.count({ where: { drawId, userId } });
}
