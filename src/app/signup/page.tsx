import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { SignUpForm } from "./SignUpForm";
import { getMainDraw } from "@/server/services/draw";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Join" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const session = await getSessionUser();
  if (session) redirect("/");

  const { ref } = await searchParams;

  // If they arrived on someone's link, say whose — it converts far better than
  // a blank code box, and it lets them catch a mistyped link before signing up.
  const referrer = ref
    ? await db.user.findUnique({
        where: { referralCode: ref.toUpperCase() }, select: { fullName: true, referralCode: true },
      })
    : null;

  const draw = await getMainDraw();
  const prize = draw?.prizeTiers[0]?.prizeAmount;

  return (
    <AuthFrame
      title="Create your account"
      subtitle={
        referrer
          ? `${referrer.fullName} invited you. You will join their team.`
          : prize
            ? `Enter this month's draw for ${formatMoney(prize, { compactCents: true })}.`
            : "Enter the monthly draw and start building your team."
      }
      footer={{ text: "Already have an account?", href: "/login", label: "Sign in" }}
    >
      <SignUpForm defaultCode={referrer?.referralCode ?? ref ?? ""} lockedReferrer={Boolean(referrer)} />
    </AuthFrame>
  );
}
