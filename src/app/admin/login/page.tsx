import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Mark } from "@/components/shell/Wordmark";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata = { title: "Admin sign in" };

/**
 * The console's own sign-in.
 *
 * Visually distinct from the member login on purpose — an operator should
 * never be unsure which surface they are authenticating into. There is no
 * sign-up link here and no admin registration route anywhere in the app:
 * administrators are created by the seed or promoted by an existing admin.
 */
export default async function AdminLoginPage() {
  const session = await getSessionUser();
  if (session?.isAdmin && session.scope === "admin") redirect("/admin");

  return (
    <div data-density="comfortable" className="flex min-h-dvh flex-col bg-base">
      <main className="flex grow items-center justify-center px-5 py-12">
        <div className="w-full max-w-[22rem]">
          <div className="mb-7 flex items-center gap-2.5">
            <Mark className="size-7" />
            <div>
              <div className="font-display text-lg font-extrabold tracking-[-0.02em] text-hi">
                PriceNova
              </div>
              <div className="tag text-gold">Admin console</div>
            </div>
          </div>

          <h1 className="font-display text-h2 font-extrabold leading-tight tracking-[-0.025em] text-hi">
            Restricted access
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-mid">
            This console approves payouts, selects winners and adjusts balances.
            Every action is written to the audit log against your account.
          </p>

          <div className="mt-7"><AdminLoginForm /></div>

          <p className="mt-6 text-micro leading-relaxed text-faint">
            Administrator accounts cannot be self-registered. If you need access,
            an existing administrator must grant it.
          </p>
        </div>
      </main>
    </div>
  );
}
