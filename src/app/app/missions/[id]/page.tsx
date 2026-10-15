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
import { isSchemaMissingError } from "@/lib/errors";
import type {
  MissionAnnouncementReadRow,
  MissionAnnouncementRow,
  MissionCommentRow,
  MissionPollOptionRow,
  MissionPollResultRow,
  MissionPollRow,
  MissionPollVoteRow,
  MissionReaderRow,
  MissionRecurrenceRow,
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

  const missionSelectBase =
    "id,space_id,title,description,start_date,due_date,status,flag_icon,creator_id,created_at,updated_at,archived_at,priority,decision_maker_id,decision_requested_at,decision_requested_by,decision_approved_at,decision_approved_by,recurrence_id";
  const missionSelectFull =
    missionSelectBase +
    ",start_time_minutes,start_timezone,start_reminder_minutes";

  let startReminderEnabled = true;
  let mission: MissionRow | null = null;
  {
    const full = await supabase
      .from("missions")
      .select(missionSelectFull)
      .eq("id", id)
      .maybeSingle();
    if (full.error && isSchemaMissingError(full.error)) {
      startReminderEnabled = false;
      const retry = await supabase
        .from("missions")
        .select(missionSelectBase)
        .eq("id", id)
        .maybeSingle();
      if (retry.error || !retry.data) notFound();
      mission = retry.data as unknown as MissionRow;
    } else if (full.error || !full.data) {
      notFound();
    } else {
      mission = full.data as unknown as MissionRow;
    }
  }

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
        "id,mission_id,title,order_index,is_done,assignee_id,deadline_date,created_at,completed_at,parent_step_id"
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

  let recurrence: MissionRecurrenceRow | null = null;
  const recurrenceId = mission.recurrence_id;
  if (recurrenceId) {
    const { data: rec } = await supabase
      .from("mission_recurrences")
      .select(
        "id,space_id,template_mission_id,created_by,frequency,interval_days,weekdays,month_day,time_minutes,timezone,start_on,end_on,max_count,generated_count,next_run_at,last_run_at,active,created_at,updated_at"
      )
      .eq("id", recurrenceId)
      .maybeSingle();
    recurrence = (rec as MissionRecurrenceRow) ?? null;
  } else {
    const { data: rec } = await supabase
      .from("mission_recurrences")
      .select(
        "id,space_id,template_mission_id,created_by,frequency,interval_days,weekdays,month_day,time_minutes,timezone,start_on,end_on,max_count,generated_count,next_run_at,last_run_at,active,created_at,updated_at"
      )
      .eq("template_mission_id", id)
      .maybeSingle();
    recurrence = (rec as MissionRecurrenceRow) ?? null;
  }

  let pollsEnabled = true;
  let polls: MissionPollRow[] = [];
  let pollOptions: MissionPollOptionRow[] = [];
  let pollVotes: MissionPollVoteRow[] = [];
  let pollResults: MissionPollResultRow[] = [];
  let announcements: MissionAnnouncementRow[] = [];
  let announcementReads: MissionAnnouncementReadRow[] = [];

  {
    const { data: pollRows, error: pollErr } = await supabase
      .from("mission_polls")
      .select(
        "id,mission_id,space_id,created_by,question,allow_multiple,anonymous,deadline_at,closed_at,closed_by,final_option_ids,created_at"
      )
      .eq("mission_id", id)
      .order("created_at", { ascending: false });
    if (pollErr) {
      if (isSchemaMissingError(pollErr)) pollsEnabled = false;
    } else {
      polls = (pollRows as MissionPollRow[]) ?? [];
      const pollIds = polls.map((p) => p.id);
      if (pollIds.length > 0) {
        const [{ data: optRows }, { data: voteRows }, { data: resultRows }] =
          await Promise.all([
            supabase
              .from("mission_poll_options")
              .select("id,poll_id,position,label")
              .in("poll_id", pollIds)
              .order("position"),
            supabase
              .from("mission_poll_votes")
              .select("poll_id,option_id,user_id,created_at")
              .in("poll_id", pollIds),
            supabase.rpc("poll_results", { p_poll_ids: pollIds }),
          ]);
        pollOptions = (optRows as MissionPollOptionRow[]) ?? [];
        pollVotes = (voteRows as MissionPollVoteRow[]) ?? [];
        pollResults = (resultRows as MissionPollResultRow[]) ?? [];
      }
    }

    const { data: annRows, error: annErr } = await supabase
      .from("mission_announcements")
      .select(
        "id,mission_id,space_id,author_id,body,pinned,created_at,updated_at,title"
      )
      .eq("mission_id", id)
      .order("created_at", { ascending: false });
    if (annErr) {
      if (isSchemaMissingError(annErr)) pollsEnabled = false;
    } else {
      announcements = (annRows as MissionAnnouncementRow[]) ?? [];
      const annIds = announcements.map((a) => a.id);
      if (annIds.length > 0) {
        const { data: readRows } = await supabase
          .from("mission_announcement_reads")
          .select("announcement_id,user_id,read_at")
          .in("announcement_id", annIds);
        announcementReads = (readRows as MissionAnnouncementReadRow[]) ?? [];
      }
    }
  }

  const profileIds = new Set<string>();
  for (const m of members ?? []) profileIds.add(m.user_id as string);
  for (const s of steps ?? []) if (s.assignee_id) profileIds.add(s.assignee_id as string);
  for (const c of comments ?? []) profileIds.add(c.author_id as string);
  for (const r of readers) profileIds.add(r.user_id);
  for (const w of workers) profileIds.add(w.user_id);
  for (const c of claimRows ?? []) profileIds.add(c.requester_id as string);
  if (mission.decision_maker_id) profileIds.add(mission.decision_maker_id as string);
  if (mission.decision_requested_by) profileIds.add(mission.decision_requested_by as string);
  if (mission.decision_approved_by) profileIds.add(mission.decision_approved_by as string);
  for (const p of polls) profileIds.add(p.created_by);
  for (const v of pollVotes) profileIds.add(v.user_id);
  for (const a of announcements) profileIds.add(a.author_id);
  for (const r of announcementReads) profileIds.add(r.user_id);

  const announcementReadCounts: Record<string, number> = {};
  for (const r of announcementReads) {
    announcementReadCounts[r.announcement_id] =
      (announcementReadCounts[r.announcement_id] ?? 0) + 1;
  }

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
        <Link href="/app/missions" className="text-sm font-medium text-brand">
          ← {t(locale, "back")}
        </Link>
      </div>
      <MissionDetailClient
        locale={locale}
        mission={mission}
        steps={(steps as MissionStepRow[]) ?? []}
        comments={(comments as MissionCommentRow[]) ?? []}
        members={(members as { user_id: string; role: string }[]) ?? []}
        profiles={profiles}
        readers={readers}
        workers={workers}
        isWorking={isWorking}
        userId={user.id}
        claimRequests={(claimRows as StepClaimRequestRow[]) ?? []}
        recurrence={recurrence}
        pollsEnabled={pollsEnabled}
        polls={polls}
        pollOptions={pollOptions}
        pollVotes={pollVotes}
        pollResults={pollResults}
        announcements={announcements}
        announcementReadCounts={announcementReadCounts}
        startReminderEnabled={startReminderEnabled}
      />
    </AppShell>
  );
}
