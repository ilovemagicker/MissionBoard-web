"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError, isSchemaMissingError } from "@/lib/errors";
import {
  parseStartReminderMinutes,
  parseStartTimeMinutes,
} from "@/lib/start-reminder";
import type {
  MissionPriority,
  MissionStatus,
  RecurrenceFrequency,
} from "@/lib/types";

async function requireAuthedClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function createMissionAction(formData: FormData) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const spaceId = String(formData.get("space_id") || "");
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const startDate = String(formData.get("start_date") || "") || null;
    const dueDate = String(formData.get("due_date") || "") || null;
    const priorityRaw = String(formData.get("priority") || "medium");
    const priority =
      priorityRaw === "high" || priorityRaw === "medium" || priorityRaw === "low"
        ? priorityRaw
        : priorityRaw === "none"
          ? null
          : "medium";
    const decisionMakerRaw = String(formData.get("decision_maker_id") || "").trim();
    const decisionMakerId = decisionMakerRaw || null;

    const startTimeMinutes = startDate
      ? parseStartTimeMinutes(String(formData.get("start_time") || ""))
      : null;
    const startReminderMinutes = startDate
      ? parseStartReminderMinutes(String(formData.get("start_reminder_minutes") || ""))
      : null;
    const startTimezoneRaw = String(formData.get("start_timezone") || "").trim();
    const startTimezone =
      startDate && startTimeMinutes != null
        ? startTimezoneRaw || null
        : null;

    if (!spaceId || !title) throw new Error("Title and space are required");

    const baseRow: Record<string, unknown> = {
      space_id: spaceId,
      title,
      description,
      start_date: startDate,
      due_date: dueDate,
      status: "todo",
      creator_id: user.id,
      priority,
      decision_maker_id: decisionMakerId,
    };
    const withStart: Record<string, unknown> = {
      ...baseRow,
      start_time_minutes: startTimeMinutes,
      start_timezone: startTimezone,
      start_reminder_minutes: startReminderMinutes,
    };

    let { data, error } = await supabase
      .from("missions")
      .insert(withStart)
      .select("id")
      .single();

    if (error && isSchemaMissingError(error)) {
      const retry = await supabase
        .from("missions")
        .insert(baseRow)
        .select("id")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    if (!data?.id) throw new Error("Failed to create mission");

    const recurrenceEnabled = String(formData.get("recurrence_enabled") || "") === "1";
    if (recurrenceEnabled) {
      await attachRecurrenceFromForm(supabase, user.id, spaceId, data.id, formData, startDate);
    }

    revalidatePath("/app/missions");
    redirect(`/app/missions/${data.id}`);
  } catch (err) {
    // Next.js redirect() throws; rethrow those
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: formatError(err) };
  }
}

