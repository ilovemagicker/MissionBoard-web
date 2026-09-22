import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ScheduleClient } from "@/components/schedule-client";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { ProfileRow, ShiftRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let shifts: ShiftRow[] = [];
  let members: { user_id: string; role: string; nickname: string | null }[] =
    [];
  const profiles: Record<string, ProfileRow> = {};

  if (activeSpaceId) {
    const { data: shiftRows, error } = await supabase
      .from("shifts")
      .select(
        "id,space_id,user_id,start_at,end_at,title,note,color,text_color,template_id,source,status,created_at,updated_at"
      )
      .eq("space_id", activeSpaceId)
      .eq("status", "scheduled")
      .order("start_at", { ascending: true })
      .limit(2000);

    if (error) {
      return (
        <AppShell
          locale={locale}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          email={user.email}
          nav="schedule"
        >
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.message}
          </p>
        </AppShell>
      );
    }
    shifts = (shiftRows as ShiftRow[]) ?? [];

    const { data: memberRows } = await supabase
      .from("space_members")
      .select("user_id,role,nickname")
      .eq("space_id", activeSpaceId);
    members = (memberRows as typeof members) ?? [];

    const userIds = new Set<string>(members.map((m) => m.user_id));
    for (const s of shifts) userIds.add(s.user_id);
    if (userIds.size > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", Array.from(userIds));
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
      nav="schedule"
    >
      {!activeSpaceId ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80">
          <p className="text-sm text-slate-600">{t(locale, "noSpaces")}</p>
          <Link
            href="/app/spaces"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            {t(locale, "spaces")}
          </Link>
        </div>
      ) : (
        <ScheduleClient
          locale={locale}
          spaceId={activeSpaceId}
          currentUserId={user.id}
          shifts={shifts}
          members={members}
          profiles={profiles}
        />
      )}
    </AppShell>
  );
}
