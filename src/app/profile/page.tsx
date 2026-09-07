import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";
import { Card, SectionHead } from "@/components/primitives/Card";
import { Badge, LevelBadge } from "@/components/primitives/Badge";
import { Avatar } from "@/components/reward/WinnerCard";
import { VerifyEmailPanel, VerifyPhonePanel } from "@/components/account/VerifyPanels";
import { ProfileForm, PasswordForm } from "@/components/account/ProfileForms";
import { SignOutButton } from "@/components/account/SignOutButton";
import { deliveryConfigured } from "@/server/services/delivery";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await requireUser();
  const { welcome } = await searchParams;

  const [user, qualifying] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.id } }),
    db.referral.count({ where: { referrerId: session.id, qualified: true } }),
  ]);

  const bothVerified = Boolean(user.emailVerifiedAt && user.phoneVerifiedAt);

  return (
    <AppShell session={session}>
      {welcome && (
        <Card tone="mint" className="mb-5 p-4">
          <div className="text-sm font-bold text-hi">Welcome to PriceNova 🎉</div>
          <p className="mt-1 text-sm leading-relaxed text-mid">
            Verify your email and phone below, then pick a plan to enter the draw.
          </p>
        </Card>
      )}

      <div className="flex items-center gap-4">
        <Avatar name={user.fullName} size={56} />
        <div className="min-w-0">
          <h1 className="font-display truncate text-h2 font-extrabold tracking-[-0.03em] text-hi">
            {user.fullName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LevelBadge referrals={qualifying} />
            <Badge tone={bothVerified ? "mint" : "warn"} dot>
              {bothVerified ? "Verified" : "Verification incomplete"}
            </Badge>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-mid">
        Member since {formatDate(user.createdAt)} · code{" "}
        <span className="mono text-gold">{user.referralCode}</span>
      </p>

      {!deliveryConfigured.email || !deliveryConfigured.sms ? (
        <Card tone="raised" className="mt-5 p-4">
          <div className="text-sm font-bold text-gold">Development mode</div>
          <p className="mt-1 text-sm leading-relaxed text-mid">
            No {!deliveryConfigured.email && !deliveryConfigured.sms ? "email or SMS" : !deliveryConfigured.email ? "email" : "SMS"} provider
            is configured, so messages are not actually delivered — the verification
            link and OTP are printed to the server console instead. Set
            <span className="mono"> EMAIL_PROVIDER_KEY</span> and
            <span className="mono"> SMS_PROVIDER_KEY</span> to send them for real.
          </p>
        </Card>
      ) : null}

      <section className="mt-8">
        <SectionHead kicker="Security" title="Verification" />
        <div className="space-y-3">
          <VerifyEmailPanel email={user.email} verifiedAt={user.emailVerifiedAt?.toISOString() ?? null} />
          <VerifyPhonePanel phone={user.phone} verifiedAt={user.phoneVerifiedAt?.toISOString() ?? null} />
        </div>
      </section>

      <section className="mt-8">
        <SectionHead kicker="Account" title="Your details" />
        <Card className="p-5">
          <ProfileForm fullName={user.fullName} email={user.email} />
        </Card>
      </section>

      <section className="mt-8">
        <SectionHead kicker="Security" title="Change password" />
        <Card className="p-5">
          <PasswordForm />
        </Card>
      </section>

      <section className="mt-8">
        <SignOutButton />
      </section>
    </AppShell>
  );
}
