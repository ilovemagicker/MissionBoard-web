"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";
import {
  hydratePatternCycle,
  planGeneration,
  templateIdsFromCycle,
  type PatternBlockInput,
} from "@/lib/shift-generation";
import type { ShiftTemplateRow } from "@/lib/types";

async function requireAuthedClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

function revalidateSchedule() {
  revalidatePath("/app/schedule");
}

/** Resolve assignee: self always; other members only if caller is space admin/owner. */
async function resolveShiftUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  spaceId: string,
  callerId: string,
  requestedUserId: string | undefined
): Promise<string> {
  const target = requestedUserId?.trim() || callerId;
  if (target === callerId) return callerId;

  const { data: me, error: meErr } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (meErr) throw meErr;
  const role = me?.role as string | undefined;
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only space admin/owner can create shifts for others");
  }

  const { data: targetRow, error: targetErr } = await supabase
    .from("space_members")
    .select("user_id,role")
    .eq("space_id", spaceId)
    .eq("user_id", target)
    .maybeSingle();
  if (targetErr) throw targetErr;
  if (!targetRow) throw new Error("Target is not a space member");
  if ((targetRow.role as string) === "viewer") {
    throw new Error("Cannot assign shifts to viewer members");
  }
  return target;
}

export async function createShiftAction(input: {
  spaceId: string;
  startAt: string;
  endAt: string;
  title?: string;
  note?: string;
  color: string;
  textColor: string;
  /** Assignee; defaults to current user. Admin/owner may set another member. */
  userId?: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (!input.spaceId || !input.startAt || !input.endAt) {
      throw new Error("Space and time range are required");
    }
    if (new Date(input.endAt) <= new Date(input.startAt)) {
      throw new Error("End must be after start");
    }

    const assigneeId = await resolveShiftUserId(
      supabase,
      input.spaceId,
      user.id,
      input.userId
    );

    const { data, error } = await supabase
      .from("shifts")
      .insert({
        space_id: input.spaceId,
        user_id: assigneeId,
        start_at: input.startAt,
        end_at: input.endAt,
        title: input.title?.trim() || null,
        note: input.note?.trim() || null,
        color: input.color || "#3B82F6",
        text_color: input.textColor || "#FFFFFF",
        source: "manual",
        status: "scheduled",
      })
      .select("id")
      .single();

    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const, id: data.id as string };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function updateShiftAction(input: {
  id: string;
  startAt: string;
  endAt: string;
  title?: string;
  note?: string;
  color: string;
  textColor: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    if (new Date(input.endAt) <= new Date(input.startAt)) {
      throw new Error("End must be after start");
    }
    const { error } = await supabase
      .from("shifts")
      .update({
        start_at: input.startAt,
        end_at: input.endAt,
        title: input.title?.trim() || null,
        note: input.note?.trim() || null,
        color: input.color || "#3B82F6",
        text_color: input.textColor || "#FFFFFF",
      })
      .eq("id", input.id);
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function deleteShiftAction(id: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/** Full-month / range batch generation (mirrors iOS RotationGenerate + generation_batch_id). */
export async function generateShiftsBatchAction(input: {
  spaceId: string;
  /** Inclusive YYYY-MM-DD */
  startKey: string;
  endKey: string;
  /** Template ids for presets / weekdays; also used as fallback. */
  templateIds?: string[];
  userIds: string[];
  /** Preset kind. Use "weekdays" for calendar weekend=rest. Omit when customCycle is set. */
  pattern?: "everyday" | "weekdays" | "4on4off" | "5on2off";
  /** Custom ordered cycle (work templateId or rest). Rehydrated server-side. */
  customCycle?: PatternBlockInput[];
  mode: "samePhase" | "staggered";
  conflict: "skip" | "overwrite";
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (!input.spaceId) throw new Error("Space is required");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startKey) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.endKey)
    ) {
      throw new Error("Invalid date range");
    }
    if (!input.userIds?.length) throw new Error("Pick at least one member");

    const fromCycle = input.customCycle?.length
      ? templateIdsFromCycle(input.customCycle)
      : [];
    const templateIds = [
      ...fromCycle,
      ...(input.templateIds ?? []).filter((id) => !fromCycle.includes(id)),
    ];
    if (!templateIds.length) throw new Error("Pick at least one template");
    if (
      input.pattern !== "weekdays" &&
      input.customCycle &&
      input.customCycle.length > 0 &&
      !fromCycle.length
    ) {
      throw new Error("Custom pattern needs at least one work day");
    }

    const assignees: string[] = [];
    for (const uid of input.userIds) {
      const resolved = await resolveShiftUserId(
        supabase,
        input.spaceId,
        user.id,
        uid
      );
      if (!assignees.includes(resolved)) assignees.push(resolved);
    }

    const { data: templates, error: tmplErr } = await supabase
      .from("shift_templates")
      .select(
        "id,space_id,created_by,name,default_start_minutes,default_end_minutes,color,text_color,created_at,updated_at,owner_user_id"
      )
      .eq("space_id", input.spaceId)
      .in("id", templateIds);
    if (tmplErr && /owner_user_id/i.test(tmplErr.message)) {
      const legacy = await supabase
        .from("shift_templates")
        .select(
          "id,space_id,created_by,name,default_start_minutes,default_end_minutes,color,text_color,created_at,updated_at"
        )
        .eq("space_id", input.spaceId)
        .in("id", templateIds);
      if (legacy.error) throw legacy.error;
      if (!legacy.data?.length) throw new Error("Templates not found");
      return await commitBatchFromTemplates({
        supabase,
        spaceId: input.spaceId,
        templates: legacy.data as ShiftTemplateRow[],
        templateIds,
        assignees,
        startKey: input.startKey,
        endKey: input.endKey,
        pattern: input.pattern,
        customCycle: input.customCycle,
        mode: input.mode,
        conflict: input.conflict,
      });
    }
    if (tmplErr) throw tmplErr;
    if (!templates?.length) throw new Error("Templates not found");

    return await commitBatchFromTemplates({
      supabase,
      spaceId: input.spaceId,
      templates: templates as ShiftTemplateRow[],
      templateIds,
      assignees,
      startKey: input.startKey,
      endKey: input.endKey,
      pattern: input.pattern,
      customCycle: input.customCycle,
      mode: input.mode,
      conflict: input.conflict,
    });
  } catch (err) {
    return { error: formatError(err) };
  }
}

async function commitBatchFromTemplates(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  spaceId: string;
  templates: ShiftTemplateRow[];
  templateIds: string[];
  assignees: string[];
  startKey: string;
  endKey: string;
  pattern?: "everyday" | "weekdays" | "4on4off" | "5on2off";
  customCycle?: PatternBlockInput[];
  mode: "samePhase" | "staggered";
  conflict: "skip" | "overwrite";
}) {
  const ordered = args.templateIds
    .map((id) => args.templates.find((t) => t.id === id))
    .filter(Boolean) as ShiftTemplateRow[];
  if (!ordered.length) throw new Error("Templates not found");

  const byId = new Map(args.templates.map((t) => [t.id, t]));
  let customCycle = undefined as
    | ReturnType<typeof hydratePatternCycle>
    | undefined;
  if (args.pattern !== "weekdays" && args.customCycle?.length) {
    customCycle = hydratePatternCycle(args.customCycle, byId);
    if (!customCycle) throw new Error("Templates not found");
  }

  // Load existing scheduled shifts overlapping the range for conflict checks.
  const rangeStart = new Date(`${args.startKey}T00:00:00`);
  const rangeEndExclusive = new Date(`${args.endKey}T00:00:00`);
  rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 2); // overnight buffer

  const { data: existingRows, error: existErr } = await args.supabase
    .from("shifts")
    .select("id,user_id,start_at,status")
    .eq("space_id", args.spaceId)
    .eq("status", "scheduled")
    .in("user_id", args.assignees)
    .gte("start_at", new Date(rangeStart.getTime() - 24 * 3600 * 1000).toISOString())
    .lt("start_at", rangeEndExclusive.toISOString())
    .limit(5000);
  if (existErr) throw existErr;

  const occupied = new Set<string>();
  const existingByDay = new Map<string, string[]>();
  for (const row of existingRows ?? []) {
    const dayKey = localDayKeyFromIso(row.start_at as string);
    const key = `${row.user_id}|${dayKey}`;
    occupied.add(key);
    const list = existingByDay.get(key) ?? [];
    list.push(row.id as string);
    existingByDay.set(key, list);
  }

  const plan = planGeneration({
    templates: ordered,
    userIds: args.assignees,
    startKey: args.startKey,
    endKey: args.endKey,
    pattern: args.pattern,
    customCycle: customCycle ?? undefined,
    mode: args.mode,
    conflict: args.conflict,
    occupiedDayKeys: occupied,
  });

  if (plan.drafts.length === 0) {
    return {
      ok: true as const,
      batchId: null as string | null,
      created: 0,
      skipped: plan.skipped,
      overwritten: 0,
      restDays: plan.restDays,
      capped: plan.capped,
    };
  }

  const batchId = crypto.randomUUID();
  let overwritten = 0;

  if (args.conflict === "overwrite") {
    const toDelete: string[] = [];
    for (const d of plan.drafts) {
      if (!d.overwrite) continue;
      const ids = existingByDay.get(`${d.userId}|${d.dayKey}`) ?? [];
      for (const id of ids) {
        if (!toDelete.includes(id)) toDelete.push(id);
      }
    }
    if (toDelete.length) {
      const { error: delErr } = await args.supabase
        .from("shifts")
        .delete()
        .in("id", toDelete);
      if (delErr) throw delErr;
      overwritten = toDelete.length;
    }
  }

  const rows = plan.drafts.map((d) => ({
    space_id: args.spaceId,
    user_id: d.userId,
    start_at: d.startAt,
    end_at: d.endAt,
    title: d.title,
    note: null as string | null,
    color: d.color,
    text_color: d.textColor,
    template_id: d.templateId,
    source: "generated" as const,
    status: "scheduled" as const,
    generation_batch_id: batchId,
  }));

  // Insert in chunks to stay under payload limits.
  const chunkSize = 100;
  let created = 0;
  let includeBatchId = true;
  let effectiveBatchId: string | null = batchId;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const payload = includeBatchId
      ? chunk
      : chunk.map(({ generation_batch_id: _omit, ...rest }) => rest);
    let { error: insErr } = await args.supabase.from("shifts").insert(payload);
    if (
      includeBatchId &&
      insErr &&
      /generation_batch_id/i.test(insErr.message)
    ) {
      // Column missing — retry remaining without batch id (undo unavailable).
      includeBatchId = false;
      effectiveBatchId = null;
      const stripped = chunk.map(({ generation_batch_id: _omit, ...rest }) => rest);
      ({ error: insErr } = await args.supabase.from("shifts").insert(stripped));
    }
    if (insErr) throw insErr;
    created += chunk.length;
  }

  revalidateSchedule();
  return {
    ok: true as const,
    batchId: effectiveBatchId,
    created,
    skipped: plan.skipped,
    overwritten,
    restDays: plan.restDays,
    capped: plan.capped,
    ...(effectiveBatchId
      ? {}
      : { warning: "generation_batch_id column missing; undo unavailable" }),
  };
}

