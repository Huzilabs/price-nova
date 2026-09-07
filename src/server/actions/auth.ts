"use server";

import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie, getSessionUser } from "@/lib/session";
import * as audit from "@/server/services/audit";

export type SignInState = { error?: string };

/**
 * Member sign-in. Always mints a `user` session, even for administrators —
 * the console needs its own sign-in at /admin/login.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const user = await db.user.findUnique({ where: { email } });

  // One message for "no such user" and "wrong password" alike: distinguishing
  // them turns the login form into an account-enumeration oracle. The hash is
  // still verified against a dummy when the user is missing, so the response
  // time does not leak the answer either.
  const stored = user?.passwordHash ?? "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) return { error: "Email or password is incorrect." };
  if (user.status !== "ACTIVE") return { error: `This account is ${user.status.toLowerCase()}.` };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await setSessionCookie(user.id, "user");
  await audit.record({
    actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id,
  });

  redirect(next || "/");
}

/**
 * Administrator sign-in.
 *
 * Deliberately a different action and a different route. It refuses accounts
 * without an admin role — and refuses them with the same generic message a
 * wrong password gets, so this form cannot be used to discover which of your
 * users are administrators.
 */
export async function adminSignIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const user = await db.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });

  const stored = user?.passwordHash ?? "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
  const ok = await verifyPassword(password, stored);
  const isAdmin = user?.roles.some((entry) => entry.role.key !== "USER") ?? false;

  if (!user || !ok || !isAdmin) {
    // One message for all three failures. Distinguishing "not an admin" would
    // turn this form into an administrator directory.
    if (user && ok && !isAdmin) {
      await audit.record({
        actorId: user.id, action: "auth.admin_login_denied",
        entityType: "User", entityId: user.id,
        reason: "Account holds no administrative role",
      });
    }
    return { error: "Those credentials are not valid for the admin console." };
  }
  if (user.status !== "ACTIVE") return { error: `This account is ${user.status.toLowerCase()}.` };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await setSessionCookie(user.id, "admin");
  await audit.record({
    actorId: user.id,
    actorRole: user.roles.map((r) => r.role.key).join(","),
    action: "auth.admin_login", entityType: "User", entityId: user.id,
  });

  redirect("/admin");
}

export async function signOut() {
  const user = await getSessionUser();
  if (user) {
    await audit.record({
      actorId: user.id, action: "auth.logout", entityType: "User", entityId: user.id,
    });
  }
  await clearSessionCookie();
  redirect("/login");
}


export type SignUpState = { error?: string; field?: string };

/** A referral code that is short, unambiguous and safe to read aloud. */
function newReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const bytes = randomBytes(6);
  return "PN-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const referredByCode = String(formData.get("referralCode") ?? "").trim().toUpperCase();

  if (fullName.length < 2) return { error: "Tell us your name.", field: "fullName" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email does not look right.", field: "email" };
  if (password.length < 8) return { error: "Use at least 8 characters.", field: "password" };

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "An account with that email already exists.", field: "email" };
  }

  let referrer: { id: string } | null = null;
  if (referredByCode) {
    referrer = await db.user.findUnique({
      where: { referralCode: referredByCode }, select: { id: true },
    });
    if (!referrer) return { error: "That referral code was not found.", field: "referralCode" };
  }

  const role = await db.role.findUniqueOrThrow({ where: { key: "USER" } });
  const passwordHash = await hashPassword(password);

  // Retry on the (very unlikely) referral-code collision rather than failing.
  let user: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !user; attempt += 1) {
    try {
      user = await db.user.create({
        data: {
          email, passwordHash, fullName,
          referralCode: newReferralCode(),
          referredById: referrer?.id ?? null,
          status: "ACTIVE",
          roles: { create: { roleId: role.id } },
          wallet: { create: {} },
        },
        select: { id: true },
      });
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  if (!user) return { error: "Could not create the account. Try again." };

  // The referral exists from signup; it only *qualifies* once they deposit.
  if (referrer) {
    await db.referral.create({ data: { referrerId: referrer.id, referredId: user.id } });
  }

  await audit.record({
    actorId: user.id, action: "auth.signup", entityType: "User", entityId: user.id,
    newState: { referredBy: referrer?.id ?? null },
  });

  await setSessionCookie(user.id, "user");
  redirect("/profile?welcome=1");
}
