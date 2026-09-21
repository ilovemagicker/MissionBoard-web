import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ActivityClient } from "@/components/activity-client";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { ActivityEventRow, ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let events: ActivityEventRow[] = [];
  const profiles: Record<string, ProfileRow> = {};
  let loadError: string | null = null;

  if (activeSpaceId) {
    const { data, error } = await supabase
      .from("activity_events")
      .select(
        "id,space_id,actor_id,kind,mission_id,step_id,summary,created_at"
      )
      .eq("space_id", activeSpaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      loadError = error.message;
    } else {
      events = (data as ActivityEventRow[]) ?? [];
      const actorIds = Array.from(
        new Set(
          events
            .map((e) => e.actor_id)
            .filter((id): id is string => !!id)
        )
      );
      if (actorIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url")
          .in("id", actorIds);
        for (const p of profileRows ?? []) {
          profiles[p.id as string] = p as ProfileRow;
        }
      }
    }
  }

  return (
    <AppShell
      locale={locale}
      spaces={spaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="activity"
    >
      {!activeSpaceId ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80">
          <p className="text-sm text-slate-600">{t(locale, "activityNoSpace")}</p>
          <Link
            href="/app/spaces"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            {t(locale, "spaces")}
          </Link>
        </div>
      ) : loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      ) : (
        <ActivityClient
          locale={locale}
          spaceId={activeSpaceId}
          initialEvents={events}
          profiles={profiles}
        />
      )}
    </AppShell>
  );
}
