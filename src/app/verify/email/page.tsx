import { confirmEmail } from "@/server/services/verification";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";

export const metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

/** The landing page for the emailed link. The token is consumed server-side. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let error: string | null = null;
  if (!token) {
    error = "That link is missing its token.";
  } else {
    try {
      await confirmEmail(token);
    } catch (e) {
      error = e instanceof Error ? e.message : "That link could not be used.";
    }
  }

  return (
    <AuthFrame
      title={error ? "Link not valid" : "Email verified"}
      subtitle={error ?? "Your email address is confirmed."}
      footer={{ text: error ? "Need a new link?" : "All set.", href: "/profile", label: "Go to profile" }}
    >
      <Card tone={error ? "default" : "mint"} className="p-5">
        <p className="text-sm leading-relaxed text-mid">
          {error
            ? "Verification links expire after 24 hours and can only be used once. Request a fresh one from your profile."
            : "You can now use every part of your account. Next: verify your phone, then pick a plan to enter the draw."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button href="/profile" variant={error ? "primary" : "solid"} size="lg" fullWidth>
            {error ? "Request a new link" : "Back to profile"}
          </Button>
          {!error && (
            <Button href="/join" variant="primary" size="lg" fullWidth>Participate</Button>
          )}
        </div>
      </Card>
    </AuthFrame>
  );
}
