"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";
import type { ShiftSwapApprovalMode } from "@/lib/types";

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

export async function requestShiftCoverAction(input: {
  shiftId: string;
  targetUserId: string;
  note?: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data, error } = await supabase.rpc("request_shift_cover", {
      p_shift_id: input.shiftId,
      p_target_user_id: input.targetUserId,
      p_note: input.note?.trim() || null,
    });
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const, id: data as string };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function requestShiftSwapAction(input: {
  shiftId: string;
  counterShiftId: string;
  note?: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data, error } = await supabase.rpc("request_shift_swap", {
      p_shift_id: input.shiftId,
      p_counter_shift_id: input.counterShiftId,
      p_note: input.note?.trim() || null,
    });
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const, id: data as string };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function acceptShiftSwapAction(requestId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("accept_shift_swap", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function declineShiftSwapAction(requestId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("decline_shift_swap", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function cancelShiftSwapAction(requestId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("cancel_shift_swap_request", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function setShiftSwapApprovalModeAction(input: {
  spaceId: string;
  mode: ShiftSwapApprovalMode;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    if (input.mode !== "admin_required" && input.mode !== "peer_accept") {
      throw new Error("Invalid approval mode");
    }
    const { error } = await supabase.rpc("set_shift_swap_approval_mode", {
      p_space_id: input.spaceId,
      p_mode: input.mode,
    });
    if (error) throw error;
    revalidateSchedule();
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}
