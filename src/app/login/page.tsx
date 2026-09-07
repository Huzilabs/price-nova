import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSessionUser();
  if (session) redirect(session.isAdmin ? "/admin" : "/");

  const { next } = await searchParams;

  return (
    <AuthFrame
      title="Welcome back"
      subtitle="Pick up your entries, your team and your rewards."
      footer={{ text: "New here?", href: "/signup", label: "Create an account" }}
    >
      <LoginForm next={next} />
    </AuthFrame>
  );
}
