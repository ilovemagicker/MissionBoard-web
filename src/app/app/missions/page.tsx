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
import { isSchemaMissingError } from "@/lib/errors";
import type {
  AnnouncementDismissalRow,
  MissionAnnouncementReadRow,
  MissionAnnouncementRow,
  MissionRow,
  ProfileRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1" || archived === "true";
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let missions: MissionRow[] = [];
  const stepCounts: Record<string, { done: number; total: number }> = {};

  if (activeSpaceId) {
    let query = supabase
      .from("missions")
      .select(
        "id,space_id,title,description,start_date,due_date,status,flag_icon,creator_id,created_at,updated_at,archived_at,priority,decision_maker_id,decision_requested_at,decision_requested_by,decision_approved_at,decision_approved_by,recurrence_id"
      )
      .eq("space_id", activeSpaceId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (!showArchived) {
      query = query.is("archived_at", null);
    }

    const { data, error } = await query;

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
        .select("id,mission_id,is_done,parent_step_id")
        .in("mission_id", ids);
      const parentIds = new Set(
        (steps ?? [])
          .map((s) => s.parent_step_id as string | null)
          .filter((x): x is string => !!x)
      );
      for (const s of steps ?? []) {
        const mid = s.mission_id as string;
        const sid = s.id as string;
        // Count leaf steps only when nested (033)
        if (parentIds.has(sid)) continue;
        if (!stepCounts[mid]) stepCounts[mid] = { done: 0, total: 0 };
        stepCounts[mid].total += 1;
        if (s.is_done) stepCounts[mid].done += 1;
      }
    }
  }

  let spaceAnnouncementsEnabled = true;
  let spaceAnnouncements: MissionAnnouncementRow[] = [];
  let spaceAnnouncementReads: MissionAnnouncementReadRow[] = [];
  let spaceDismissals: AnnouncementDismissalRow[] = [];
  const announcementProfiles: Record<string, ProfileRow> = {};
  const spaceAnnouncementReadCounts: Record<string, number> = {};
  const myRole =
    spaces.find((s) => s.id === activeSpaceId)?.role ?? null;

  if (activeSpaceId) {
    const { data: annRows, error: annErr } = await supabase
      .from("mission_announcements")
      .select(
        "id,mission_id,space_id,author_id,body,pinned,created_at,updated_at,title"
      )
      .eq("space_id", activeSpaceId)
      .is("mission_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (annErr) {
      if (isSchemaMissingError(annErr)) spaceAnnouncementsEnabled = false;
    } else {
      spaceAnnouncements = (annRows as MissionAnnouncementRow[]) ?? [];
      const ids = spaceAnnouncements.map((a) => a.id);
      if (ids.length > 0) {
        const [{ data: readRows }, { data: dismissRows }] = await Promise.all([
          supabase
            .from("mission_announcement_reads")
            .select("announcement_id,user_id,read_at")
            .in("announcement_id", ids),
          supabase
            .from("announcement_dismissals")
            .select("announcement_id,user_id,dismissed_at")
            .eq("user_id", user.id)
            .in("announcement_id", ids),
        ]);
        spaceAnnouncementReads =
          (readRows as MissionAnnouncementReadRow[]) ?? [];
        spaceDismissals = (dismissRows as AnnouncementDismissalRow[]) ?? [];
        for (const r of spaceAnnouncementReads) {
          spaceAnnouncementReadCounts[r.announcement_id] =
            (spaceAnnouncementReadCounts[r.announcement_id] ?? 0) + 1;
        }
        const pids = new Set(spaceAnnouncements.map((a) => a.author_id));
        if (pids.size > 0) {
          const { data: prefs } = await supabase
            .from("profiles")
            .select("id,display_name,avatar_url")
            .in("id", Array.from(pids));
          for (const p of prefs ?? []) {
            announcementProfiles[p.id as string] = p as ProfileRow;
          }
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
      nav="missions"
    >
      {!activeSpaceId ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80">
          <p className="text-sm text-slate-600">{t(locale, "noSpaces")}</p>
          <Link
            href="/app/spaces"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
          >
            {t(locale, "spaces")}
          </Link>
        </div>
      ) : (
        <MissionsListClient
          missions={missions}
          locale={locale}
          stepCounts={stepCounts}
          showArchived={showArchived}
          spaceId={activeSpaceId}
          myRole={myRole}
          spaceAnnouncementsEnabled={spaceAnnouncementsEnabled}
          spaceAnnouncements={spaceAnnouncements}
          spaceDismissedIds={spaceDismissals.map((d) => d.announcement_id)}
          spaceReadByMe={spaceAnnouncementReads
            .filter((r) => r.user_id === user.id)
            .map((r) => r.announcement_id)}
          spaceAnnouncementReadCounts={spaceAnnouncementReadCounts}
          announcementProfiles={announcementProfiles}
        />
      )}
    </AppShell>
  );
}
