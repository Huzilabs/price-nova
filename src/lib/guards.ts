import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";

/**
 * Route guards.
 *
 * These run in server components, not in middleware: middleware executes on
 * the edge runtime where Prisma cannot run, and a guard that cannot read the
 * database can only trust the cookie's contents. Checking here means a
 * suspended account or a revoked admin role takes effect on the next request.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The admin console.
 *
 * Requires BOTH an admin role and a session minted at /admin/login. Holding an
 * admin role while signed in as a member is not enough — that is what stops
 * the console being reachable by typing a URL.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !user.isAdmin || user.scope !== "admin") redirect("/admin/login");
  return user;
}

/** The role recorded against an admin's actions in the audit log. */
export function primaryRole(user: SessionUser): string {
  const order = ["SUPER_ADMIN", "ADMIN", "FINANCE_ADMIN", "SUPPORT_ADMIN", "USER"];
  return order.find((role) => user.roles.includes(role as never)) ?? "USER";
}
