import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import type { RoleKey } from "@prisma/client";

/**
 * Sessions: a signed, httpOnly cookie carrying a user id and a SCOPE.
 *
 * No roles or permissions live in the cookie. They are read from the database
 * on every request, so suspending a user or revoking an admin role takes
 * effect immediately rather than whenever their cookie happens to expire —
 * which matters when the role in question can approve payouts.
 *
 * The scope is what separates the two surfaces. Signing in at /login mints a
 * `user` session; the admin console requires an `admin` session, minted only
 * at /admin/login. So an administrator browsing the member app as themselves
 * cannot reach the console by typing /admin, and a stolen member session is
 * not an admin session. Admin sessions are also short-lived.
 */
const COOKIE = "pn_session";
const USER_MAX_AGE = 60 * 60 * 12;
const ADMIN_MAX_AGE = 60 * 60 * 2;

export type SessionScope = "user" | "admin";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, scope: SessionScope): string {
  const maxAge = scope === "admin" ? ADMIN_MAX_AGE : USER_MAX_AGE;
  const expiresAt = Date.now() + maxAge * 1000;
  const nonce = randomBytes(8).toString("base64url");
  const payload = `${userId}.${scope}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): { userId: string; scope: SessionScope } | null {
  const index = token.lastIndexOf(".");
  if (index < 0) return null;

  const payload = token.slice(0, index);
  const provided = Buffer.from(token.slice(index + 1));
  const expected = Buffer.from(sign(payload));
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  const [userId, scope, expiresAt] = payload.split(".");
  if (!userId || !expiresAt) return null;
  if (scope !== "user" && scope !== "admin") return null;
  if (Number(expiresAt) < Date.now()) return null;
  return { userId, scope };
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  referralCode: string;
  locale: string;
  roles: RoleKey[];
  /** Holds an admin role. Says nothing about whether this session may use it. */
  isAdmin: boolean;
  /** Which surface this session was minted for. */
  scope: SessionScope;
  emailVerified: boolean;
  phoneVerified: boolean;
};

/** The current user, or null. Roles are always read fresh from the database. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const parsed = readToken(token);
  if (!parsed) return null;

  const user = await db.user.findUnique({
    where: { id: parsed.userId },
    include: { roles: { include: { role: true } } },
  });
  // A suspended or closed account loses its session on the next request.
  if (!user || user.status !== "ACTIVE") return null;

  const roles = user.roles.map((entry) => entry.role.key);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    referralCode: user.referralCode,
    locale: user.locale,
    roles,
    isAdmin: roles.some((role) => role !== "USER"),
    scope: parsed.scope,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
  };
}

export async function setSessionCookie(userId: string, scope: SessionScope = "user"): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, createSessionToken(userId, scope), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: scope === "admin" ? ADMIN_MAX_AGE : USER_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
