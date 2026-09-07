"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin, primaryRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import * as participation from "@/server/services/participation";
import * as withdrawals from "@/server/services/withdrawal";
import * as draws from "@/server/services/draw";
import * as bumper from "@/server/services/bumper";
import * as settingsService from "@/server/services/settings";
import * as audit from "@/server/services/audit";

/**
 * Admin server actions.
 *
 * Every one of these re-checks authorisation server-side. Nothing trusts the
 * fact that the button was only rendered for admins — Section 38.
 */
export type ActionState = { error?: string; ok?: string };

async function actor() {
  const admin = await requireAdmin();
  return { admin, role: primaryRole(admin) };
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

// --- Deposits --------------------------------------------------------------

export async function confirmDeposit(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    await participation.confirmDeposit({
      depositId: String(form.get("depositId")), adminId: admin.id, adminRole: role,
    });
    revalidatePath("/admin/deposits");
    revalidatePath("/admin");
    return { ok: "Deposit confirmed and participation activated." };
  } catch (error) { return fail(error); }
}

export async function rejectDeposit(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) return { error: "A rejection needs a reason." };
    await participation.rejectDeposit({
      depositId: String(form.get("depositId")), adminId: admin.id, adminRole: role, reason,
    });
    revalidatePath("/admin/deposits");
    return { ok: "Deposit rejected." };
  } catch (error) { return fail(error); }
}

// --- Withdrawals -----------------------------------------------------------

export async function moveWithdrawal(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const to = String(form.get("to")) as "APPROVED" | "PROCESSING" | "PAID" | "REJECTED";
    const reason = String(form.get("reason") ?? "").trim() || undefined;
    await withdrawals.transition({
      withdrawalId: String(form.get("withdrawalId")), to, adminId: admin.id, adminRole: role, reason,
    });
    revalidatePath("/admin/withdrawals");
    revalidatePath("/admin");
    return { ok: `Withdrawal moved to ${to.toLowerCase()}.` };
  } catch (error) { return fail(error); }
}

// --- Ledger adjustment -----------------------------------------------------

export async function adjustBalance(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) return { error: "An adjustment needs a reason — it goes in the audit log." };

    const raw = String(form.get("amount") ?? "");
    const amount = parseMoney(raw) * (String(form.get("direction")) === "debit" ? -1n : 1n);

    await withdrawals.postAdjustment({
      userId: String(form.get("userId")), amount, reason, adminId: admin.id, adminRole: role,
    });
    revalidatePath(`/admin/users/${String(form.get("userId"))}`);
    return { ok: "Adjustment posted to the ledger." };
  } catch (error) { return fail(error); }
}

// --- Users -----------------------------------------------------------------

export async function setUserStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const userId = String(form.get("userId"));
    const status = String(form.get("status")) as "ACTIVE" | "SUSPENDED" | "CLOSED";
    const reason = String(form.get("reason") ?? "").trim() || null;

    if (userId === admin.id) return { error: "You cannot change your own account status." };

    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await db.user.update({ where: { id: userId }, data: { status } });
    await audit.record({
      actorId: admin.id, actorRole: role,
      action: `user.${status.toLowerCase()}`, entityType: "User", entityId: userId,
      previousState: { status: before.status }, newState: { status }, reason,
      ipAddress: await clientIp(),
    });
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/users");
    return { ok: `Account is now ${status.toLowerCase()}.` };
  } catch (error) { return fail(error); }
}

// --- Draws -----------------------------------------------------------------

/** Parse the repeated tier[] fields the draw form posts. */
function readTiers(form: FormData) {
  const names = form.getAll("tierName").map(String);
  const counts = form.getAll("tierWinners").map(String);
  const amounts = form.getAll("tierPrize").map(String);

  return names
    .map((name, i) => ({
      name: name.trim() || `Tier ${i + 1}`,
      winnerCount: Number(counts[i] ?? 1),
      prizeAmount: parseMoney(amounts[i] ?? "0"),
    }))
    .filter((tier) => tier.winnerCount > 0 && tier.prizeAmount > 0n);
}

/** Dates arrive as local datetime-local strings; business dates are UTC. */
function readDate(form: FormData, key: string): Date {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) throw new Error(`${key} is required.`);
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : `${raw}:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${key} is not a valid date.`);
  return date;
}

export async function createDraw(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const draw = await draws.createDraw({
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      imageUrl: String(form.get("imageUrl") ?? ""),
      entryRequirement: String(form.get("entryRequirement") ?? ""),
      startsAt: readDate(form, "startsAt"),
      entryCutoffAt: readDate(form, "entryCutoffAt"),
      drawAt: readDate(form, "drawAt"),
      selectionMode: (String(form.get("selectionMode") ?? "MANUAL") as "MANUAL" | "RANDOM"),
      tiers: readTiers(form),
      adminId: admin.id, adminRole: role,
    });
    revalidatePath("/admin/draws");
    revalidatePath("/draws");
    return { ok: `${draw.name} created as a draft. Open entries when you are ready.` };
  } catch (error) { return fail(error); }
}

