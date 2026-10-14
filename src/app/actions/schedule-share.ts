"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError, isSchemaMissingError } from "@/lib/errors";
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

/** Admin: return active family share code, creating one if needed. */
export async function ensureScheduleShareCodeAction(spaceId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data, error } = await supabase.rpc("ensure_schedule_share_code", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    revalidatePath("/app/schedule");
    return { ok: true as const, code: String(data) };
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return {
        error:
          "schedule_share_codes / ensure_schedule_share_code missing — apply supabase/migrations/015_schedule_share.sql",
      };
    }
    return { error: formatError(err) };
  }
}

/** Admin: revoke active code and issue a new one. */
export async function rotateScheduleShareCodeAction(spaceId: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const { data, error } = await supabase.rpc("rotate_schedule_share_code", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    revalidatePath("/app/schedule");
    return { ok: true as const, code: String(data) };
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return {
        error:
          "schedule_share_codes / rotate_schedule_share_code missing — apply supabase/migrations/015_schedule_share.sql",
      };
    }
    return { error: formatError(err) };
  }
}

/** Authenticated: preview space name for a family share code. */
export async function lookupScheduleShareCodeAction(code: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const trimmed = code.trim();
    if (!trimmed) throw new Error("Share code required");
    const { data, error } = await supabase.rpc("lookup_schedule_share_code", {
      p_code: trimmed,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.space_id) throw new Error("Schedule share code not found");
    return {
      ok: true as const,
      spaceId: row.space_id as string,
      spaceName: (row.space_name as string) ?? "",
      code: (row.code as string) ?? trimmed,
    };
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return {
        error:
          "lookup_schedule_share_code missing — apply supabase/migrations/015_schedule_share.sql",
      };
    }
    return { error: formatError(err) };
  }
}

/** Authenticated: redeem family share code → join as role=viewer. */
export async function joinAsScheduleViewerAction(code: string) {
  try {
    const { supabase } = await requireAuthedClient();
    const trimmed = code.trim();
    if (!trimmed) throw new Error("Share code required");

    const { data, error } = await supabase.rpc("join_as_schedule_viewer", {
      p_code: trimmed,
    });
    if (error) throw error;
    const spaceId = String(data);
    if (!spaceId) throw new Error("Schedule share code not found");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_SPACE_COOKIE, spaceId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });

    revalidatePath("/app/spaces");
    revalidatePath("/app/schedule");
    revalidatePath("/app", "layout");
    return { ok: true as const, spaceId };
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return {
        error:
          "join_as_schedule_viewer missing — apply supabase/migrations/015_schedule_share.sql",
      };
    }
    return { error: formatError(err) };
  }
}
