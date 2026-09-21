"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";
import { generateInviteCode } from "@/lib/invite";
import { ACTIVE_SPACE_COOKIE } from "@/lib/session";

async function requireAuthedClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function createSpaceAction(formData: FormData) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("Space name required");

    const invite_code = generateInviteCode();
    const { data, error } = await supabase
      .from("spaces")
      .insert({
        name,
        invite_code,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Trigger adds owner membership; set as active space
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_SPACE_COOKIE, data.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });

    revalidatePath("/app/spaces");
    revalidatePath("/app", "layout");
    return { ok: true, spaceId: data.id as string, invite_code };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function joinByInviteAction(formData: FormData) {
  try {
    const { supabase, user } = await requireAuthedClient();
    const code = String(formData.get("invite_code") || "").trim();
    if (!code) throw new Error("Invite code required");

    const { data: lookedUp, error: lookupError } = await supabase.rpc(
      "lookup_space_by_invite_code",
      { p_code: code }
    );
    if (lookupError) throw lookupError;

    const space = Array.isArray(lookedUp) ? lookedUp[0] : lookedUp;
    if (!space?.id) throw new Error("Invite code not found");

    const { error } = await supabase.from("space_join_requests").insert({
      space_id: space.id,
      requester_id: user.id,
      status: "pending",
    });
    if (error) throw error;

    revalidatePath("/app/spaces");
    return { ok: true, spaceName: space.name as string };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function acceptJoinRequestAction(requestId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("accept_join_request", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath("/app/spaces");
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function declineJoinRequestAction(requestId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("decline_join_request", {
      p_request_id: requestId,
    });
    if (error) throw error;
    revalidatePath("/app/spaces");
    return { ok: true };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function archiveSpaceAction(spaceId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("archive_space", {
      p_space_id: spaceId,
    });
    if (error) throw error;

    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_SPACE_COOKIE)?.value === spaceId) {
      cookieStore.delete(ACTIVE_SPACE_COOKIE);
    }

    revalidatePath("/app/spaces");
    revalidatePath("/app", "layout");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function unarchiveSpaceAction(spaceId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("unarchive_space", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    revalidatePath("/app/spaces");
    revalidatePath("/app", "layout");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function deleteSpaceAction(spaceId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("delete_space", {
      p_space_id: spaceId,
    });
    if (error) throw error;

    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_SPACE_COOKIE)?.value === spaceId) {
      cookieStore.delete(ACTIVE_SPACE_COOKIE);
    }

    revalidatePath("/app/spaces");
    revalidatePath("/app", "layout");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

export async function transferSpaceOwnershipAction(
  spaceId: string,
  newOwnerId: string
) {
  try {
    const { supabase } = await requireAuthedClient();
    const { error } = await supabase.rpc("transfer_space_ownership", {
      p_space_id: spaceId,
      p_new_owner_id: newOwnerId,
    });
    if (error) throw error;
    revalidatePath("/app/spaces");
    revalidatePath("/app", "layout");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}
