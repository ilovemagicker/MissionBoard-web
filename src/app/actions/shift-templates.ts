"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";
import { appliedRangeOnDay } from "@/lib/shift-templates";

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

function clampMinutes(n: number) {
  return Math.min(1439, Math.max(0, Math.floor(n)));
}

export async function createShiftTemplateAction(input: {
  spaceId: string;
  name: string;
  defaultStartMinutes: number;
  defaultEndMinutes: number;
  color: string;
  textColor: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const name = input.name.trim();
    if (!input.spaceId || !name) {
      throw new Error("Space and name are required");
    }
    const start = clampMinutes(input.defaultStartMinutes);
    const end = clampMinutes(input.defaultEndMinutes);
    const row = {
      space_id: input.spaceId,
      created_by: user.id,
      name,
      default_start_minutes: start,
      default_end_minutes: end,
      color: input.color || "#3B82F6",
      text_color: input.textColor || "#FFFFFF",
      owner_user_id: user.id,
    };

    let { data, error } = await supabase
      .from("shift_templates")
      .insert(row)
      .select("id")
      .single();

    // Pre-028: owner_user_id column missing → retry without it.
    if (error && /owner_user_id/i.test(error.message)) {
      const legacy = {
        space_id: row.space_id,
        created_by: row.created_by,
        name: row.name,
        default_start_minutes: row.default_start_minutes,
        default_end_minutes: row.default_end_minutes,
        color: row.color,
        text_color: row.text_color,
      };
      ({ data, error } = await supabase
        .from("shift_templates")
        .insert(legacy)
        .select("id")
        .single());
    }

    if (error) throw error;
    if (!data?.id) throw new Error("Create failed");
    revalidateSchedule();
    return { ok: true as const, id: data.id as string };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function updateShiftTemplateAction(input: {
  id: string;
  name: string;
  defaultStartMinutes: number;
  defaultEndMinutes: number;
  color: string;
  textColor: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    const { error } = await supabase
      .from("shift_templates")
      .update({
        name,
        default_start_minutes: clampMinutes(input.defaultStartMinutes),
        default_end_minutes: clampMinutes(input.defaultEndMinutes),
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

export async function deleteShiftTemplateAction(id: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase
      .from("shift_templates")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/** Apply a template as a shift for the current user on the given local day (YYYY-MM-DD). */
export async function applyShiftTemplateAction(input: {
  spaceId: string;
  templateId: string;
  dayKey: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (!input.spaceId || !input.templateId || !/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)) {
      throw new Error("Space, template, and day are required");
    }

    const { data: template, error: fetchError } = await supabase
      .from("shift_templates")
      .select(
        "id,space_id,name,default_start_minutes,default_end_minutes,color,text_color"
      )
      .eq("id", input.templateId)
      .eq("space_id", input.spaceId)
      .single();

    if (fetchError) throw fetchError;
    if (!template) throw new Error("Template not found");

    const { start, end } = appliedRangeOnDay(
      input.dayKey,
      template.default_start_minutes as number,
      template.default_end_minutes as number
    );

    const { data, error } = await supabase
      .from("shifts")
      .insert({
        space_id: input.spaceId,
        user_id: user.id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        title: (template.name as string)?.trim() || null,
        note: null,
        color: (template.color as string) || "#3B82F6",
        text_color: (template.text_color as string) || "#FFFFFF",
        template_id: template.id as string,
        source: "manual",
        status: "scheduled",
      })
      .select("id")
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error("Apply failed");
    revalidateSchedule();
    return { ok: true as const, id: data.id as string };
  } catch (err) {
    return { error: formatError(err) };
  }
}
