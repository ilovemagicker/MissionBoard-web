import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MissionDetailClient } from "@/components/mission-detail-client";
import { markMissionReadAction } from "@/app/actions/missions";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type {
  MissionCommentRow,
  MissionReaderRow,
  MissionRow,
  MissionStepRow,
  MissionWorkerRow,
  ProfileRow,
  StepClaimRequestRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  const { data: mission, error } = await supabase
    .from("missions")
    .select(
      "id,space_id,title,description,start_date,due_date,status,flag_icon,creator_id,created_at,updated_at,archived_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !mission) notFound();

  // Mark read (best-effort)
  await markMissionReadAction(id);

  const [
    { data: steps },
    { data: comments },
    { data: readerRows },
    { data: workerRows },
    { data: members },
    { data: claimRows },
  ] = await Promise.all([
    supabase
      .from("mission_steps")
      .select(
        "id,mission_id,title,order_index,is_done,assignee_id,deadline_date,created_at,completed_at"
      )
      .eq("mission_id", id)
      .order("order_index"),
    supabase
      .from("mission_comments")
      .select("id,mission_id,step_id,author_id,body,created_at")
      .eq("mission_id", id)
      .order("created_at"),
    supabase
      .from("mission_readers")
      .select("mission_id,user_id,read_at")
      .eq("mission_id", id)
      .order("read_at", { ascending: false }),
    supabase
      .from("mission_workers")
      .select("mission_id,user_id,started_at")
      .eq("mission_id", id)
      .order("started_at", { ascending: false }),
    supabase
      .from("space_members")
      .select("user_id, role")
      .eq("space_id", mission.space_id),
    supabase
      .from("step_claim_requests")
      .select("id,mission_id,step_id,requester_id,status,created_at,resolved_at")
      .eq("mission_id", id)
      .eq("status", "pending"),
  ]);

  const readers = (readerRows as MissionReaderRow[]) ?? [];
  const workers = (workerRows as MissionWorkerRow[]) ?? [];

  const profileIds = new Set<string>();
  for (const m of members ?? []) profileIds.add(m.user_id as string);
  for (const s of steps ?? []) if (s.assignee_id) profileIds.add(s.assignee_id as string);
  for (const c of comments ?? []) profileIds.add(c.author_id as string);
  for (const r of readers) profileIds.add(r.user_id);
  for (const w of workers) profileIds.add(w.user_id);
  for (const c of claimRows ?? []) profileIds.add(c.requester_id as string);

  const profiles: Record<string, ProfileRow> = {};
  if (profileIds.size > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", Array.from(profileIds));
    for (const p of profileRows ?? []) {
      profiles[p.id as string] = p as ProfileRow;
    }
  }

  const isWorking = workers.some((w) => w.user_id === user.id);

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
      </div>
      <MissionDetailClient
        locale={locale}
        mission={mission as MissionRow}
        steps={(steps as MissionStepRow[]) ?? []}
        comments={(comments as MissionCommentRow[]) ?? []}
        members={(members as { user_id: string; role: string }[]) ?? []}
        profiles={profiles}
        readers={readers}
        workers={workers}
        isWorking={isWorking}
        userId={user.id}
        claimRequests={(claimRows as StepClaimRequestRow[]) ?? []}
      />
    </AppShell>
  );
}
