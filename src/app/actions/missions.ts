"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";
import type { MissionStatus } from "@/lib/types";

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

    if (!spaceId || !title) throw new Error("Title and space are required");

    const { data, error } = await supabase
      .from("missions")
      .insert({
        space_id: spaceId,
        title,
        description,
        start_date: startDate,
        due_date: dueDate,
        status: "todo",
        creator_id: user.id,
      })
      .select("id")
      .single();

    if (error) throw error;
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
    if (!missionId || !title) throw new Error("Step title required");

    const { data: existing } = await supabase
      .from("mission_steps")
      .select("order_index")
      .eq("mission_id", missionId)
      .order("order_index", { ascending: false })
      .limit(1);

    const nextIndex =
      existing && existing.length > 0 ? (existing[0].order_index as number) + 1 : 0;

    const { error } = await supabase.from("mission_steps").insert({
      mission_id: missionId,
      title,
      order_index: nextIndex,
      is_done: false,
    });
    if (error) throw error;
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
    const { supabase, user } = await requireAuthedClient();
    const { error } = await supabase
      .from("mission_steps")
      .update({ assignee_id: claim ? user.id : null })
      .eq("id", stepId);
    if (error) throw error;
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
    const { error } = await supabase
      .from("mission_steps")
      .update({ assignee_id: assigneeId || null })
      .eq("id", stepId);
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
