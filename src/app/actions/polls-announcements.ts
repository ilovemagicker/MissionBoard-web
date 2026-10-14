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

function revalidateMission(missionId: string) {
  revalidatePath(`/app/missions/${missionId}`);
  revalidatePath("/app/missions");
  revalidatePath("/app/activity");
}


export async function createMissionPollAction(input: {
  missionId: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
  anonymous: boolean;
  deadlineAt: string | null;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    const question = input.question.trim();
    const options = input.options.map((o) => o.trim()).filter(Boolean);
    if (!question) throw new Error("Question required");
    if (options.length < 2 || options.length > 10) {
      throw new Error("A poll needs 2–10 options");
    }
    const { data, error } = await supabase.rpc("create_mission_poll", {
      p_mission_id: input.missionId,
      p_question: question,
      p_options: options,
      p_allow_multiple: input.allowMultiple,
      p_anonymous: input.anonymous,
      p_deadline_at: input.deadlineAt,
    });
    if (error) throw error;
    revalidateMission(input.missionId);
    return { ok: true as const, pollId: data as string };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function castPollVoteAction(pollId: string, optionIds: string[], missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("cast_poll_vote", {
      p_poll_id: pollId,
      p_option_ids: optionIds,
    });
    if (error) throw error;
    revalidateMission(missionId);
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function closeMissionPollAction(
  pollId: string,
  missionId: string,
  finalOptionIds: string[] | null
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("close_mission_poll", {
      p_poll_id: pollId,
      p_final_option_ids: finalOptionIds,
    });
    if (error) throw error;
    revalidateMission(missionId);
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function deleteMissionPollAction(pollId: string, missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("delete_mission_poll", {
      p_poll_id: pollId,
    });
    if (error) throw error;
    revalidateMission(missionId);
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function createMissionAnnouncementAction(input: {
  missionId: string;
  spaceId: string;
  body: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const body = input.body.trim();
    if (!body) throw new Error("Body required");
    const { error } = await supabase.from("mission_announcements").insert({
      mission_id: input.missionId,
      space_id: input.spaceId,
      author_id: user.id,
      body: body.slice(0, 2000),
      pinned: true,
    });
    if (error) throw error;
    revalidateMission(input.missionId);
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function updateMissionAnnouncementAction(id: string, body: string, missionId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Body required");
    const { error } = await supabase
      .from("mission_announcements")
      .update({ body: trimmed.slice(0, 2000) })
      .eq("id", id);
    if (error) throw error;
    revalidateMission(missionId);
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function deleteAnnouncementAction(id: string, missionId: string | null) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.from("mission_announcements").delete().eq("id", id);
    if (error) throw error;
    if (missionId) revalidateMission(missionId);
    else {
      revalidatePath("/app/missions");
      revalidatePath("/app/activity");
    }
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function markAnnouncementsReadAction(ids: string[]) {
  try {
    if (ids.length === 0) return { ok: true as const };
    const { supabase, user } = await requireAuthedClient();
    const rows = ids.map((id) => ({
      announcement_id: id,
      user_id: user.id,
    }));
    const { error } = await supabase
      .from("mission_announcement_reads")
      .upsert(rows, { onConflict: "announcement_id,user_id" });
    if (error) throw error;
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function createSpaceAnnouncementAction(input: {
  spaceId: string;
  title: string | null;
  body: string;
}) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const body = input.body.trim();
    if (!body) throw new Error("Body required");
    const title = input.title?.trim() || null;
    const { error } = await supabase.from("mission_announcements").insert({
      mission_id: null,
      space_id: input.spaceId,
      author_id: user.id,
      title: title ? title.slice(0, 120) : null,
      body: body.slice(0, 2000),
      pinned: true,
    });
    if (error) throw error;
    revalidatePath("/app/missions");
    revalidatePath("/app/activity");
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function updateSpaceAnnouncementAction(input: {
  id: string;
  title: string | null;
  body: string;
}) {
  try {
    const { supabase } = await requireAuthedClient();
    const body = input.body.trim();
    if (!body) throw new Error("Body required");
    const title = input.title?.trim() || null;
    const { error } = await supabase
      .from("mission_announcements")
      .update({
        title: title ? title.slice(0, 120) : null,
        body: body.slice(0, 2000),
      })
      .eq("id", input.id)
      .is("mission_id", null);
    if (error) throw error;
    revalidatePath("/app/missions");
    revalidatePath("/app/activity");
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function dismissSpaceAnnouncementAction(id: string, dismissed: boolean) {
  try {
    const { supabase, user } = await requireAuthedClient();
    if (dismissed) {
      const { error } = await supabase.from("announcement_dismissals").upsert(
        { announcement_id: id, user_id: user.id },
        { onConflict: "announcement_id,user_id" }
      );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("announcement_dismissals")
        .delete()
        .eq("announcement_id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    }
    revalidatePath("/app/missions");
    return { ok: true as const };
  } catch (e) {
    return { error: formatError(e) };
  }
}