function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Delete all shifts in a generation batch the caller can edit (RLS). */
export async function undoGenerationBatchAction(input: {
  spaceId: string;
  batchId: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    if (!input.spaceId || !input.batchId) {
      throw new Error("Space and batch are required");
    }

    const { data, error } = await supabase
      .from("shifts")
      .delete()
      .eq("space_id", input.spaceId)
      .eq("generation_batch_id", input.batchId)
      .select("id");

    if (error) {
      if (/generation_batch_id/i.test(error.message)) {
        throw new Error("Batch undo requires generation_batch_id (migration 011)");
      }
      throw error;
    }

    const deleted = data?.length ?? 0;
    revalidateSchedule();
    return { ok: true as const, deleted };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/** Delete shifts with source=generated in range for members the actor can assign. */
export async function clearGeneratedShiftsInRangeAction(input: {
  spaceId: string;
  startKey: string;
  endKey: string;
  userIds: string[];
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (!input.spaceId) throw new Error("Space is required");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startKey) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.endKey)
    ) {
      throw new Error("Invalid date range");
    }
    if (!input.userIds?.length) throw new Error("Pick at least one member");

    const assignees: string[] = [];
    for (const uid of input.userIds) {
      const resolved = await resolveShiftUserId(
        supabase,
        input.spaceId,
        user.id,
        uid
      );
      if (!assignees.includes(resolved)) assignees.push(resolved);
    }

    const rangeStart = new Date(`${input.startKey}T00:00:00`);
    const rangeEndExclusive = new Date(`${input.endKey}T00:00:00`);
    rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 2);

    const { data: rows, error: selErr } = await supabase
      .from("shifts")
      .select("id,user_id,start_at,source,status")
      .eq("space_id", input.spaceId)
      .eq("source", "generated")
      .eq("status", "scheduled")
      .in("user_id", assignees)
      .gte(
        "start_at",
        new Date(rangeStart.getTime() - 24 * 3600 * 1000).toISOString()
      )
      .lt("start_at", rangeEndExclusive.toISOString())
      .limit(5000);
    if (selErr) throw selErr;

    const startKey = input.startKey;
    const endKey = input.endKey;
    const toDelete = (rows ?? []).filter((row) => {
      const day = localDayKeyFromIso(row.start_at as string);
      return day >= startKey && day <= endKey;
    });
    if (!toDelete.length) {
      return { ok: true as const, deleted: 0 };
    }

    const ids = toDelete.map((r) => r.id as string);
    const chunkSize = 100;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("shifts")
        .delete()
        .in("id", chunk)
        .select("id");
      if (error) throw error;
      deleted += data?.length ?? 0;
    }

    revalidateSchedule();
    return { ok: true as const, deleted };
  } catch (err) {
    return { error: formatError(err) };
  }
}
