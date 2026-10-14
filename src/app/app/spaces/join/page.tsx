import { redirect } from "next/navigation";
import {
  normalizeShareCode,
  spacesFamilyAppPath,
  spacesInviteAppPath,
} from "@/lib/deep-links";

/** Join UI lives on /app/spaces; keep route for IA / deep-link parity. */
export default async function JoinRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; invite?: string; family?: string }>;
}) {
  const sp = await searchParams;
  const family = normalizeShareCode(sp.family);
  if (family) {
    redirect(spacesFamilyAppPath(family));
  }
  const invite = normalizeShareCode(sp.code || sp.invite);
  if (invite) {
    if (/^MB-FAM-/i.test(invite)) {
      redirect(spacesFamilyAppPath(invite));
    }
    redirect(spacesInviteAppPath(invite));
  }
  redirect("/app/spaces");
}
