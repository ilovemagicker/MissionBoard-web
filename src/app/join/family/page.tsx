import { redirect } from "next/navigation";
import {
  normalizeShareCode,
  sanitizeNextPath,
  spacesFamilyAppPath,
} from "@/lib/deep-links";
import { getSession } from "@/lib/session";

/**
 * Public family schedule share deep link: `/join/family?code=MB-FAM-xxxx`
 */
export default async function JoinFamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = normalizeShareCode(sp.code);
  const { user, configured } = await getSession();

  if (!code) {
    if (!configured || !user) {
      redirect(`/login?next=${encodeURIComponent("/app/spaces")}`);
    }
    redirect("/app/spaces");
  }

  const dest = spacesFamilyAppPath(code);
  if (!configured || !user) {
    redirect(`/login?next=${encodeURIComponent(sanitizeNextPath(dest))}`);
  }
  redirect(dest);
}
