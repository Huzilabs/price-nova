import { AuthFrame } from "@/components/shell/AuthFrame";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <AuthFrame
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link."
      footer={{ text: "Remembered it?", href: "/login", label: "Sign in" }}
    >
      <ForgotForm />
    </AuthFrame>
  );
}
