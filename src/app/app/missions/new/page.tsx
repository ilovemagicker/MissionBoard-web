import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CreateMissionForm } from "@/components/create-mission-form";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewMissionPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let members: { user_id: string; role: string }[] = [];
  const profiles: Record<string, ProfileRow> = {};

  if (activeSpaceId) {
    const { data: memberRows } = await supabase
      .from("space_members")
      .select("user_id, role")
      .eq("space_id", activeSpaceId);
    members = (memberRows as { user_id: string; role: string }[]) ?? [];
    const ids = members.map((m) => m.user_id);
    if (ids.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", ids);
      for (const p of profileRows ?? []) {
        profiles[p.id as string] = p as ProfileRow;
      }
    }
  }

  return (
    <AppShell
      locale={locale}
      spaces={spaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="missions"
    >
      <div className="mb-4">
        <Link href="/app/missions" className="text-sm font-medium text-blue-600">
          ← {t(locale, "back")}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900">
          {t(locale, "createMission")}
        </h1>
      </div>
      {!activeSpaceId ? (
        <p className="text-sm text-slate-500">{t(locale, "noSpaces")}</p>
      ) : (
        <CreateMissionForm
          locale={locale}
          spaceId={activeSpaceId}
          members={members}
          profiles={profiles}
        />
      )}
    </AppShell>
  );
}
