import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { Mark } from "./Wordmark";
import { Button } from "@/components/primitives/Button";
import { Avatar } from "@/components/reward/WinnerCard";
import { BottomTabs } from "./BottomTabs";

/**
 * The member/visitor shell.
 *
 * Mobile-first, which here means the primary navigation is a bottom tab bar —
 * thumb-reachable, always visible, the pattern people already know from every
 * app they use. The top bar carries identity and the wallet balance only.
 *
 * A signed-out visitor gets the same shell with sign-in actions instead of a
 * balance. They are not redirected away: the draw, the rewards and the winners
 * are the pitch, and hiding them behind a login wall would be the single
 * biggest own goal available to this product.
 */
export function AppShell({
  session, balance, children,
}: {
  session: SessionUser | null;
  balance?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[62rem] items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 rounded-md">
            <Mark className="size-6" />
            <span className="font-display text-lg font-extrabold tracking-[-0.02em] text-hi">
              PriceNova
            </span>
          </Link>

          {/* Desktop nav. On mobile this lives in the bottom bar instead. */}
          <nav className="ms-6 hidden items-center gap-1 lg:flex" aria-label="Main">
            {([
              { href: "/", label: "Home" },
              { href: "/draws", label: "Draws" },
              { href: "/entries", label: "Entries" },
              { href: "/rewards", label: "Rewards" },
              { href: "/referrals", label: "Team" },
              { href: "/wallet", label: "Wallet" },
              { href: "/activity", label: "Activity" },
            ] as const).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-mid transition-colors duration-(--dur-1) hover:bg-surface-2 hover:text-hi"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {session ? (
              <>
                {balance && (
                  <Link
                    href="/wallet"
                    className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 sm:flex"
                  >
                    <span className="tag text-faint">Balance</span>
                    <span className="num text-sm font-bold text-mint">{balance}</span>
                  </Link>
                )}
                {session.isAdmin && session.scope === "admin" && (
                  <Link
                    href="/admin"
                    className="rounded-lg px-2.5 py-1.5 text-micro font-bold uppercase tracking-wider text-gold hover:bg-surface-2"
                  >
                    Admin
                  </Link>
                )}
                <Link href="/profile" aria-label="Your profile" className="rounded-full">
                  <Avatar name={session.fullName} size={32} />
                </Link>
              </>
            ) : (
              <>
                <Button href="/login" variant="ghost" size="sm">Sign in</Button>
                <Button href="/signup" variant="primary" size="sm">Join</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[62rem] px-4 pb-12 pt-5">{children}</main>

      <BottomTabs isSignedIn={Boolean(session)} />
    </div>
  );
}