export async function updateDraw(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const drawId = String(form.get("drawId"));
    await draws.updateDraw({
      drawId,
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      imageUrl: String(form.get("imageUrl") ?? ""),
      entryRequirement: String(form.get("entryRequirement") ?? ""),
      startsAt: readDate(form, "startsAt"),
      entryCutoffAt: readDate(form, "entryCutoffAt"),
      drawAt: readDate(form, "drawAt"),
      selectionMode: (String(form.get("selectionMode") ?? "MANUAL") as "MANUAL" | "RANDOM"),
      tiers: readTiers(form),
      adminId: admin.id, adminRole: role,
    });
    revalidatePath("/admin/draws");
    revalidatePath(`/admin/draws/${drawId}`);
    revalidatePath("/draws");
    revalidatePath("/");
    return { ok: "Draw updated." };
  } catch (error) { return fail(error); }
}

/**
 * Designate — or clear — the homepage main draw.
 *
 * Revalidates the homepage so the change is visible immediately rather than
 * after a cache expiry; the designation itself lives in the database, never in
 * frontend state.
 */
export async function setMainDraw(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const raw = String(form.get("drawId") ?? "");
    const drawId = raw === "none" ? null : raw;

    await draws.setMainDraw({ drawId, adminId: admin.id, adminRole: role });
    revalidatePath("/");
    revalidatePath("/draws");
    revalidatePath("/admin/draws");
    return { ok: drawId ? "This draw is now the homepage main draw." : "Main draw cleared." };
  } catch (error) { return fail(error); }
}

export async function moveDraw(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const drawId = String(form.get("drawId"));
    await draws.setStatus({
      drawId, to: String(form.get("to")) as never, adminId: admin.id, adminRole: role,
    });
    revalidatePath(`/admin/draws/${drawId}`);
    revalidatePath("/admin/draws");
    return { ok: "Draw updated." };
  } catch (error) { return fail(error); }
}

export async function selectWinner(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const drawId = String(form.get("drawId"));
    const result = await draws.selectWinner({
      drawId,
      prizeTierId: String(form.get("prizeTierId")),
      userId: String(form.get("userId") ?? "") || undefined,
      adminId: admin.id,
      adminRole: role,
      ipAddress: await clientIp(),
    });
    revalidatePath(`/admin/draws/${drawId}`);
    return { ok: `Winner recorded — entry ${result.entryNumber}. Prize credited through the ledger.` };
  } catch (error) { return fail(error); }
}

// --- Bumper ----------------------------------------------------------------

export async function issueBumper(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    await bumper.issueBumperAward({
      awardId: String(form.get("awardId")),
      adminId: admin.id,
      adminRole: role,
      takeCash: form.get("takeCash") === "on",
    });
    revalidatePath("/admin/bumper");
    return { ok: "Bumper prize issued." };
  } catch (error) { return fail(error); }
}

// --- Plans & settings ------------------------------------------------------

export async function updatePlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const planId = String(form.get("planId"));
    const before = await db.plan.findUniqueOrThrow({ where: { id: planId } });

    const data = {
      name: String(form.get("name") ?? before.name),
      depositAmount: parseMoney(String(form.get("depositAmount") ?? "0")),
      commissionAmount: parseMoney(String(form.get("commissionAmount") ?? "0")),
      lockPeriodDays: Number(form.get("lockPeriodDays") ?? before.lockPeriodDays),
      drawEligible: form.get("drawEligible") === "on",
      commissionRequiresActivePrincipal: form.get("requiresPrincipal") === "on",
      status: String(form.get("status")) as never,
    };

    await db.plan.update({ where: { id: planId }, data });
    await audit.record({
      actorId: admin.id, actorRole: role,
      action: "plan.update", entityType: "Plan", entityId: planId,
      previousState: {
        name: before.name,
        depositAmount: before.depositAmount.toString(),
        commissionAmount: before.commissionAmount.toString(),
        lockPeriodDays: before.lockPeriodDays,
        status: before.status,
      },
      newState: {
        ...data,
        depositAmount: data.depositAmount.toString(),
        commissionAmount: data.commissionAmount.toString(),
      },
    });
    revalidatePath("/admin/plans");
    return { ok: `${data.name} updated.` };
  } catch (error) { return fail(error); }
}

export async function updateSetting(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { admin, role } = await actor();
    const key = String(form.get("key"));
    const raw = String(form.get("value") ?? "");

    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return { error: "Value must be valid JSON." }; }

    const before = await db.setting.findUnique({ where: { key } });
    await settingsService.set(key, parsed, admin.id);
    await audit.record({
      actorId: admin.id, actorRole: role,
      action: "settings.update", entityType: "Setting", entityId: key,
      previousState: { value: before?.value ?? null } as never,
      newState: { value: parsed } as never,
    });
    revalidatePath("/admin/settings");
    return { ok: `${key} updated.` };
  } catch (error) { return fail(error); }
}

// --- Maintenance jobs ------------------------------------------------------

export async function runPrincipalRelease(): Promise<ActionState> {
  try {
    await actor();
    const result = await participation.releaseMaturedPrincipal();
    revalidatePath("/admin");
    return { ok: `${result.released} principal(s) released of ${result.considered} due.` };
  } catch (error) { return fail(error); }
}
