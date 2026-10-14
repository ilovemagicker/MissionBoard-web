import { redirect } from "next/navigation";
import {
  normalizeShareCode,
  sanitizeNextPath,
  spacesFamilyAppPath,
  spacesInviteAppPath,
} from "@/lib/deep-links";
import { getSession } from "@/lib/session";

/**
 * Public space-invite deep link: `/join?code=MB-xxxx-xxxx`
 * (also accepts `invite=`). Family codes are forwarded to `/join/family`.
 */
export default async function JoinSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; invite?: string }>;
}) {
  const sp = await searchParams;
  const code = normalizeShareCode(sp.code || sp.invite);
  const { user, configured } = await getSession();

  if (!code) {
    if (!configured || !user) {
      redirect(`/login?next=${encodeURIComponent("/app/spaces")}`);
    }
    redirect("/app/spaces");
  }

  if (/^MB-FAM-/i.test(code)) {
    redirect(`/join/family?code=${encodeURIComponent(code)}`);
  }

  const dest = spacesInviteAppPath(code);
  if (!configured || !user) {
    redirect(`/login?next=${encodeURIComponent(sanitizeNextPath(dest))}`);
  }
  redirect(dest);
}
