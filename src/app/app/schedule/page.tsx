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
import type {
  LeaveEntryRow,
  ProfileRow,
  ShiftRow,
  ShiftSwapApprovalMode,
  ShiftSwapRequestRow,
  ShiftTemplateRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const TEMPLATE_COLS =
  "id,space_id,created_by,name,default_start_minutes,default_end_minutes,color,text_color,created_at,updated_at,owner_user_id";
const TEMPLATE_COLS_LEGACY =
  "id,space_id,created_by,name,default_start_minutes,default_end_minutes,color,text_color,created_at,updated_at";

export default async function SchedulePage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let shifts: ShiftRow[] = [];
  let templates: ShiftTemplateRow[] = [];
  let leaveEntries: LeaveEntryRow[] = [];
  let swapRequests: ShiftSwapRequestRow[] = [];
  let swapApprovalMode: ShiftSwapApprovalMode = "admin_required";
  let members: { user_id: string; role: string; nickname: string | null }[] =
    [];
  const profiles: Record<string, ProfileRow> = {};

  if (activeSpaceId) {
    const SHIFT_COLS =
      "id,space_id,user_id,start_at,end_at,title,note,color,text_color,template_id,source,status,created_at,updated_at,generation_batch_id";
    const SHIFT_COLS_LEGACY =
      "id,space_id,user_id,start_at,end_at,title,note,color,text_color,template_id,source,status,created_at,updated_at";

    const firstShifts = await supabase
      .from("shifts")
      .select(SHIFT_COLS)
      .eq("space_id", activeSpaceId)
      .eq("status", "scheduled")
      .order("start_at", { ascending: true })
      .limit(2000);

    let shiftError = firstShifts.error;
    let shiftRows = firstShifts.data as ShiftRow[] | null;

    if (shiftError && /generation_batch_id/i.test(shiftError.message)) {
      const legacy = await supabase
        .from("shifts")
        .select(SHIFT_COLS_LEGACY)
        .eq("space_id", activeSpaceId)
        .eq("status", "scheduled")
        .order("start_at", { ascending: true })
        .limit(2000);
      shiftError = legacy.error;
      shiftRows = (legacy.data as ShiftRow[] | null) ?? null;
    }

    if (shiftError) {
      return (
        <AppShell
          locale={locale}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          email={user.email}
          nav="schedule"
        >
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {shiftError.message}
          </p>
        </AppShell>
      );
    }
    shifts = shiftRows ?? [];

    const firstTemplates = await supabase
      .from("shift_templates")
      .select(TEMPLATE_COLS)
      .eq("space_id", activeSpaceId)
      .order("name", { ascending: true });

    let templateError = firstTemplates.error;
    let templateRows = firstTemplates.data as ShiftTemplateRow[] | null;

    if (templateError && /owner_user_id/i.test(templateError.message)) {
      const legacy = await supabase
        .from("shift_templates")
        .select(TEMPLATE_COLS_LEGACY)
        .eq("space_id", activeSpaceId)
        .order("name", { ascending: true });
      templateError = legacy.error;
      templateRows = (legacy.data as ShiftTemplateRow[] | null) ?? null;
    }

    if (templateError) {
      // Table missing or RLS — show page without templates rather than hard-fail.
      templates = [];
    } else {
      templates = templateRows ?? [];
    }

    const { data: memberRows } = await supabase
      .from("space_members")
      .select("user_id,role,nickname")
      .eq("space_id", activeSpaceId);
    members = (memberRows as typeof members) ?? [];

    const userIds = new Set<string>(members.map((m) => m.user_id));
    for (const s of shifts) userIds.add(s.user_id);

    const { data: leaveRows, error: leaveErr } = await supabase
      .from("leave_entries")
      .select(
        "id,space_id,user_id,start_date,end_date,day_fraction,note,created_at,updated_at"
      )
      .eq("space_id", activeSpaceId)
      .order("start_date", { ascending: false })
      .limit(500);
    if (!leaveErr) {
      leaveEntries = (leaveRows as LeaveEntryRow[]) ?? [];
      for (const e of leaveEntries) userIds.add(e.user_id);
    }

    const { data: swapRows, error: swapErr } = await supabase
      .from("shift_swap_requests")
      .select(
        "id,space_id,shift_id,requester_id,target_user_id,kind,counter_shift_id,note,status,created_at,resolved_at,target_accepted_at"
      )
      .eq("space_id", activeSpaceId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (swapErr && /target_accepted_at/i.test(swapErr.message)) {
      const legacy = await supabase
        .from("shift_swap_requests")
        .select(
          "id,space_id,shift_id,requester_id,target_user_id,kind,counter_shift_id,note,status,created_at,resolved_at"
        )
        .eq("space_id", activeSpaceId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!legacy.error) {
        swapRequests = (legacy.data as ShiftSwapRequestRow[]) ?? [];
      }
    } else if (!swapErr) {
      swapRequests = (swapRows as ShiftSwapRequestRow[]) ?? [];
    }
    for (const r of swapRequests) {
      userIds.add(r.requester_id);
      userIds.add(r.target_user_id);
    }

    const { data: spaceRow } = await supabase
      .from("spaces")
      .select("shift_swap_approval_mode")
      .eq("id", activeSpaceId)
      .maybeSingle();
    const mode = (spaceRow as { shift_swap_approval_mode?: string } | null)
      ?.shift_swap_approval_mode;
    if (mode === "peer_accept" || mode === "admin_required") {
      swapApprovalMode = mode;
    }

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
          templates={templates}
          leaveEntries={leaveEntries}
          swapRequests={swapRequests}
          swapApprovalMode={swapApprovalMode}
          members={members}
          profiles={profiles}
        />
      )}
    </AppShell>
  );
}
