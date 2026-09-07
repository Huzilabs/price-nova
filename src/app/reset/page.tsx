import { AuthFrame } from "@/components/shell/AuthFrame";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthFrame
      title="Choose a new password"
      subtitle={token ? "Pick something you haven't used before." : "This link is missing its token."}
      footer={{ text: "Back to", href: "/login", label: "sign in" }}
    >
      {token ? <ResetForm token={token} /> : null}
    </AuthFrame>
  );
}
