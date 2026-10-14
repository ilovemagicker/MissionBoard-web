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
