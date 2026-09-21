import { redirect } from "next/navigation";

/** Join UI lives on /app/spaces; keep route for IA parity. */
export default function JoinRedirectPage() {
  redirect("/app/spaces");
}
