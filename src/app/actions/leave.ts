"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";

const ALLOWED_FRACTIONS = new Set([0.25, 0.5, 0.75, 1]);

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

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Invalid date");
  }
  return trimmed;
}

function normalizeFraction(value: number): number {
  const n = Number(value);
  if (!ALLOWED_FRACTIONS.has(n)) {
    throw new Error("day_fraction must be 0.25, 0.5, 0.75, or 1");
  }
  return n;
}

export async function createLeaveAction(input: {
  spaceId: string;
  startDate: string;
  endDate: string;
  dayFraction: number;
  note?: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const start = normalizeDate(input.startDate);
    const end = normalizeDate(input.endDate);
    if (end < start) throw new Error("End date must be on or after start");
    const dayFraction = normalizeFraction(input.dayFraction);

    const { data, error } = await supabase
      .from("leave_entries")
      .insert({
        space_id: input.spaceId,
        user_id: user.id,
        start_date: start,
        end_date: end,
        day_fraction: dayFraction,
        note: input.note?.trim() || null,
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

export async function updateLeaveAction(input: {
  id: string;
  startDate: string;
  endDate: string;
  dayFraction: number;
  note?: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    const start = normalizeDate(input.startDate);
    const end = normalizeDate(input.endDate);
    if (end < start) throw new Error("End date must be on or after start");
    const dayFraction = normalizeFraction(input.dayFraction);

    const { error } = await supabase
      .from("leave_entries")
      .update({
        start_date: start,
        end_date: end,
        day_fraction: dayFraction,
        note: input.note?.trim() || null,
      })
      .eq("id", input.id);

    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function deleteLeaveAction(id: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.from("leave_entries").delete().eq("id", id);
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}
