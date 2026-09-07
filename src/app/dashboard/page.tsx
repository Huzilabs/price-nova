import { redirect } from "next/navigation";

/** v1 shipped the member view at /dashboard. Home is now that view. */
export default function DashboardAlias() {
  redirect("/");
}
