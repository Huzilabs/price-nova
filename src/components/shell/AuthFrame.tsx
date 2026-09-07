import Link from "next/link";
import { Wordmark } from "./Wordmark";

/** Shared frame for sign in / sign up. Centred, calm, one job per screen. */
export function AuthFrame({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: { text: string; href: string; label: string };
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5">
        <Link href="/" className="inline-flex rounded-md"><Wordmark /></Link>
      </header>

      <main className="flex grow items-start justify-center px-5 py-6 sm:items-center">
        <div className="w-full max-w-[24rem]">
          <h1 className="font-display text-h1 font-extrabold leading-tight tracking-[-0.03em] text-hi">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-mid">{subtitle}</p>}
          <div className="mt-7">{children}</div>

          <p className="mt-6 text-center text-sm text-mid">
            {footer.text}{" "}
            <Link href={footer.href} className="font-bold text-mint hover:underline">
              {footer.label}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
