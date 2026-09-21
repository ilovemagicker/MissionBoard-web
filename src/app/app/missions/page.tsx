import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MissionsListClient } from "@/components/missions-list-client";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { MissionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let missions: MissionRow[] = [];
  const stepCounts: Record<string, { done: number; total: number }> = {};

  if (activeSpaceId) {
    const { data, error } = await supabase
      .from("missions")
      .select(
        "id,space_id,title,description,start_date,due_date,status,flag_icon,creator_id,created_at,updated_at,archived_at"
      )
      .eq("space_id", activeSpaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      return (
        <AppShell
          locale={locale}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          email={user.email}
          nav="missions"
        >
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.message}
          </p>
        </AppShell>
      );
    }

    missions = (data as MissionRow[]) ?? [];

    if (missions.length > 0) {
      const ids = missions.map((m) => m.id);
      const { data: steps } = await supabase
        .from("mission_steps")
        .select("mission_id,is_done")
        .in("mission_id", ids);
      for (const s of steps ?? []) {
        const mid = s.mission_id as string;
        if (!stepCounts[mid]) stepCounts[mid] = { done: 0, total: 0 };
        stepCounts[mid].total += 1;
        if (s.is_done) stepCounts[mid].done += 1;
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
        <MissionsListClient
          missions={missions}
          locale={locale}
          stepCounts={stepCounts}
        />
      )}
    </AppShell>
  );
}
