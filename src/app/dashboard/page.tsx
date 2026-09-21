import { redirect } from "next/navigation";

/** Wave 0 dashboard → Wave 1 missions. */
export default function DashboardRedirectPage() {
  redirect("/app/missions");
}