export async function updateMissionStatusAction(missionId: string, status: MissionStatus) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase
      .from("missions")
      .update({ status })
      .eq("id", missionId);
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function toggleWorkingAction(missionId: string, working: boolean) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (working) {
      const { error } = await supabase.from("mission_workers").upsert(
        { mission_id: missionId, user_id: user.id },
        { onConflict: "mission_id,user_id" }
      );
      if (error) {
        // Fallback insert if upsert update blocked by RLS
        const { error: err2 } = await supabase.from("mission_workers").insert({
          mission_id: missionId,
          user_id: user.id,
        });
        if (err2 && !/duplicate|unique/i.test(err2.message)) throw err2;
      }
    } else {
      const { error } = await supabase
        .from("mission_workers")
        .delete()
        .eq("mission_id", missionId)
        .eq("user_id", user.id);
      if (error) throw error;
    }
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function markMissionReadAction(missionId: string) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const { data: existing } = await supabase
      .from("mission_readers")
      .select("mission_id")
      .eq("mission_id", missionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) return { ok: true as const };

    const { error } = await supabase.from("mission_readers").insert({
      mission_id: missionId,
      user_id: user.id,
    });
    if (error && !/duplicate|unique/i.test(error.message)) {
      // ignore — best-effort
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export async function updateStepDeadlineAction(
  stepId: string,
  missionId: string,
  deadlineDate: string | null
) {
  try {
    const { supabase } = await requireAuthedClient();
    const value =
      deadlineDate && /^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)
        ? deadlineDate
        : null;
    const { error } = await supabase
      .from("mission_steps")
      .update({ deadline_date: value })
      .eq("id", stepId);
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function toggleStepDoneAction(stepId: string, missionId: string, isDone: boolean) {
  try {
    const { supabase } = await requireAuthedClient();
    const payload: Record<string, unknown> = {
      is_done: isDone,
      completed_at: isDone ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("mission_steps").update(payload).eq("id", stepId);
    if (error) {
      const { error: err2 } = await supabase
        .from("mission_steps")
        .update({ is_done: isDone })
        .eq("id", stepId);
      if (err2) throw err2;
    }
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function addStepAction(formData: FormData) {
  try {
    const { supabase } = await requireAuthedClient();
    const missionId = String(formData.get("mission_id") || "");
    const title = String(formData.get("title") || "").trim();
    const parentStepIdRaw = String(formData.get("parent_step_id") || "").trim();
    const parentStepId = parentStepIdRaw || null;
    if (!missionId || !title) throw new Error("Step title required");

    let siblingQuery = supabase
      .from("mission_steps")
      .select("order_index")
      .eq("mission_id", missionId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (parentStepId) {
      siblingQuery = siblingQuery.eq("parent_step_id", parentStepId);
    } else {
      siblingQuery = siblingQuery.is("parent_step_id", null);
    }
    const { data: existing } = await siblingQuery;

    const nextIndex =
      existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

    const payload: Record<string, unknown> = {
      mission_id: missionId,
      title,
      order_index: nextIndex,
      is_done: false,
    };
    if (parentStepId) payload.parent_step_id = parentStepId;

    const { error } = await supabase.from("mission_steps").insert(payload);
    if (error) {
      // Fallback without parent_step_id if 033 not applied
      if (parentStepId && /parent_step_id|column/i.test(error.message)) {
        const { error: err2 } = await supabase.from("mission_steps").insert({
          mission_id: missionId,
          title,
          order_index: nextIndex,
          is_done: false,
        });
        if (err2) throw err2;
      } else {
        throw error;
      }
    }
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function claimStepAction(
  stepId: string,
  missionId: string,
  claim: boolean
) {
  try {
    const { supabase } = await requireAuthedClient();
    if (claim) {
      const { error } = await supabase.rpc("request_step_claim", {
        p_step_id: stepId,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.rpc("unclaim_step", {
        p_step_id: stepId,
      });
      if (error) throw error;
    }
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function assignStepAction(
  stepId: string,
  missionId: string,
  assigneeId: string | null
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("assign_step", {
      p_step_id: stepId,
      p_assignee_id: assigneeId || null,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function acceptStepClaimAction(
  requestId: string,
  missionId: string
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("accept_step_claim", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function declineStepClaimAction(
  requestId: string,
  missionId: string
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("decline_step_claim", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function cancelStepClaimAction(
  requestId: string,
  missionId: string
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("cancel_step_claim_request", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function addCommentAction(formData: FormData) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const missionId = String(formData.get("mission_id") || "");
    const stepIdRaw = String(formData.get("step_id") || "");
    const stepId = stepIdRaw || null;
    const body = String(formData.get("body") || "").trim();
    if (!missionId || !body) throw new Error("Comment body required");

    const { error } = await supabase.from("mission_comments").insert({
      mission_id: missionId,
      step_id: stepId,
      author_id: user.id,
      body,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function archiveMissionAction(missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("archive_mission", {
      p_mission_id: missionId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    revalidatePath("/app/calendar");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function unarchiveMissionAction(missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("unarchive_mission", {
      p_mission_id: missionId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    revalidatePath("/app/calendar");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function deleteMissionAction(missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.from("missions").delete().eq("id", missionId);
    if (error) throw error;
    revalidatePath("/app/missions");
    revalidatePath("/app/calendar");
    redirect("/app/missions");
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: formatError(err) };
  }
}

export async function updateMissionPriorityAction(
  missionId: string,
  priority: MissionPriority | null
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase
      .from("missions")
      .update({ priority })
      .eq("id", missionId);
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function updateMissionDecisionMakerAction(
  missionId: string,
  decisionMakerId: string | null
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase
      .from("missions")
      .update({ decision_maker_id: decisionMakerId })
      .eq("id", missionId);
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function updateMissionStartScheduleAction(
  missionId: string,
  input: {
    startDate: string | null;
    startTimeMinutes: number | null;
    startTimezone: string | null;
    startReminderMinutes: number | null;
  }
) {
  try {
    const { supabase } = await requireAuthedClient();
    const startDate = input.startDate || null;
    const startTimeMinutes =
      startDate && input.startTimeMinutes != null ? input.startTimeMinutes : null;
    const startTimezone =
      startDate && startTimeMinutes != null
        ? input.startTimezone?.trim() || null
        : null;
    const startReminderMinutes =
      startDate && startTimeMinutes != null
        ? input.startReminderMinutes
        : null;

    const payload: Record<string, unknown> = {
      start_date: startDate,
      start_time_minutes: startTimeMinutes,
      start_timezone: startTimezone,
      start_reminder_minutes: startReminderMinutes,
    };
    const { error } = await supabase
      .from("missions")
      .update(payload)
      .eq("id", missionId);
    if (error) {
      if (isSchemaMissingError(error)) {
        const { error: err2 } = await supabase
          .from("missions")
          .update({ start_date: startDate })
          .eq("id", missionId);
        if (err2) throw err2;
      } else {
        throw error;
      }
    }
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    revalidatePath("/app/calendar");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function requestMissionDecisionAction(missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("request_mission_decision", {
      p_mission_id: missionId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function approveMissionDecisionAction(missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("approve_mission_decision", {
      p_mission_id: missionId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function returnMissionDecisionAction(missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("return_mission_decision", {
      p_mission_id: missionId,
    });
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}


// ---------------------------------------------------------------------------
// 031 recurrence + 033 nested steps
// ---------------------------------------------------------------------------

function parseRecurrenceFields(formData: FormData) {
  const frequencyRaw = String(formData.get("recurrence_frequency") || "daily");
  const frequency: RecurrenceFrequency =
    frequencyRaw === "weekly" ||
    frequencyRaw === "monthly" ||
    frequencyRaw === "interval" ||
    frequencyRaw === "daily"
      ? frequencyRaw
      : "daily";
  const weekdays = String(formData.get("recurrence_weekdays") || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 7);
  const monthDay = Math.min(
    31,
    Math.max(1, parseInt(String(formData.get("recurrence_month_day") || "1"), 10) || 1)
  );
  const intervalDays = Math.min(
    365,
    Math.max(1, parseInt(String(formData.get("recurrence_interval_days") || "2"), 10) || 2)
  );
  const timeParts = String(formData.get("recurrence_time") || "09:00").split(":");
  const hh = Math.min(23, Math.max(0, parseInt(timeParts[0] || "9", 10) || 9));
  const mm = Math.min(59, Math.max(0, parseInt(timeParts[1] || "0", 10) || 0));
  const timeMinutes = hh * 60 + mm;
  const endMode = String(formData.get("recurrence_end_mode") || "never");
  const endOn =
    endMode === "onDate" ? String(formData.get("recurrence_end_on") || "") || null : null;
  const maxCount =
    endMode === "afterCount"
      ? Math.min(
          1000,
          Math.max(1, parseInt(String(formData.get("recurrence_max_count") || "10"), 10) || 10)
        )
      : null;
  const timezone =
    String(formData.get("recurrence_timezone") || "").trim() || "Asia/Hong_Kong";
  return {
    frequency,
    weekdays: frequency === "weekly" ? weekdays : [],
    month_day: frequency === "monthly" ? monthDay : null,
    interval_days: frequency === "interval" ? intervalDays : null,
    time_minutes: timeMinutes,
    timezone,
    end_on: endOn,
    max_count: maxCount,
  };
}

async function attachRecurrenceFromForm(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  userId: string,
  spaceId: string,
  missionId: string,
  formData: FormData,
  startDate: string | null
) {
  const fields = parseRecurrenceFields(formData);
  if (fields.frequency === "weekly" && fields.weekdays.length === 0) {
    const dow = new Date().getDay(); // 0=Sun
    fields.weekdays = [dow === 0 ? 7 : dow];
  }
  const startOn = startDate || new Date().toISOString().slice(0, 10);
  const { data: rec, error } = await supabase
    .from("mission_recurrences")
    .insert({
      space_id: spaceId,
      template_mission_id: missionId,
      created_by: userId,
      frequency: fields.frequency,
      interval_days: fields.interval_days,
      weekdays: fields.weekdays,
      month_day: fields.month_day,
      time_minutes: fields.time_minutes,
      timezone: fields.timezone,
      start_on: startOn,
      end_on: fields.end_on,
      max_count: fields.max_count,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: linkErr } = await supabase
    .from("missions")
    .update({ recurrence_id: rec.id })
    .eq("id", missionId);
  if (linkErr) throw linkErr;
}

export async function saveMissionRecurrenceAction(
  missionId: string,
  formData: FormData
) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("id,space_id,start_date,recurrence_id")
      .eq("id", missionId)
      .single();
    if (mErr || !mission) throw mErr || new Error("Mission not found");

    const fields = parseRecurrenceFields(formData);
    if (fields.frequency === "weekly" && fields.weekdays.length === 0) {
      throw new Error("Weekly recurrence needs at least one weekday");
    }
    const startOn =
      String(formData.get("recurrence_start_on") || "").trim() ||
      (mission.start_date as string | null) ||
      new Date().toISOString().slice(0, 10);

    const existingId = mission.recurrence_id as string | null;
    if (existingId) {
      const { error } = await supabase
        .from("mission_recurrences")
        .update({
          frequency: fields.frequency,
          interval_days: fields.interval_days,
          weekdays: fields.weekdays,
          month_day: fields.month_day,
          time_minutes: fields.time_minutes,
          timezone: fields.timezone,
          start_on: startOn,
          end_on: fields.end_on,
          max_count: fields.max_count,
          active: true,
        })
        .eq("id", existingId);
      if (error) throw error;
    } else {
      // May already have a row keyed by template
      const { data: byTemplate } = await supabase
        .from("mission_recurrences")
        .select("id")
        .eq("template_mission_id", missionId)
        .maybeSingle();
      if (byTemplate?.id) {
        const { error } = await supabase
          .from("mission_recurrences")
          .update({
            frequency: fields.frequency,
            interval_days: fields.interval_days,
            weekdays: fields.weekdays,
            month_day: fields.month_day,
            time_minutes: fields.time_minutes,
            timezone: fields.timezone,
            start_on: startOn,
            end_on: fields.end_on,
            max_count: fields.max_count,
            active: true,
          })
          .eq("id", byTemplate.id);
        if (error) throw error;
        await supabase
          .from("missions")
          .update({ recurrence_id: byTemplate.id })
          .eq("id", missionId);
      } else {
        const { data: rec, error } = await supabase
          .from("mission_recurrences")
          .insert({
            space_id: mission.space_id,
            template_mission_id: missionId,
            created_by: user.id,
            frequency: fields.frequency,
            interval_days: fields.interval_days,
            weekdays: fields.weekdays,
            month_day: fields.month_day,
            time_minutes: fields.time_minutes,
            timezone: fields.timezone,
            start_on: startOn,
            end_on: fields.end_on,
            max_count: fields.max_count,
            active: true,
          })
          .select("id")
          .single();
        if (error) throw error;
        const { error: linkErr } = await supabase
          .from("missions")
          .update({ recurrence_id: rec.id })
          .eq("id", missionId);
        if (linkErr) throw linkErr;
      }
    }
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function setMissionRecurrenceActiveAction(
  recurrenceId: string,
  missionId: string,
  active: boolean
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase
      .from("mission_recurrences")
      .update({ active })
      .eq("id", recurrenceId);
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function deleteMissionRecurrenceAction(
  recurrenceId: string,
  missionId: string
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase
      .from("mission_recurrences")
      .delete()
      .eq("id", recurrenceId);
    if (error) throw error;
    revalidatePath(`/app/missions/${missionId}`);
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function indentStepAction(stepId: string, missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data: steps, error } = await supabase
      .from("mission_steps")
      .select(
        "id,mission_id,title,order_index,is_done,assignee_id,deadline_date,created_at,completed_at,parent_step_id"
      )
      .eq("mission_id", missionId);
    if (error) throw error;
    const list = steps ?? [];
    const { previousSiblingId, canIndentStep } = await import("@/lib/step-tree");
    if (!canIndentStep(list, stepId)) {
      throw new Error("Cannot indent this step");
    }
    const parentId = previousSiblingId(list, stepId);
    if (!parentId) throw new Error("Cannot indent this step");

    const siblings = list
      .filter((s) => (s.parent_step_id ?? null) === parentId)
      .sort((a, b) => a.order_index - b.order_index);
    const nextIndex =
      siblings.length > 0 ? siblings[siblings.length - 1].order_index + 1 : 0;

    const { error: updErr } = await supabase
      .from("mission_steps")
      .update({ parent_step_id: parentId, order_index: nextIndex })
      .eq("id", stepId);
    if (updErr) throw updErr;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function outdentStepAction(stepId: string, missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data: steps, error } = await supabase
      .from("mission_steps")
      .select(
        "id,mission_id,title,order_index,is_done,assignee_id,deadline_date,created_at,completed_at,parent_step_id"
      )
      .eq("mission_id", missionId);
    if (error) throw error;
    const list = steps ?? [];
    const { outdentTarget, canOutdentStep, childrenIndex } = await import(
      "@/lib/step-tree"
    );
    if (!canOutdentStep(list, stepId)) {
      throw new Error("Cannot outdent this step");
    }
    const target = outdentTarget(list, stepId);
    if (!target) throw new Error("Cannot outdent this step");

    const index = childrenIndex(list);
    const siblings = index.get(target.parentId) ?? [];
    const afterIdx = siblings.findIndex((s) => s.id === target.afterSiblingId);
    const insertAt = afterIdx >= 0 ? afterIdx + 1 : siblings.length;

    // Renumber: place step after parent among grandparent's children
    const newSiblings = siblings.filter((s) => s.id !== stepId);
    newSiblings.splice(insertAt, 0, list.find((s) => s.id === stepId)!);

    const { error: updErr } = await supabase
      .from("mission_steps")
      .update({
        parent_step_id: target.parentId,
        order_index: insertAt,
      })
      .eq("id", stepId);
    if (updErr) throw updErr;

    // Best-effort renumber remaining siblings
    await Promise.all(
      newSiblings.map((s, i) =>
        supabase
          .from("mission_steps")
          .update({ order_index: i })
          .eq("id", s.id)
      )
    );

    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function setStepParentAction(
  stepId: string,
  missionId: string,
  parentStepId: string | null
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data: siblings } = await supabase
      .from("mission_steps")
      .select("order_index")
      .eq("mission_id", missionId)
      .order("order_index", { ascending: false })
      .limit(1);
    // Get max among new siblings
    let q = supabase
      .from("mission_steps")
      .select("order_index")
      .eq("mission_id", missionId)
      .order("order_index", { ascending: false })
      .limit(1);
    q = parentStepId
      ? q.eq("parent_step_id", parentStepId)
      : q.is("parent_step_id", null);
    const { data: existing } = await q;
    const nextIndex =
      existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

    const { error } = await supabase
      .from("mission_steps")
      .update({ parent_step_id: parentStepId, order_index: nextIndex })
      .eq("id", stepId);
    if (error) throw error;
    void siblings;
    revalidatePath(`/app/missions/${missionId}`);
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}
