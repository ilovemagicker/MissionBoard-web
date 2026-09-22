"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";

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

export async function createShiftAction(input: {
  spaceId: string;
  startAt: string;
  endAt: string;
  title?: string;
  note?: string;
  color: string;
  textColor: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (!input.spaceId || !input.startAt || !input.endAt) {
      throw new Error("Space and time range are required");
    }
    if (new Date(input.endAt) <= new Date(input.startAt)) {
      throw new Error("End must be after start");
    }

    const { data, error } = await supabase
      .from("shifts")
      .insert({
        space_id: input.spaceId,
        user_id: user.id,
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
