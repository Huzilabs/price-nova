"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clearSessionCookie } from "@/lib/session";
import * as verification from "@/server/services/verification";
import * as audit from "@/server/services/audit";

export type AccountState = { error?: string; ok?: string };

function fail(error: unknown): AccountState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function requestEmailVerification(): Promise<AccountState> {
  try {
    const user = await requireUser();
    const result = await verification.sendEmailVerification(user.id);
    revalidatePath("/profile");
    return {
      ok: "alreadyVerified" in result
        ? "Your email is already verified."
        : "Verification email sent. Check your inbox.",
    };
  } catch (error) { return fail(error); }
}

export async function requestPhoneOtp(_prev: AccountState, form: FormData): Promise<AccountState> {
  try {
    const user = await requireUser();
    const phone = String(form.get("phone") ?? "");
    const result = await verification.sendPhoneOtp(user.id, phone);
    revalidatePath("/profile");
    return { ok: `Code sent to ${result.phone}. It expires in 10 minutes.` };
  } catch (error) { return fail(error); }
}

export async function confirmPhoneOtp(_prev: AccountState, form: FormData): Promise<AccountState> {
  try {
    const user = await requireUser();
    await verification.confirmPhoneOtp(user.id, String(form.get("code") ?? ""));
    revalidatePath("/profile");
    return { ok: "Phone number verified." };
  } catch (error) { return fail(error); }
}

export async function updateProfile(_prev: AccountState, form: FormData): Promise<AccountState> {
  try {
    const user = await requireUser();
    const fullName = String(form.get("fullName") ?? "").trim();
    if (fullName.length < 2) return { error: "Tell us your name." };

    await db.user.update({ where: { id: user.id }, data: { fullName } });
    await audit.record({
      actorId: user.id, action: "user.profile_update",
      entityType: "User", entityId: user.id, newState: { fullName },
    });
    revalidatePath("/profile");
    return { ok: "Profile updated." };
  } catch (error) { return fail(error); }
}

/**
 * Change password.
 *
 * Requires the current password even though the session proves identity — a
 * borrowed unlocked device should not be enough to lock the owner out.
 */
export async function changePassword(_prev: AccountState, form: FormData): Promise<AccountState> {
  try {
    const session = await requireUser();
    const current = String(form.get("currentPassword") ?? "");
    const next = String(form.get("newPassword") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");

    if (next.length < 8) return { error: "Use at least 8 characters." };
    if (next !== confirm) return { error: "The new passwords do not match." };

    const user = await db.user.findUniqueOrThrow({ where: { id: session.id } });
    if (!(await verifyPassword(current, user.passwordHash))) {
      return { error: "Your current password is not correct." };
    }

    await db.user.update({
      where: { id: user.id }, data: { passwordHash: await hashPassword(next) },
    });
    await audit.record({
      actorId: user.id, action: "auth.password_change",
      entityType: "User", entityId: user.id,
    });

    // Force a fresh sign-in so any other session is left holding a stale cookie.
    await clearSessionCookie();
    redirect("/login?changed=1");
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return fail(error);
  }
}

export async function requestPasswordReset(_prev: AccountState, form: FormData): Promise<AccountState> {
  try {
    await verification.sendPasswordReset(String(form.get("email") ?? ""));
    return { ok: "If that address has an account, a reset link is on its way." };
  } catch (error) { return fail(error); }
}

export async function completePasswordReset(_prev: AccountState, form: FormData): Promise<AccountState> {
  try {
    const token = String(form.get("token") ?? "");
    const next = String(form.get("password") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");

    if (next.length < 8) return { error: "Use at least 8 characters." };
    if (next !== confirm) return { error: "The passwords do not match." };

    await verification.consumePasswordReset(token, await hashPassword(next));
    redirect("/login?reset=1");
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return fail(error);
  }
}
