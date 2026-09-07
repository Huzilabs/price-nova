import { signOut } from "@/server/actions/auth";
import { Button } from "@/components/primitives/Button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline" size="lg" fullWidth>Sign out</Button>
    </form>
  );
}
